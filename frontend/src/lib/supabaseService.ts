import { getSupabaseAdmin, EVIDENCE_STORAGE_BUCKET } from "./supabase";
import { Order, AgreementVersion, EvidenceItem, Dispute, DisputeSubmission } from "./types";

/**
 * TradeSure Supabase Database & Storage Service
 * Implements persistent operations against 20261011_tradesure_schema.sql
 */

export async function fetchOrdersFromSupabase(organizationId?: string): Promise<Order[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error fetching orders: ${error.message}`);
  return (data || []) as Order[];
}

export async function fetchOrderByIdFromSupabase(orderId: string): Promise<{
  order: Order | null;
  agreements: AgreementVersion[];
  evidence: EvidenceItem[];
}> {
  const supabase = getSupabaseAdmin();

  const [orderRes, agreementsRes, evidenceRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
    supabase.from("agreement_versions").select("*").eq("order_id", orderId).order("version_number", { ascending: true }),
    supabase.from("evidence").select("*").eq("order_id", orderId).order("submitted_at", { ascending: false }),
  ]);

  if (orderRes.error) throw new Error(`Supabase error fetching order: ${orderRes.error.message}`);

  return {
    order: (orderRes.data as Order) || null,
    agreements: (agreementsRes.data as AgreementVersion[]) || [],
    evidence: (evidenceRes.data as EvidenceItem[]) || [],
  };
}

export async function insertOrderIntoSupabase(
  newOrder: Order,
  terms: {
    product_description: string;
    quantity: number;
    condition_requirements: string;
    acceptance_criteria: string;
    permitted_evidence_types: string[];
    dispute_procedure: string;
    terms_commitment_hash: string;
  }
): Promise<{ order: Order; agreement_id: string }> {
  const supabase = getSupabaseAdmin();

  const { data: orderData, error: orderErr } = await supabase
    .from("orders")
    .insert([
      {
        id: newOrder.id,
        order_reference: newOrder.order_reference,
        organization_id: newOrder.organization_id,
        buyer_id: newOrder.buyer_id,
        buyer_email: newOrder.buyer_email,
        seller_id: newOrder.seller_id,
        seller_email: newOrder.seller_email,
        title: newOrder.title,
        currency: newOrder.currency,
        total_amount: newOrder.total_amount,
        status: newOrder.status,
        delivery_deadline: newOrder.delivery_deadline,
        dispute_deadline: newOrder.dispute_deadline,
        created_at: newOrder.created_at,
      },
    ])
    .select()
    .single();

  if (orderErr) throw new Error(`Failed to save order to Supabase: ${orderErr.message}`);

  const agreementId = `agv-${Date.now().toString(36)}-01`;
  const { error: agErr } = await supabase.from("agreement_versions").insert([
    {
      id: agreementId,
      order_id: newOrder.id,
      version_number: 1,
      product_description: terms.product_description,
      quantity: terms.quantity,
      condition_requirements: terms.condition_requirements,
      acceptance_criteria: terms.acceptance_criteria,
      permitted_evidence_types: terms.permitted_evidence_types,
      dispute_procedure: terms.dispute_procedure,
      terms_commitment_hash: terms.terms_commitment_hash,
      created_at: newOrder.created_at,
    },
  ]);

  if (agErr) throw new Error(`Failed to save agreement terms to Supabase: ${agErr.message}`);

  // Audit event log
  await supabase.from("audit_events").insert([
    {
      entity_type: "order",
      entity_id: newOrder.id,
      action: "ORDER_CREATED",
      metadata: { terms_hash: terms.terms_commitment_hash, order_ref: newOrder.order_reference },
    },
  ]);

  return { order: orderData as Order, agreement_id: agreementId };
}

export async function uploadEvidenceToSupabase(params: {
  orderId: string;
  evidenceId: string;
  submittedByRole: "buyer" | "seller";
  submittedById: string;
  evidenceType: EvidenceItem["evidence_type"];
  description: string;
  fileName: string;
  fileBytesSha256: string;
  fileBuffer: Buffer;
  mimeType: string;
}): Promise<EvidenceItem> {
  const supabase = getSupabaseAdmin();
  const storagePath = `evidence/${params.orderId}/${params.evidenceId}_${params.fileName}`;

  // 1. Upload raw bytes to private Storage Bucket
  const { error: uploadErr } = await supabase.storage
    .from(EVIDENCE_STORAGE_BUCKET)
    .upload(storagePath, params.fileBuffer, {
      contentType: params.mimeType,
      upsert: false,
    });

  if (uploadErr && !uploadErr.message.includes("already exists")) {
    // If bucket does not exist, log guidance but continue metadata insertion
    console.warn(`Storage upload note: ${uploadErr.message}`);
  }

  // 2. Insert Evidence Record into Database
  const evidenceRecord: EvidenceItem = {
    id: params.evidenceId,
    order_id: params.orderId,
    submitted_by: params.submittedById,
    submitted_by_role: params.submittedByRole,
    evidence_type: params.evidenceType,
    description: params.description,
    file_name: params.fileName,
    file_bytes_sha256: params.fileBytesSha256,
    storage_path: storagePath,
    mime_type: params.mimeType,
    submitted_at: new Date().toISOString(),
  };

  const { error: dbErr } = await supabase.from("evidence").insert([
    {
      id: evidenceRecord.id,
      order_id: evidenceRecord.order_id,
      submitted_by: evidenceRecord.submitted_by,
      evidence_type: evidenceRecord.evidence_type,
      description: evidenceRecord.description,
      storage_path: evidenceRecord.storage_path,
      file_bytes_sha256: evidenceRecord.file_bytes_sha256,
      file_name: evidenceRecord.file_name,
      file_size_bytes: params.fileBuffer.length,
      mime_type: evidenceRecord.mime_type,
      submitted_at: evidenceRecord.submitted_at,
    },
  ]);

  if (dbErr) throw new Error(`Failed to save evidence metadata to Supabase: ${dbErr.message}`);

  // 3. Update order status if agreement was accepted
  await supabase
    .from("orders")
    .update({ status: "EVIDENCE_SUBMITTED" })
    .eq("id", params.orderId)
    .eq("status", "AGREEMENT_ACCEPTED");

  // Audit event log
  await supabase.from("audit_events").insert([
    {
      entity_type: "evidence",
      entity_id: params.evidenceId,
      action: "EVIDENCE_UPLOADED",
      metadata: { file_sha256: params.fileBytesSha256, order_id: params.orderId },
    },
  ]);

  return evidenceRecord;
}

export async function fetchDisputesFromSupabase(organizationId?: string): Promise<Dispute[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("disputes")
    .select("*")
    .order("created_at", { ascending: false });

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase error fetching disputes: ${error.message}`);
  return (data || []) as Dispute[];
}

export async function fetchDisputeByIdFromSupabase(disputeId: string): Promise<{
  dispute: Dispute | null;
  order: Order | null;
  evidence: EvidenceItem[];
  agreements: AgreementVersion[];
  submissions: DisputeSubmission[];
}> {
  const supabase = getSupabaseAdmin();

  const { data: dispute, error: dispErr } = await supabase
    .from("disputes")
    .select("*")
    .eq("id", disputeId)
    .maybeSingle();

  if (dispErr) throw new Error(`Supabase error fetching dispute: ${dispErr.message}`);
  if (!dispute) {
    return { dispute: null, order: null, evidence: [], agreements: [], submissions: [] };
  }

  const [orderRes, agreementsRes, evidenceRes, submissionsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", dispute.order_id).maybeSingle(),
    supabase.from("agreement_versions").select("*").eq("order_id", dispute.order_id).order("version_number", { ascending: true }),
    supabase.from("evidence").select("*").eq("order_id", dispute.order_id).order("submitted_at", { ascending: false }),
    supabase.from("dispute_submissions").select("*").eq("dispute_id", disputeId).order("created_at", { ascending: true }),
  ]);

  return {
    dispute: dispute as Dispute,
    order: (orderRes.data as Order) || null,
    evidence: (evidenceRes.data as EvidenceItem[]) || [],
    agreements: (agreementsRes.data as AgreementVersion[]) || [],
    submissions: (submissionsRes.data as DisputeSubmission[]) || [],
  };
}

export async function insertDisputeIntoSupabase(dispute: Dispute): Promise<Dispute> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("disputes")
    .insert([
      {
        id: dispute.id,
        dispute_reference: dispute.dispute_reference,
        order_id: dispute.order_id,
        opened_by: dispute.opened_by,
        claim_summary: dispute.claim_summary,
        dispute_category: dispute.dispute_category,
        status: dispute.status,
        created_at: dispute.created_at,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(`Failed to create dispute in Supabase: ${error.message}`);

  // Update order status to DISPUTE_OPEN
  await supabase.from("orders").update({ status: "DISPUTE_OPEN" }).eq("id", dispute.order_id);

  // Audit event log
  await supabase.from("audit_events").insert([
    {
      entity_type: "dispute",
      entity_id: dispute.id,
      action: "DISPUTE_OPENED",
      metadata: { dispute_ref: dispute.dispute_reference, order_id: dispute.order_id },
    },
  ]);

  return data as Dispute;
}

export async function insertDisputeSubmissionIntoSupabase(
  disputeId: string,
  submission: {
    id: string;
    submittedBy: string;
    submissionType: "buyer_rebuttal" | "seller_response" | "reviewer_note";
    content: string;
  }
): Promise<DisputeSubmission> {
  const supabase = getSupabaseAdmin();

  const newSub: DisputeSubmission = {
    id: submission.id,
    dispute_id: disputeId,
    submitted_by: submission.submittedBy,
    submitted_by_name: submission.submissionType.includes("seller") ? "Seller Organization" : "Buyer",
    submission_type: submission.submissionType,
    content: submission.content,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("dispute_submissions").insert([
    {
      id: newSub.id,
      dispute_id: newSub.dispute_id,
      submitted_by: newSub.submitted_by,
      submission_type: newSub.submission_type,
      content: newSub.content,
      created_at: newSub.created_at,
    },
  ]);

  if (error) throw new Error(`Failed to save dispute rebuttal to Supabase: ${error.message}`);
  return newSub;
}

export async function recordOnChainResolutionInSupabase(params: {
  disputeId: string;
  orderId: string;
  outcome: "BUYER_SUPPORTED" | "SELLER_SUPPORTED" | "INCONCLUSIVE";
  txHash: string;
  contractAddress: string;
  rationale: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const resolvedAt = new Date().toISOString();

  // 1. Update dispute status & outcome
  await supabase
    .from("disputes")
    .update({
      status: "RESOLVED",
      outcome: params.outcome,
      onchain_tx_hash: params.txHash,
      onchain_contract_address: params.contractAddress,
      resolution_summary: params.rationale,
      resolved_at: resolvedAt,
    })
    .eq("id", params.disputeId);

  // 2. Update order status
  await supabase
    .from("orders")
    .update({ status: "RESOLVED" })
    .eq("id", params.orderId);

  // 3. Insert on-chain transaction log
  await supabase.from("onchain_transactions").insert([
    {
      dispute_id: params.disputeId,
      network: "studionet",
      chain_id: "61999",
      contract_address: params.contractAddress,
      method: "resolve_dispute",
      tx_hash: params.txHash,
      status: "FINALIZED",
      execution_result: { outcome: params.outcome, rationale: params.rationale },
      created_at: resolvedAt,
    },
  ]);

  // 4. Audit event log
  await supabase.from("audit_events").insert([
    {
      entity_type: "dispute",
      entity_id: params.disputeId,
      action: "DISPUTE_RESOLVED_ONCHAIN",
      metadata: { tx_hash: params.txHash, outcome: params.outcome },
    },
  ]);
}
