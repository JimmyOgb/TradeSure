"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { Order, AgreementVersion, EvidenceItem } from "@/lib/types";
import { ArrowLeft, CheckCircle2, Shield, Upload, FileText, Scale, ExternalLink } from "lucide-react";
import { EscrowWorkflow } from "@/components/EscrowWorkflow";



function OrderDetailContent({ id }: { id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [agreements, setAgreements] = useState<AgreementVersion[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingRole, setAcceptingRole] = useState<string | null>(null);

  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [evidenceType, setEvidenceType] = useState("product_condition_photo");
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

  const fetchOrderData = () => {
    fetch(`/api/orders/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setOrder(data.order);
        setAgreements(data.agreements || []);
        setEvidence(data.evidence || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrderData();
  }, [id]);

  const handleAcceptAgreement = async (role: "buyer" | "seller") => {
    setAcceptingRole(role);
    try {
      await fetch(`/api/orders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_agreement", role }),
      });
      fetchOrderData();
    } finally {
      setAcceptingRole(null);
    }
  };

  const handleEvidenceUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceDesc) return;
    setSubmittingEvidence(true);

    const formData = new FormData();
    formData.append("order_id", id);
    formData.append("description", evidenceDesc);
    formData.append("evidence_type", evidenceType);
    formData.append("submitted_by_role", "buyer");

    try {
      await fetch("/api/evidence", {
        method: "POST",
        body: formData,
      });
      setEvidenceDesc("");
      fetchOrderData();
    } finally {
      setSubmittingEvidence(false);
    }
  };

  if (loading || !order) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500">Loading order...</div>;
  }

  const activeAgreement = agreements[agreements.length - 1];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/orders" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Back to Orders
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-900">{order.title}</h1>
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-indigo-50 text-indigo-700">
                {order.order_reference}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Parties: Buyer ({order.buyer_email}) &bull; Seller ({order.seller_email})
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-slate-100 text-slate-800">
              State: {order.status}
            </span>
            <Link
              href={`/disputes?order_id=${order.id}`}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-rose-50 text-rose-700 font-medium text-xs hover:bg-rose-100 transition"
            >
              <Scale className="w-3.5 h-3.5 mr-1.5" />
              Open Dispute
            </Link>
          </div>
        </div>

        {activeAgreement && (
          <div className="mt-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold uppercase text-slate-700">Cryptographic Agreement Commitment (v{activeAgreement.version_number})</span>
                </div>
                <p className="font-mono text-xs text-slate-500 mt-1 break-all">
                  SHA-256: {activeAgreement.terms_commitment_hash}
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleAcceptAgreement("buyer")}
                  disabled={!!activeAgreement.buyer_accepted_at || !!acceptingRole}
                  className={`text-xs px-3.5 py-2 rounded-lg font-medium transition ${
                    activeAgreement.buyer_accepted_at
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {activeAgreement.buyer_accepted_at ? "Buyer Accepted" : "Accept as Buyer"}
                </button>
                <button
                  onClick={() => handleAcceptAgreement("seller")}
                  disabled={!!activeAgreement.seller_accepted_at || !!acceptingRole}
                  className={`text-xs px-3.5 py-2 rounded-lg font-medium transition ${
                    activeAgreement.seller_accepted_at
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {activeAgreement.seller_accepted_at ? "Seller Accepted" : "Accept as Seller"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* On-Chain Milestone Escrow Workflow */}
      <EscrowWorkflow
        orderId={order.id}
        orderTitle={order.title}
        totalAmountUsd={order.total_amount}
        termsHash={activeAgreement?.terms_commitment_hash || ""}
        buyerEmail={order.buyer_email}
        sellerEmail={order.seller_email}
        isAgreementAccepted={Boolean(activeAgreement?.buyer_accepted_at && activeAgreement?.seller_accepted_at)}
      />

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Agreed Terms & Conditions</h2>
          {activeAgreement && (
            <div className="space-y-4 text-sm text-slate-600">
              <div>
                <span className="font-semibold text-slate-900 block text-xs uppercase mb-1">Product Description</span>
                <p className="bg-slate-50 p-3 rounded-lg border border-slate-100">{activeAgreement.product_description}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-900 block text-xs uppercase mb-1">Condition Requirements</span>
                <p className="bg-slate-50 p-3 rounded-lg border border-slate-100">{activeAgreement.condition_requirements}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-900 block text-xs uppercase mb-1">Acceptance & Reporting Criteria</span>
                <p className="bg-slate-50 p-3 rounded-lg border border-slate-100">{activeAgreement.acceptance_criteria}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Evidence Vault & Commitments</h2>

          <form onSubmit={handleEvidenceUpload} className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs font-bold uppercase text-slate-700 block mb-2">Submit New Verifiable Evidence</span>
            <div className="space-y-3">
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="product_condition_photo">Product Condition Photograph</option>
                <option value="delivery_photo">Delivery Location Photograph</option>
                <option value="carrier_tracking">Carrier Tracking PDF/Data</option>
                <option value="delivery_confirmation">Signed Delivery Confirmation</option>
                <option value="written_explanation">Inspection Report / Explanation</option>
              </select>

              <textarea
                rows={2}
                placeholder="Factual description of this evidence item..."
                value={evidenceDesc}
                onChange={(e) => setEvidenceDesc(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white"
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingEvidence || !evidenceDesc}
                  className="text-xs px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submittingEvidence ? "Hashing & Storing..." : "Commit Evidence Hash"}
                </button>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            {evidence.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No evidence items submitted yet.</p>
            ) : (
              evidence.map((item) => (
                <div key={item.id} className="p-3.5 border border-slate-100 rounded-xl bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-600">{item.evidence_type}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.submitted_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1">{item.description}</p>
                  <p className="font-mono text-[10px] text-slate-400 mt-1 truncate">
                    SHA-256: {item.file_bytes_sha256}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500">Loading order...</div>}>
      <OrderDetailContent id={id} />
    </Suspense>
  );
}
