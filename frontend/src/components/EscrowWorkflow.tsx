"use client";

import { useState, useEffect } from "react";
import { EscrowAgreementState, EscrowMilestone } from "@/lib/types";
import {
  Shield,
  Coins,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  Lock,
  Unlock,
  ArrowRight,
  RefreshCw,
  Send,
  Check,
  Scale,
} from "lucide-react";

interface EscrowWorkflowProps {
  orderId: string;
  orderTitle: string;
  totalAmountUsd: number;
  termsHash: string;
  buyerEmail: string;
  sellerEmail: string;
  isAgreementAccepted: boolean;
}

export function EscrowWorkflow({
  orderId,
  totalAmountUsd,
  termsHash,
  buyerEmail,
  sellerEmail,
  isAgreementAccepted,
}: EscrowWorkflowProps) {
  const [escrow, setEscrow] = useState<EscrowAgreementState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Form states
  const [evidenceModalMilestone, setEvidenceModalMilestone] = useState<string | null>(null);
  const [evidenceHashInput, setEvidenceHashInput] = useState("");
  const [evidenceSummaryInput, setEvidenceSummaryInput] = useState("");

  const fetchEscrowState = async () => {
    try {
      setError(null);
      const res = await fetch(`/api/escrow?agreement_id=${orderId}`);
      const data = await res.json();
      if (data.escrow) {
        setEscrow(data.escrow);
      } else {
        setEscrow(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load escrow state");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrowState();
  }, [orderId]);

  // Default milestones based on order amount (50% upfront prototype / delivery, 50% completion)
  const defaultMilestonesWei = [
    {
      id: "m-1",
      title: "Milestone 1: Preliminary Delivery & Staging",
      amount: "500000000000000000", // 0.5 WETH
      status: "PENDING" as const,
      acceptance_criteria: "Initial functional deliverable or tracking dispatch confirmation",
    },
    {
      id: "m-2",
      title: "Milestone 2: Final Verification & Acceptance",
      amount: "500000000000000000", // 0.5 WETH
      status: "PENDING" as const,
      acceptance_criteria: "Full inspection sign-off and final production handover",
    },
  ];

  const handleCreateEscrow = async () => {
    setActionLoading("create");
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          agreement_id: orderId,
          buyer: "0x407391F94C1DE8f103E525d908acB118A92Cac65",
          seller: "0x41fd3A1eA6BB41F477f1a1a8e201Cb43e2FC8b6d",
          terms_hash: termsHash,
          total_amount_wei: "1000000000000000000", // 1.0 WETH in wei
          milestones: defaultMilestonesWei,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create escrow");
      setLastTxHash(data.txHash);
      setSuccessMsg("On-chain escrow agreement created successfully!");
      await fetchEscrowState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeposit = async () => {
    setActionLoading("deposit");
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          agreement_id: orderId,
          amount_wei: "1000000000000000000",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deposit failed");
      setLastTxHash(data.depositTxHash);
      setSuccessMsg("Tokens successfully locked in on-chain escrow!");
      await fetchEscrowState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitMilestone = async (milestoneId: string) => {
    if (!evidenceHashInput) {
      setError("Please provide an evidence commitment hash");
      return;
    }
    setActionLoading(`submit-${milestoneId}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_milestone",
          agreement_id: orderId,
          milestone_id: milestoneId,
          evidence_hash: evidenceHashInput,
          evidence_summary: evidenceSummaryInput || "Delivery verification artifact committed",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit milestone");
      setLastTxHash(data.txHash);
      setSuccessMsg(`Milestone ${milestoneId} evidence submitted on-chain!`);
      setEvidenceModalMilestone(null);
      setEvidenceHashInput("");
      setEvidenceSummaryInput("");
      await fetchEscrowState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReleaseMilestone = async (milestoneId: string) => {
    setActionLoading(`release-${milestoneId}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "release_milestone",
          agreement_id: orderId,
          milestone_id: milestoneId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to release milestone");
      setLastTxHash(data.txHash);
      setSuccessMsg(`Milestone ${milestoneId} payout released to seller on-chain!`);
      await fetchEscrowState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenDispute = async (milestoneId: string) => {
    setActionLoading(`dispute-${milestoneId}`);
    setError(null);
    setSuccessMsg(null);
    try {
      const disputeId = crypto.randomUUID();
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open_dispute",
          agreement_id: orderId,
          milestone_id: milestoneId,
          dispute_id: disputeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to freeze escrow funds");
      setLastTxHash(data.txHash);
      setSuccessMsg("Dispute initiated: Escrow funds locked on-chain pending arbitration!");
      await fetchEscrowState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSettleDispute = async () => {
    setActionLoading("settle");
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settle_dispute",
          agreement_id: orderId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to settle dispute");
      setLastTxHash(data.txHash);
      setSuccessMsg("Dispute settled on-chain based on GenLayer Arbiter resolution!");
      await fetchEscrowState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefundBuyer = async () => {
    if (!confirm("Are you sure you want to issue a full refund of remaining funds to the buyer?")) return;
    setActionLoading("refund");
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refund_buyer",
          agreement_id: orderId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to refund buyer");
      setLastTxHash(data.txHash);
      setSuccessMsg("Remaining escrow balance refunded to buyer on-chain!");
      await fetchEscrowState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Human readable token formatting
  const formatEth = (weiStr: string | number) => {
    try {
      const b = BigInt(weiStr || 0);
      const oneEth = BigInt("1000000000000000000");
      const whole = b / oneEth;
      const frac = (b % oneEth).toString().padStart(18, "0").slice(0, 4);
      return `${whole}.${frac} WETH`;
    } catch {
      return `${weiStr} wei`;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "FUNDED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">FUNDED & LOCKED</span>;
      case "CREATED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">AWAITING DEPOSIT</span>;
      case "DISPUTED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">DISPUTED (FROZEN)</span>;
      case "COMPLETED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">COMPLETED & SETTLED</span>;
      case "REFUNDED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">REFUNDED TO BUYER</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">NOT INITIALIZED</span>;
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Checking on-chain escrow status...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-3">
            <Coins className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">GenLayer StudioNet On-Chain Escrow</h2>
            {escrow && getStatusBadge(escrow.status)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real milestone token lockup, release, and dispute settlement governed by GenLayer intelligent contracts.
          </p>
        </div>

        <button
          onClick={fetchEscrowState}
          className="inline-flex items-center text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh State
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center">
          <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center">
          <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {lastTxHash && (
        <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs rounded-xl flex items-center justify-between">
          <span className="font-mono truncate mr-2">Tx Hash: {lastTxHash}</span>
          <a
            href={`https://studio.genlayer.com`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-indigo-600 hover:underline flex-shrink-0"
          >
            Explorer <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </div>
      )}

      {/* Contract & Balance Stats */}
      {escrow ? (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase block">Locked Balance</span>
            <span className="text-base font-bold text-slate-900">{formatEth(escrow.locked_balance)}</span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase block">Total Deposited</span>
            <span className="text-base font-bold text-slate-900">{formatEth(escrow.deposited_amount)}</span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase block">Released to Seller</span>
            <span className="text-base font-bold text-emerald-700">{formatEth(escrow.released_amount)}</span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase block">Refunded to Buyer</span>
            <span className="text-base font-bold text-amber-700">{formatEth(escrow.refunded_amount)}</span>
          </div>
        </div>
      ) : null}

      {/* Contract Details */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
        <div>
          <span className="font-semibold text-slate-700">Contract: </span>
          <span className="font-mono">0x25c769C2a74DEd3F7CE75C6c00EcCFC7b9da82cB</span>
        </div>
        <div>
          <span className="font-semibold text-slate-700">Token: </span>
          <span className="font-mono">WETH (0xA4D481...0e04)</span>
        </div>
        <div>
          <span className="font-semibold text-slate-700">Network: </span>
          <span>GenLayer StudioNet (61999)</span>
        </div>
      </div>

      {/* Action Area: Not Created */}
      {!escrow && (
        <div className="mt-6 p-6 border border-dashed border-slate-200 rounded-xl text-center">
          <Shield className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-900">Initialize Escrow Protection</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Binds this agreement to the TradeSureEscrow intelligent contract on GenLayer StudioNet, setting up milestone release rules and dispute arbitration.
          </p>
          <button
            onClick={handleCreateEscrow}
            disabled={actionLoading === "create" || !isAgreementAccepted}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {actionLoading === "create" ? "Deploying Escrow..." : "Initialize On-Chain Escrow Agreement"}
          </button>
          {!isAgreementAccepted && (
            <p className="text-[11px] text-amber-600 mt-2">
              Both parties must accept the cryptographic terms above before initializing escrow.
            </p>
          )}
        </div>
      )}

      {/* Action Area: Created, awaiting deposit */}
      {escrow && escrow.status === "CREATED" && (
        <div className="mt-6 p-6 bg-blue-50/50 border border-blue-200 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-blue-950 flex items-center">
                <Lock className="w-4 h-4 mr-1.5 text-blue-600" />
                Buyer Deposit Required
              </h3>
              <p className="text-xs text-blue-800 mt-1">
                Deposit {formatEth(escrow.total_amount)} into the escrow contract to fund the agreement milestones.
              </p>
            </div>
            <button
              onClick={handleDeposit}
              disabled={actionLoading === "deposit"}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition flex-shrink-0"
            >
              {actionLoading === "deposit" ? "Locking Tokens (Confirming)..." : "Lock Tokens in Escrow (Deposit)"}
            </button>
          </div>
        </div>
      )}

      {/* Action Area: Disputed Status */}
      {escrow && escrow.status === "DISPUTED" && (
        <div className="mt-6 p-6 bg-rose-50 border border-rose-200 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-rose-950 flex items-center">
                <Scale className="w-4 h-4 mr-1.5 text-rose-600" />
                Dispute Active — Escrow Locked
              </h3>
              <p className="text-xs text-rose-800 mt-1">
                Dispute ID: <span className="font-mono">{escrow.active_dispute_id}</span>. Funds are frozen on-chain while GenLayer multi-validator consensus deliberates.
              </p>
            </div>
            <button
              onClick={handleSettleDispute}
              disabled={actionLoading === "settle"}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50 transition flex-shrink-0"
            >
              {actionLoading === "settle" ? "Settling Escrow..." : "Enforce Arbiter Settlement"}
            </button>
          </div>
        </div>
      )}

      {/* Milestones Breakdown */}
      {escrow && escrow.milestones && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Milestone Progress & Payout Schedule</h3>
          <div className="space-y-3">
            {escrow.milestones.map((m, idx) => (
              <div
                key={m.id || idx}
                className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-900">{m.title}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        m.status === "RELEASED"
                          ? "bg-emerald-100 text-emerald-800"
                          : m.status === "SUBMITTED"
                          ? "bg-blue-100 text-blue-800"
                          : m.status === "DISPUTED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Amount: <span className="font-semibold text-slate-800">{formatEth(m.amount)}</span> &bull; Criteria: {m.acceptance_criteria || "Standard fulfillment"}
                  </p>
                  {m.evidence_hash && (
                    <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                      Evidence Hash: {m.evidence_hash}
                    </p>
                  )}
                </div>

                {/* Milestone Actions */}
                <div className="flex items-center space-x-2">
                  {escrow.status === "FUNDED" && m.status === "PENDING" && (
                    <button
                      onClick={() => setEvidenceModalMilestone(m.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium transition"
                    >
                      Submit Evidence
                    </button>
                  )}

                  {escrow.status === "FUNDED" && m.status === "SUBMITTED" && (
                    <>
                      <button
                        onClick={() => handleReleaseMilestone(m.id)}
                        disabled={actionLoading === `release-${m.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium transition disabled:opacity-50"
                      >
                        {actionLoading === `release-${m.id}` ? "Releasing..." : "Approve & Pay Seller"}
                      </button>
                      <button
                        onClick={() => handleOpenDispute(m.id)}
                        disabled={actionLoading === `dispute-${m.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium transition disabled:opacity-50"
                      >
                        Dispute
                      </button>
                    </>
                  )}

                  {m.status === "RELEASED" && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center">
                      <Check className="w-3.5 h-3.5 mr-1" /> Paid Out
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voluntary Seller Refund (only when FUNDED) */}
      {escrow && escrow.status === "FUNDED" && (
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">Seller Voluntary Action:</span>
          <button
            onClick={handleRefundBuyer}
            disabled={actionLoading === "refund"}
            className="text-xs text-slate-500 hover:text-rose-600 transition"
          >
            {actionLoading === "refund" ? "Processing Refund..." : "Issue Voluntary Refund to Buyer"}
          </button>
        </div>
      )}

      {/* Evidence Submission Modal */}
      {evidenceModalMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Submit Milestone Evidence</h3>
            <p className="text-xs text-slate-500 mb-4">
              Commit a cryptographic proof hash on-chain to demonstrate milestone completion.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 uppercase block mb-1">
                  Evidence SHA-256 Hash
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4a7d... (64 hex characters)"
                  value={evidenceHashInput}
                  onChange={(e) => setEvidenceHashInput(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 uppercase block mb-1">
                  Deliverable Description / Summary
                </label>
                <textarea
                  rows={2}
                  placeholder="Summary of completed milestone work or delivery link..."
                  value={evidenceSummaryInput}
                  onChange={(e) => setEvidenceSummaryInput(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                onClick={() => setEvidenceModalMilestone(null)}
                className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmitMilestone(evidenceModalMilestone)}
                disabled={actionLoading === `submit-${evidenceModalMilestone}` || !evidenceHashInput}
                className="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading === `submit-${evidenceModalMilestone}` ? "Submitting..." : "Submit on-chain"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
