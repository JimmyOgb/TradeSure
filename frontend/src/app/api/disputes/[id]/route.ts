import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { evaluateDisputeOnChain } from "@/lib/genlayer";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchDisputeByIdFromSupabase,
  insertDisputeSubmissionIntoSupabase,
  recordOnChainResolutionInSupabase,
} from "@/lib/supabaseService";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (isSupabaseConfigured()) {
      const data = await fetchDisputeByIdFromSupabase(id);
      if (!data.dispute) {
        return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
      }
      return NextResponse.json({ ...data, storage: "supabase" });
    }

    const dispute = db.disputes.get(id);
    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    const order = db.orders.get(dispute.order_id);
    const evidence = order ? db.evidence.get(order.id) || [] : [];
    const agreements = order ? db.agreements.get(order.id) || [] : [];
    const submissions = db.disputeSubmissions.get(id) || [];

    return NextResponse.json({
      dispute,
      order,
      evidence,
      agreements,
      submissions,
      storage: "in_memory",
    });
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

    // 1. Add response or rebuttal
    if (action === "add_submission") {
      if (!content || !String(content).trim()) {
        return NextResponse.json({ error: "Submission content is required" }, { status: 400 });
      }

      const subId = `sub-${Date.now().toString(36)}`;
      const subType = submission_type || "buyer_rebuttal";
      const submittedBy = subType.includes("seller") ? "usr-seller-01" : "usr-buyer-01";

      if (isSupabaseConfigured()) {
        const submission = await insertDisputeSubmissionIntoSupabase(id, {
          id: subId,
          submittedBy,
          submissionType: subType,
          content: String(content).trim(),
        });
        return NextResponse.json({ submission, storage: "supabase" });
      }

      const dispute = db.disputes.get(id);
      if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

      const existing = db.disputeSubmissions.get(id) || [];
      const newSub = {
        id: subId,
        dispute_id: id,
        submitted_by: submittedBy,
        submitted_by_name: subType.includes("seller") ? "Seller Organization" : "Buyer",
        submission_type: subType,
        content: String(content).trim(),
        created_at: new Date().toISOString(),
      };
      existing.push(newSub);
      db.disputeSubmissions.set(id, existing);
      return NextResponse.json({ submission: newSub, storage: "in_memory" });
    }

    // 2. Trigger Genuine GenLayer Intelligent Contract Resolution
    if (action === "resolve_onchain") {
      let orderId = "";
      let buyerId = "";
      let sellerId = "";
      let agreementHash = "0x";
      let agreementTerms = "";
      let claimSummary = "";
      let evidenceManifest: Array<{ id: string; type: string; sha256: string; description: string }> = [];

      if (isSupabaseConfigured()) {
        const data = await fetchDisputeByIdFromSupabase(id);
        if (!data.dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

        orderId = data.dispute.order_id;
        buyerId = data.order?.buyer_id || "usr-buyer-01";
        sellerId = data.order?.seller_id || "usr-seller-01";
        const latestAgreement = data.agreements[data.agreements.length - 1];
        agreementHash = latestAgreement?.terms_commitment_hash || "0xtermscommitment1234567890";
        agreementTerms = latestAgreement
          ? `${latestAgreement.condition_requirements} | Acceptance: ${latestAgreement.acceptance_criteria}`
          : "Standard delivery acceptance criteria";
        claimSummary = data.dispute.claim_summary;
        evidenceManifest = data.evidence.map((e) => ({
          id: e.id,
          type: e.evidence_type,
          sha256: e.file_bytes_sha256,
          description: e.description,
        }));
      } else {
        const dispute = db.disputes.get(id);
        if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

        orderId = dispute.order_id;
        const order = db.orders.get(orderId);
        buyerId = order?.buyer_id || "usr-buyer-01";
        sellerId = order?.seller_id || "usr-seller-01";
        const agreements = order ? db.agreements.get(order.id) || [] : [];
        const latestAgreement = agreements[agreements.length - 1];
        agreementHash = latestAgreement?.terms_commitment_hash || "0xtermscommitment1234567890";
        agreementTerms = latestAgreement
          ? `${latestAgreement.condition_requirements} | Criteria: ${latestAgreement.acceptance_criteria}`
          : "Standard delivery acceptance criteria";
        claimSummary = dispute.claim_summary;
        const evidenceList = order ? db.evidence.get(order.id) || [] : [];
        evidenceManifest = evidenceList.map((e) => ({
          id: e.id,
          type: e.evidence_type,
          sha256: e.file_bytes_sha256,
          description: e.description,
        }));
      }

      // Execute on-chain GenLayer StudioNet transaction
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

      if (result.success && result.outcome) {
        if (isSupabaseConfigured()) {
          await recordOnChainResolutionInSupabase({
            disputeId: id,
            orderId,
            outcome: result.outcome,
            txHash: String(result.txHash),
            contractAddress: String(result.contractAddress),
            rationale: String(result.rationale),
          });

          const updated = await fetchDisputeByIdFromSupabase(id);
          return NextResponse.json({ dispute: updated.dispute, evaluation: result, storage: "supabase" });
        }

        const dispute = db.disputes.get(id);
        if (dispute) {
          dispute.status = "RESOLVED";
          dispute.outcome = result.outcome;
          dispute.onchain_tx_hash = String(result.txHash);
          dispute.onchain_contract_address = String(result.contractAddress);
          dispute.resolution_summary = String(result.rationale);
          dispute.resolved_at = new Date().toISOString();
        }

        const order = db.orders.get(orderId);
        if (order) order.status = "RESOLVED";

        return NextResponse.json({
          dispute,
          evaluation: result,
          storage: "in_memory",
        });
      } else {
        return NextResponse.json(
          { error: result.error || "On-chain GenLayer evaluation failed" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
