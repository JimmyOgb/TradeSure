import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { evaluateDisputeOnChain } from "@/lib/genlayer";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dispute = db.disputes.get(id);
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  const body = await req.json();
  const { action, content, submission_type } = body;

  // Add response or rebuttal
  if (action === "add_submission") {
    if (!content) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }
    const existing = db.disputeSubmissions.get(id) || [];
    const newSub = {
      id: `sub-${Date.now().toString(36)}`,
      dispute_id: id,
      submitted_by: submission_type?.includes("seller") ? "usr-seller-01" : "usr-buyer-01",
      submitted_by_name: submission_type?.includes("seller") ? "Seller Organization" : "Buyer",
      submission_type: submission_type || "buyer_rebuttal",
      content,
      created_at: new Date().toISOString(),
    };
    existing.push(newSub);
    db.disputeSubmissions.set(id, existing);
    return NextResponse.json({ submission: newSub });
  }

  // Trigger Genuine GenLayer Intelligent Contract Resolution
  if (action === "resolve_onchain") {
    dispute.status = "UNDER_REVIEW";
    const order = db.orders.get(dispute.order_id);
    const agreements = order ? db.agreements.get(order.id) || [] : [];
    const activeAgreement = agreements[agreements.length - 1];
    const evidenceList = order ? db.evidence.get(order.id) || [] : [];

    const evidenceManifest = evidenceList.map((e) => ({
      id: e.id,
      type: e.evidence_type,
      sha256: e.file_bytes_sha256,
      description: e.description,
    }));

    const result = await evaluateDisputeOnChain({
      disputeId: dispute.id,
      orderId: dispute.order_id,
      buyerId: order?.buyer_id || "buyer",
      sellerId: order?.seller_id || "seller",
      agreementHash: activeAgreement?.terms_commitment_hash || "0x",
      agreementTerms: `${activeAgreement?.condition_requirements} | Criteria: ${activeAgreement?.acceptance_criteria}`,
      claimSummary: dispute.claim_summary,
      evidenceManifest,
    });

    if (result.success && result.outcome) {
      dispute.status = "RESOLVED";
      dispute.outcome = result.outcome;
      dispute.onchain_tx_hash = String(result.txHash);
      dispute.onchain_contract_address = String(result.contractAddress);
      dispute.resolution_summary = String(result.rationale);
      dispute.resolved_at = new Date().toISOString();

      if (order) {
        order.status = "RESOLVED";
      }

      return NextResponse.json({
        dispute,
        evaluation: result,
      });
    } else {
      dispute.status = "DISPUTE_OPEN";
      return NextResponse.json(
        { error: result.error || "Evaluation failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
