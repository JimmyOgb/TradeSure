import crypto from "crypto";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: "buyer" | "seller" | "org_admin" | "dispute_reviewer";
  organization_id: string;
}

export interface AgreementVersion {
  id: string;
  order_id: string;
  version_number: number;
  product_description: string;
  quantity: number;
  condition_requirements: string;
  acceptance_criteria: string;
  permitted_evidence_types: string[];
  dispute_procedure: string;
  terms_commitment_hash: string;
  created_at: string;
  buyer_accepted_at?: string;
  seller_accepted_at?: string;
}

export interface EvidenceItem {
  id: string;
  order_id: string;
  dispute_id?: string;
  submitted_by: string;
  submitted_by_role: "buyer" | "seller";
  evidence_type:
    | "delivery_photo"
    | "product_condition_photo"
    | "receipt_invoice"
    | "carrier_tracking"
    | "delivery_confirmation"
    | "inspection_record"
    | "written_explanation";
  description: string;
  file_name: string;
  file_bytes_sha256: string;
  storage_path: string;
  mime_type: string;
  submitted_at: string;
}

export interface DisputeSubmission {
  id: string;
  dispute_id: string;
  submitted_by: string;
  submitted_by_name: string;
  submission_type: "buyer_rebuttal" | "seller_response" | "reviewer_note";
  content: string;
  created_at: string;
}

export interface Dispute {
  id: string;
  dispute_reference: string;
  order_id: string;
  opened_by: string;
  claim_summary: string;
  dispute_category:
    | "damaged_goods"
    | "differing_description"
    | "non_delivery"
    | "incomplete_order"
    | "seller_breach"
    | "other";
  status:
    | "DISPUTE_OPEN"
    | "ADDITIONAL_EVIDENCE_REQUESTED"
    | "UNDER_REVIEW"
    | "RESOLVED"
    | "HUMAN_ESCALATED"
    | "APPEALED";
  outcome?: "BUYER_SUPPORTED" | "SELLER_SUPPORTED" | "INCONCLUSIVE";
  onchain_tx_hash?: string;
  onchain_contract_address?: string;
  resolution_summary?: string;
  resolved_at?: string;
  created_at: string;
}

export interface Order {
  id: string;
  order_reference: string;
  organization_id: string;
  buyer_id: string;
  buyer_email: string;
  seller_id: string;
  seller_email: string;
  title: string;
  currency: string;
  total_amount: number;
  status:
    | "ORDER_CREATED"
    | "AGREEMENT_ACCEPTED"
    | "EVIDENCE_SUBMITTED"
    | "DISPUTE_OPEN"
    | "UNDER_REVIEW"
    | "RESOLVED"
    | "CANCELLED";
  delivery_deadline: string;
  dispute_deadline: string;
  active_agreement_id?: string;
  created_at: string;
}

/**
 * Computes deterministic SHA-256 commitment of terms
 */
export function computeTermsCommitmentHash(terms: {
  product_description: string;
  quantity: number;
  condition_requirements: string;
  acceptance_criteria: string;
  permitted_evidence_types: string[];
  dispute_procedure: string;
}): string {
  const canonicalString = JSON.stringify({
    product_description: terms.product_description.trim(),
    quantity: terms.quantity,
    condition_requirements: terms.condition_requirements.trim(),
    acceptance_criteria: terms.acceptance_criteria.trim(),
    permitted_evidence_types: [...terms.permitted_evidence_types].sort(),
    dispute_procedure: terms.dispute_procedure.trim(),
  });
  return crypto.createHash("sha256").update(canonicalString).digest("hex");
}

/**
 * Computes SHA-256 for file buffer
 */
export function computeBufferSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export interface EscrowMilestone {
  id: string;
  title: string;
  amount: number | string;
  deadline?: string;
  acceptance_criteria?: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "RELEASED" | "DISPUTED" | "REFUNDED" | "SETTLED_INCONCLUSIVE";
  evidence_hash?: string;
  evidence_summary?: string;
}

export interface EscrowAgreementState {
  agreement_id: string;
  buyer: string;
  seller: string;
  token_address: string;
  terms_hash: string;
  total_amount: number | string;
  deposited_amount: number | string;
  released_amount: number | string;
  refunded_amount: number | string;
  locked_balance: number | string;
  status: "NOT_CREATED" | "CREATED" | "FUNDED" | "DISPUTED" | "COMPLETED" | "REFUNDED";
  active_dispute_id?: string;
  disputed_milestone_id?: string;
  milestones: EscrowMilestone[];
  last_settlement?: {
    dispute_id: string;
    outcome: string;
    rationale: string;
  };
  contract_address: string;
}
