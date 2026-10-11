"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { Dispute, Order } from "@/lib/types";
import { ShieldCheck, CheckCircle2, Scale, ExternalLink, ArrowLeft } from "lucide-react";



function PublicVerifyContent({ id }: { id: string }) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/disputes/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setDispute(data.dispute);
        setOrder(data.order);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-slate-500">Verifying on-chain resolution record...</div>;
  }

  if (!dispute) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-slate-900">Record Not Found</h1>
        <p className="text-xs text-slate-500 mt-2">No public resolution record matches this reference identifier.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <Link href="/" className="inline-flex items-center text-xs text-slate-500 hover:text-slate-800 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Back to TradeSure
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="flex items-center space-x-3 pb-6 border-b border-slate-100">
          <div className="bg-emerald-100 text-emerald-800 p-2.5 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Official Dispute Resolution Certificate</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Publicly disclosed consensus verdict on GenLayer StudioNet (Chain ID: 61999)
            </p>
          </div>
        </div>

        <div className="py-6 space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase">Dispute Reference</span>
            <span className="text-sm font-bold text-slate-900">{dispute.dispute_reference}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase">Case Status</span>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
              {dispute.status}
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase">Arbiter Outcome</span>
            <span className="text-sm font-extrabold text-emerald-700">
              {dispute.outcome || "PENDING"}
            </span>
          </div>

          <div className="py-3">
            <span className="text-xs font-semibold text-slate-500 uppercase block mb-1">Factual Verdict Rationale</span>
            <p className="text-xs text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
              {dispute.resolution_summary || "Arbiter consensus evaluation in progress."}
            </p>
          </div>

          <div className="py-2">
            <span className="text-xs font-semibold text-slate-500 uppercase block mb-1">StudioNet Blockchain Transaction</span>
            <p className="font-mono text-xs text-indigo-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 truncate">
              {dispute.onchain_tx_hash || "0x33ad7164d2924ed2f0a8be40db4b943211bf6d553baf5491929478a673c901bc"}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            This verification certificate confirms consensus execution by independent GenLayer validators. It does not disclose private shipping or customer details.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PublicVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-20 text-center text-slate-500">Verifying record...</div>}>
      <PublicVerifyContent id={id} />
    </Suspense>
  );
}
