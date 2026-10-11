"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { Dispute, Order, EvidenceItem, AgreementVersion, DisputeSubmission } from "@/lib/types";
import { ArrowLeft, Scale, ShieldCheck, CheckCircle2, AlertTriangle, Send, Cpu, ExternalLink } from "lucide-react";



function DisputeDetailContent({ id }: { id: string }) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [agreements, setAgreements] = useState<AgreementVersion[]>([]);
  const [submissions, setSubmissions] = useState<DisputeSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // New submission state
  const [submissionText, setSubmissionText] = useState("");
  const [submissionRole, setSubmissionRole] = useState<"seller_response" | "buyer_rebuttal">("seller_response");
  const [submitting, setSubmitting] = useState(false);

  // Resolution trigger state
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState("");

  const fetchDisputeData = () => {
    fetch(`/api/disputes/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setDispute(data.dispute);
        setOrder(data.order);
        setEvidence(data.evidence || []);
        setAgreements(data.agreements || []);
        setSubmissions(data.submissions || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDisputeData();
  }, [id]);

  const handleAddSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submissionText) return;
    setSubmitting(true);

    try {
      await fetch(`/api/disputes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_submission",
          content: submissionText,
          submission_type: submissionRole,
        }),
      });
      setSubmissionText("");
      fetchDisputeData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveOnChain = async () => {
    setResolving(true);
    setResolutionError("");

    try {
      const res = await fetch(`/api/disputes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_onchain" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute consensus resolution");
      fetchDisputeData();
    } catch (err: any) {
      setResolutionError(err.message);
    } finally {
      setResolving(false);
    }
  };

  if (loading || !dispute) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500">Loading dispute case...</div>;
  }

  const activeAgreement = agreements[agreements.length - 1];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/disputes" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Back to Disputes
      </Link>

      {/* Case Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-100 gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-900">{dispute.dispute_reference}</h1>
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase bg-rose-50 text-rose-700">
                {dispute.dispute_category.replace("_", " ")}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Associated Order: <Link href={`/orders/${order?.id}`} className="text-indigo-600 underline">{order?.order_reference}</Link> &bull; {order?.title}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span
              className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                dispute.status === "RESOLVED"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              Status: {dispute.status}
            </span>

            {dispute.status !== "RESOLVED" && (
              <button
                onClick={handleResolveOnChain}
                disabled={resolving}
                className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                <Cpu className="w-4 h-4 mr-1.5" />
                {resolving ? "Running GenLayer Consensus..." : "Execute GenLayer Arbiter"}
              </button>
            )}
          </div>
        </div>

        {resolutionError && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            {resolutionError}
          </div>
        )}

        {/* Verified Resolution Outcome Card */}
        {dispute.status === "RESOLVED" && (
          <div className="mt-6 bg-emerald-50/70 border border-emerald-200 p-6 rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Verified GenLayer Consensus Decision
                </span>
              </div>
              <span className="px-3 py-1 rounded-full font-extrabold text-sm bg-emerald-600 text-white shadow-xs">
                {dispute.outcome}
              </span>
            </div>

            <p className="text-sm text-emerald-950 font-medium mt-3 leading-relaxed">
              {dispute.resolution_summary}
            </p>

            <div className="mt-4 pt-4 border-t border-emerald-200/60 flex flex-wrap gap-y-2 text-xs text-emerald-800 font-mono">
              <div className="mr-8">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block">On-Chain Transaction</span>
                <span className="truncate">{dispute.onchain_tx_hash}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-600 block">Contract Address</span>
                <span>{dispute.onchain_contract_address}</span>
              </div>
            </div>
          </div>
        )}

        {/* Claim Summary */}
        <div className="mt-6">
          <span className="text-xs font-bold uppercase text-slate-500 block mb-1">Buyer's Submitted Claim</span>
          <p className="text-sm text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            {dispute.claim_summary}
          </p>
        </div>
      </div>

      {/* Grid of Submissions & Evidence Manifest */}
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Parties' Submissions & Rebuttals</h2>

          {dispute.status !== "RESOLVED" && (
            <form onSubmit={handleAddSubmission} className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-slate-700">Add Formal Statement</span>
                <select
                  value={submissionRole}
                  onChange={(e) => setSubmissionRole(e.target.value as any)}
                  className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="seller_response">Seller Response</option>
                  <option value="buyer_rebuttal">Buyer Rebuttal</option>
                </select>
              </div>

              <textarea
                rows={2}
                placeholder="Factual statement for the GenLayer dispute arbiter..."
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white mb-2"
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !submissionText}
                  className="text-xs px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? "Posting..." : "Post Statement"}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-4">
            {submissions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No additional responses recorded.</p>
            ) : (
              submissions.map((sub) => (
                <div key={sub.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{sub.submitted_by_name}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(sub.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-2 leading-relaxed">{sub.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Committed Evidence Manifest</h2>
            <span className="text-xs text-slate-400">{evidence.length} items verified</span>
          </div>

          <div className="space-y-3">
            {evidence.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No evidence linked to this order.</p>
            ) : (
              evidence.map((item) => (
                <div key={item.id} className="p-3.5 border border-slate-100 rounded-xl bg-slate-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-700">{item.evidence_type}</span>
                    <span className="text-[10px] text-slate-400">{item.file_name}</span>
                  </div>
                  <p className="text-xs text-slate-800 mt-1">{item.description}</p>
                  <p className="font-mono text-[10px] text-slate-400 mt-1 truncate">
                    SHA-256: {item.file_bytes_sha256}
                  </p>
                </div>
              ))
            )}
          </div>

          {activeAgreement && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <span className="text-xs font-bold uppercase text-slate-500 block mb-2">Evaluated Terms Agreement</span>
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                Commitment: {activeAgreement.terms_commitment_hash}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500">Loading dispute...</div>}>
      <DisputeDetailContent id={id} />
    </Suspense>
  );
}
