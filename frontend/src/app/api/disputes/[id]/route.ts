import { NextResponse } from "next/server";
import {
  evaluateDisputeOnChain,
  getDisputeResolutionOnChain,
  isConfirmedUnresolvedError,
  TRADESURE_CONTRACT_ADDRESS,
} from "@/lib/genlayer";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchDisputeByIdFromSupabase,
  insertDisputeSubmissionIntoSupabase,
  recordOnChainResolutionInSupabase,
} from "@/lib/supabaseService";

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Durable database persistence is unavailable. Supabase credentials must be configured." },
        { status: 503 }
      );
    }

    const data = await fetchDisputeByIdFromSupabase(id);
    if (!data.dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Synchronize with authoritative on-chain resolution if available
    try {
      const onchainRes = await getDisputeResolutionOnChain(id);
      if (
        onchainRes &&
        (data.dispute.status !== "RESOLVED" ||
          data.dispute.outcome !== onchainRes.outcome ||
          data.dispute.resolution_summary !== onchainRes.rationale)
      ) {
        await recordOnChainResolutionInSupabase({
          disputeId: id,
          orderId: data.dispute.order_id,
          outcome: onchainRes.outcome,
          txHash: data.dispute.onchain_tx_hash || undefined,
          contractAddress: TRADESURE_CONTRACT_ADDRESS,
          rationale: onchainRes.rationale,
          status: "FINALIZED",
          executionResult: {
            outcome: onchainRes.outcome,
            rationale: onchainRes.rationale,
            evidence_cited: onchainRes.evidence_cited,
            criteria_applied: onchainRes.criteria_applied,
          },
        });
        const synced = await fetchDisputeByIdFromSupabase(id);
        return NextResponse.json({ ...synced, storage: "supabase" });
      }
    } catch {
      // Unresolved disputes on-chain revert as expected; return database state
    }

    return NextResponse.json({ ...data, storage: "supabase" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, content, submission_type } = body;

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Durable database persistence is unavailable. Supabase credentials must be configured." },
        { status: 503 }
      );
    }

    // 1. Add response or rebuttal
    if (action === "add_submission") {
      if (!content || !String(content).trim()) {
        return NextResponse.json({ error: "Submission content is required" }, { status: 400 });
      }

      const subId = crypto.randomUUID();
      const subType = submission_type || "buyer_rebuttal";
      const submittedBy = subType.includes("seller") ? "usr-seller-01" : "usr-buyer-01";

      const submission = await insertDisputeSubmissionIntoSupabase(id, {
        id: subId,
        submittedBy,
        submissionType: subType,
        content: String(content).trim(),
      });
      return NextResponse.json({ submission, storage: "supabase" });
    }

    // 2. Trigger Genuine GenLayer Intelligent Contract Resolution
    if (action === "resolve_onchain") {
      const data = await fetchDisputeByIdFromSupabase(id);
      if (!data.dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

      // Check if authoritative resolution already exists on-chain
      let existingOnchainRes = null;
      try {
        existingOnchainRes = await getDisputeResolutionOnChain(id);
      } catch (err: any) {
        if (!isConfirmedUnresolvedError(err)) {
          // Never submit another resolve_dispute transaction merely because an on-chain read failed
          return NextResponse.json(
            {
              error: `RPC error querying on-chain resolution for dispute ${id}: ${err.message}. Resolution retry aborted to protect on-chain state.`,
            },
            { status: 502 }
          );
        }
        existingOnchainRes = null;
      }

      if (existingOnchainRes) {
        // Persist authoritative on-chain outcome idempotently
        await recordOnChainResolutionInSupabase({
          disputeId: id,
          orderId: data.dispute.order_id,
          outcome: existingOnchainRes.outcome,
          txHash: data.dispute.onchain_tx_hash || undefined,
          contractAddress: TRADESURE_CONTRACT_ADDRESS,
          rationale: existingOnchainRes.rationale,
          status: "FINALIZED",
          executionResult: {
            outcome: existingOnchainRes.outcome,
            rationale: existingOnchainRes.rationale,
            evidence_cited: existingOnchainRes.evidence_cited,
            criteria_applied: existingOnchainRes.criteria_applied,
          },
        });

        const synced = await fetchDisputeByIdFromSupabase(id);
        return NextResponse.json({
          dispute: synced.dispute,
          evaluation: {
            success: true,
            outcome: existingOnchainRes.outcome,
            rationale: existingOnchainRes.rationale,
            txHash: synced.dispute?.onchain_tx_hash || "",
            contractAddress: TRADESURE_CONTRACT_ADDRESS,
            consensusStatus: "FINALIZED",
            evidenceCited: existingOnchainRes.evidence_cited || [],
            criteriaApplied: existingOnchainRes.criteria_applied || "",
          },
          storage: "supabase",
        });
      }

      const orderId = data.dispute.order_id;
      const buyerId = data.order?.buyer_id || "usr-buyer-01";
      const sellerId = data.order?.seller_id || "usr-seller-01";
      const latestAgreement = data.agreements[data.agreements.length - 1];
      const agreementHash = latestAgreement?.terms_commitment_hash || "0xtermscommitment1234567890";
      const agreementTerms = latestAgreement
        ? `${latestAgreement.condition_requirements} | Acceptance: ${latestAgreement.acceptance_criteria}`
        : "Standard delivery acceptance criteria";
      const claimSummary = data.dispute.claim_summary;
      const evidenceManifest = data.evidence.map((e) => ({
        id: e.id,
        type: e.evidence_type,
        sha256: e.file_bytes_sha256,
        description: e.description,
      }));

      // Execute on-chain GenLayer StudioNet transaction and fetch authoritative resolution
      // If a resolution transaction was already broadcast, evaluateDisputeOnChain awaits its finalization
      const result = await evaluateDisputeOnChain({
        disputeId: id,
        orderId,
        buyerId,
        sellerId,
        agreementHash,
        agreementTerms,
        claimSummary,
        evidenceManifest,
        existingTxHash: data.dispute.onchain_tx_hash || undefined,
        onTransactionBroadcast: async (txHash) => {
          const { error: broadcastErr } = await getSupabaseAdmin()
            .from("disputes")
            .update({ onchain_tx_hash: txHash })
            .eq("id", id);
          if (broadcastErr) {
            console.error("Supabase failed to persist broadcast txHash:", broadcastErr.message);
            throw new Error(`Failed to persist broadcast txHash to database: ${broadcastErr.message}`);
          }
        },
      });

      // Preserve actual resolution transaction hash if one was broadcast even if receipt verification threw
      if (!result.success && result.txHash) {
        try {
          const { error: fallbackErr } = await getSupabaseAdmin()
            .from("disputes")
            .update({ onchain_tx_hash: result.txHash })
            .eq("id", id);
          if (fallbackErr) {
            console.error("Supabase failed to persist fallback txHash:", fallbackErr.message);
          }
        } catch (e: any) {
          console.error("Exception updating dispute with fallback txHash:", e.message || e);
        }
      }

      if (
        result.success &&
        result.outcome &&
        (result.outcome === "BUYER_SUPPORTED" ||
          result.outcome === "SELLER_SUPPORTED" ||
          result.outcome === "INCONCLUSIVE")
      ) {
        const authoritativeTxHash =
          result.txHash || data.dispute.onchain_tx_hash || undefined;

        await recordOnChainResolutionInSupabase({
          disputeId: id,
          orderId,
          outcome: result.outcome,
          txHash: authoritativeTxHash,
          contractAddress: String(result.contractAddress),
          rationale: String(result.rationale),
          status: result.consensusStatus === "FINALIZED" ? "FINALIZED" : "ACCEPTED",
          executionResult: {
            outcome: result.outcome,
            rationale: result.rationale,
            evidence_cited: result.evidenceCited,
            criteria_applied: result.criteriaApplied,
          },
        });

        const updated = await fetchDisputeByIdFromSupabase(id);
        const verifiedTxHash = updated.dispute?.onchain_tx_hash || null;
        return NextResponse.json({
          dispute: updated.dispute,
          evaluation: {
            ...result,
            txHash: verifiedTxHash,
          },
          storage: "supabase",
        });
      } else {
        return NextResponse.json(
          {
            error:
              result.error ||
              "Authoritative on-chain dispute resolution could not be completed or verified.",
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
