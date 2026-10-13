import { NextResponse } from "next/server";
import { evaluateDisputeOnChain } from "@/lib/genlayer";
import { isSupabaseConfigured } from "@/lib/supabase";
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

      // If already resolved in Supabase, return the persisted authoritative outcome idempotently
      if (data.dispute.status === "RESOLVED" && data.dispute.outcome) {
        return NextResponse.json({
          dispute: data.dispute,
          evaluation: {
            success: true,
            outcome: data.dispute.outcome,
            rationale: data.dispute.resolution_summary || "Resolved on-chain",
            txHash: data.dispute.onchain_tx_hash || "",
            contractAddress: data.dispute.onchain_contract_address || "",
            consensusStatus: "FINALIZED",
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
      const result = await evaluateDisputeOnChain({
        disputeId: id,
        orderId,
        buyerId,
        sellerId,
        agreementHash,
        agreementTerms,
        claimSummary,
        evidenceManifest,
      });

      if (
        result.success &&
        result.outcome &&
        (result.outcome === "BUYER_SUPPORTED" ||
          result.outcome === "SELLER_SUPPORTED" ||
          result.outcome === "INCONCLUSIVE")
      ) {
        await recordOnChainResolutionInSupabase({
          disputeId: id,
          orderId,
          outcome: result.outcome,
          txHash: String(result.txHash),
          contractAddress: String(result.contractAddress),
          rationale: String(result.rationale),
          status: "FINALIZED",
          executionResult: {
            outcome: result.outcome,
            rationale: result.rationale,
            evidence_cited: result.evidenceCited,
            criteria_applied: result.criteriaApplied,
          },
        });

        const updated = await fetchDisputeByIdFromSupabase(id);
        return NextResponse.json({ dispute: updated.dispute, evaluation: result, storage: "supabase" });
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
