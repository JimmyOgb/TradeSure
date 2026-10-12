import { NextResponse } from "next/server";
import {
  getEscrowOnChain,
  createEscrowOnChain,
  depositEscrowTokensOnChain,
  submitMilestoneEvidenceOnChain,
  releaseMilestoneOnChain,
  openEscrowDisputeOnChain,
  settleEscrowDisputeOnChain,
  refundBuyerOnChain,
  TRADESURE_ESCROW_CONTRACT_ADDRESS,
  WETH_CONTRACT_ADDRESS,
} from "@/lib/genlayer";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agreementId = searchParams.get("agreement_id");

    if (!agreementId) {
      return NextResponse.json({ error: "Missing agreement_id parameter" }, { status: 400 });
    }

    const onchainState = await getEscrowOnChain(agreementId);
    if (!onchainState) {
      return NextResponse.json({
        escrow: null,
        status: "NOT_CREATED",
        contract_address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
        token_address: WETH_CONTRACT_ADDRESS,
      });
    }

    return NextResponse.json({
      escrow: onchainState,
      contract_address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
      token_address: WETH_CONTRACT_ADDRESS,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to query on-chain escrow state" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, agreement_id, ...params } = body;

    if (!action || !agreement_id) {
      return NextResponse.json({ error: "Missing action or agreement_id" }, { status: 400 });
    }

    switch (action) {
      case "create": {
        const { buyer, seller, terms_hash, total_amount_wei, milestones } = params;
        if (!buyer || !seller || !terms_hash || !total_amount_wei || !milestones) {
          return NextResponse.json({ error: "Missing required escrow creation parameters" }, { status: 400 });
        }
        const result = await createEscrowOnChain({
          agreementId: agreement_id,
          buyer,
          seller,
          termsHash: terms_hash,
          totalAmountWei: total_amount_wei,
          milestones,
        });
        return NextResponse.json({ success: true, ...result });
      }

      case "deposit": {
        const { amount_wei, signer_private_key } = params;
        if (!amount_wei) {
          return NextResponse.json({ error: "Missing amount_wei parameter" }, { status: 400 });
        }
        const result = await depositEscrowTokensOnChain({
          agreementId: agreement_id,
          amountWei: amount_wei,
          signerPrivateKey: signer_private_key,
          faucetIfEmpty: true,
        });
        return NextResponse.json({ success: true, ...result });
      }

      case "submit_milestone": {
        const { milestone_id, evidence_hash, evidence_summary, signer_private_key } = params;
        if (!milestone_id || !evidence_hash) {
          return NextResponse.json({ error: "Missing milestone_id or evidence_hash" }, { status: 400 });
        }
        const result = await submitMilestoneEvidenceOnChain({
          agreementId: agreement_id,
          milestoneId: milestone_id,
          evidenceHash: evidence_hash,
          evidenceSummary: evidence_summary || "Milestone evidence verified",
          signerPrivateKey: signer_private_key,
        });
        return NextResponse.json({ success: true, ...result });
      }

      case "release_milestone": {
        const { milestone_id, signer_private_key } = params;
        if (!milestone_id) {
          return NextResponse.json({ error: "Missing milestone_id parameter" }, { status: 400 });
        }
        const result = await releaseMilestoneOnChain({
          agreementId: agreement_id,
          milestoneId: milestone_id,
          signerPrivateKey: signer_private_key,
        });
        return NextResponse.json({ success: true, ...result });
      }

      case "open_dispute": {
        const { milestone_id, dispute_id, signer_private_key } = params;
        if (!milestone_id || !dispute_id) {
          return NextResponse.json({ error: "Missing milestone_id or dispute_id" }, { status: 400 });
        }
        const result = await openEscrowDisputeOnChain({
          agreementId: agreement_id,
          milestoneId: milestone_id,
          disputeId: dispute_id,
          signerPrivateKey: signer_private_key,
        });
        return NextResponse.json({ success: true, ...result });
      }

      case "settle_dispute": {
        const { signer_private_key } = params;
        const result = await settleEscrowDisputeOnChain({
          agreementId: agreement_id,
          signerPrivateKey: signer_private_key,
        });
        return NextResponse.json({ success: true, ...result });
      }

      case "refund_buyer": {
        const { signer_private_key } = params;
        const result = await refundBuyerOnChain({
          agreementId: agreement_id,
          signerPrivateKey: signer_private_key,
        });
        return NextResponse.json({ success: true, ...result });
      }

      default:
        return NextResponse.json({ error: `Unsupported escrow action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Escrow operation failed" }, { status: 500 });
  }
}
