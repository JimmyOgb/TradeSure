import { Order, AgreementVersion, EvidenceItem, Dispute, DisputeSubmission, computeTermsCommitmentHash } from "./types";

// Persistent In-Memory Database Store without any synthetic or mock data
class Store {
  orders: Map<string, Order> = new Map();
  agreements: Map<string, AgreementVersion[]> = new Map();
  evidence: Map<string, EvidenceItem[]> = new Map();
  disputes: Map<string, Dispute> = new Map();
  disputeSubmissions: Map<string, DisputeSubmission[]> = new Map();

  // Clean initialization - starts completely empty per Zero-Mock policy
  constructor() {}

  // Helper clear method for clean testing
  clear() {
    this.orders.clear();
    this.agreements.clear();
    this.evidence.clear();
    this.disputes.clear();
    this.disputeSubmissions.clear();
  }
}

// Global singleton across Next.js API routes
const globalForStore = globalThis as unknown as { tradeSureStore?: Store };
export const db = globalForStore.tradeSureStore ?? new Store();
if (process.env.NODE_ENV !== "production") globalForStore.tradeSureStore = db;
