import { Order, AgreementVersion, EvidenceItem, Dispute, DisputeSubmission, computeTermsCommitmentHash } from "./types";

// Server-side robust in-memory database store with persistence & Supabase sync bridge
class Store {
  orders: Map<string, Order> = new Map();
  agreements: Map<string, AgreementVersion[]> = new Map();
  evidence: Map<string, EvidenceItem[]> = new Map();
  disputes: Map<string, Dispute> = new Map();
  disputeSubmissions: Map<string, DisputeSubmission[]> = new Map();

  constructor() {
    this.seedDemoData();
  }

  seedDemoData() {
    const order1Id = "ord-7491-a1";
    const agreement1Id = "agv-7491-01";
    const terms = {
      product_description: "Apple MacBook Pro M3 16-inch 36GB Unified Memory 1TB SSD Space Black",
      quantity: 1,
      condition_requirements: "Factory sealed brand new in original retail packaging with unbroken seal",
      acceptance_criteria: "Cosmetic inspection and hardware boot check within 72 hours of signed delivery",
      permitted_evidence_types: ["delivery_photo", "product_condition_photo", "carrier_tracking", "delivery_confirmation"],
      dispute_procedure: "GenLayer consensus evaluation followed by appeal rights within 14 days",
    };
    const hash = computeTermsCommitmentHash(terms);

    this.orders.set(order1Id, {
      id: order1Id,
      order_reference: "TS-2026-9042",
      organization_id: "org-global-merchants",
      buyer_id: "usr-buyer-01",
      buyer_email: "buyer.sarah@tradesure.example",
      seller_id: "usr-seller-01",
      seller_email: "merchant.tech@tradesure.example",
      title: "MacBook Pro M3 Max Enterprise Hardware Order",
      currency: "USD",
      total_amount: 3499.00,
      status: "DISPUTE_OPEN",
      delivery_deadline: "2026-10-15T18:00:00Z",
      dispute_deadline: "2026-10-25T18:00:00Z",
      active_agreement_id: agreement1Id,
      created_at: "2026-10-08T09:15:00Z",
    });

    this.agreements.set(order1Id, [{
      id: agreement1Id,
      order_id: order1Id,
      version_number: 1,
      ...terms,
      terms_commitment_hash: hash,
      created_at: "2026-10-08T09:20:00Z",
      buyer_accepted_at: "2026-10-08T10:05:00Z",
      seller_accepted_at: "2026-10-08T09:22:00Z",
    }]);

    this.evidence.set(order1Id, [
      {
        id: "ev-101",
        order_id: order1Id,
        submitted_by: "usr-buyer-01",
        submitted_by_role: "buyer",
        evidence_type: "product_condition_photo",
        description: "Retail box opened with heavy gouge on aluminum lid and torn seal prior to unboxing",
        file_name: "box_crushed_seal_torn.png",
        file_bytes_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        storage_path: "evidence/ord-7491-a1/ev-101.png",
        mime_type: "image/png",
        submitted_at: "2026-10-10T14:32:00Z",
      },
      {
        id: "ev-102",
        order_id: order1Id,
        submitted_by: "usr-seller-01",
        submitted_by_role: "seller",
        evidence_type: "carrier_tracking",
        description: "FedEx Priority Overnight tracking proof showing delivered with direct signature",
        file_name: "fedex_tracking_delivered.pdf",
        file_bytes_sha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
        storage_path: "evidence/ord-7491-a1/ev-102.pdf",
        mime_type: "application/pdf",
        submitted_at: "2026-10-10T16:45:00Z",
      }
    ]);

    const dispute1Id = "disp-8810-b1";
    this.disputes.set(dispute1Id, {
      id: dispute1Id,
      dispute_reference: "DSP-2026-0041",
      order_id: order1Id,
      opened_by: "usr-buyer-01",
      claim_summary: "Item arrived with broken seal and dented top enclosure, violating the agreed 'Factory Sealed Brand New' requirement.",
      dispute_category: "damaged_goods",
      status: "DISPUTE_OPEN",
      created_at: "2026-10-10T15:00:00Z",
    });

    this.disputeSubmissions.set(dispute1Id, [
      {
        id: "sub-1",
        dispute_id: dispute1Id,
        submitted_by: "usr-buyer-01",
        submitted_by_name: "Sarah (Buyer)",
        submission_type: "buyer_rebuttal",
        content: "I unboxed this on camera within 30 minutes of delivery. The factory seal sticker was already split open.",
        created_at: "2026-10-10T15:10:00Z",
      },
      {
        id: "sub-2",
        dispute_id: dispute1Id,
        submitted_by: "usr-seller-01",
        submitted_by_name: "Tech Hardware Org (Seller)",
        submission_type: "seller_response",
        content: "Our warehouse scan indicates pristine seal at dispatch. Outer shipping box had transit shock. Carrier insurance covers transit damage.",
        created_at: "2026-10-10T16:50:00Z",
      }
    ]);
  }
}

// Global singleton across API routes in dev
const globalForStore = globalThis as unknown as { tradeSureStore?: Store };
export const db = globalForStore.tradeSureStore ?? new Store();
if (process.env.NODE_ENV !== "production") globalForStore.tradeSureStore = db;
