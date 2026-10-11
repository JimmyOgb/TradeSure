"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dispute, Order } from "@/lib/types";
import { Scale, ArrowRight, Plus, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // New dispute modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [claimSummary, setClaimSummary] = useState("");
  const [category, setCategory] = useState("damaged_goods");
  const [creating, setCreating] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch("/api/disputes").then((r) => r.json()),
      fetch("/api/orders").then((r) => r.json()),
    ])
      .then(([dispData, ordData]) => {
        setDisputes(dispData.disputes || []);
        setOrders(ordData.orders || []);
        if (ordData.orders?.length > 0) {
          setSelectedOrderId(ordData.orders[0].id);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId || !claimSummary) return;
    setCreating(true);

    try {
      await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selectedOrderId,
          claim_summary: claimSummary,
          dispute_category: category,
        }),
      });
      setShowModal(false);
      setClaimSummary("");
      fetchData();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Commercial Disputes & Arbitration</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cases adjudicated via GenLayer StudioNet multi-validator intelligent consensus.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2.5 rounded-lg bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Open New Dispute
        </button>
      </div>

      {/* Disputes Table */}
      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3.5">Dispute Ref</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5">Claim Summary</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Arbiter Outcome</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {disputes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No disputes open.
                  </td>
                </tr>
              ) : (
                disputes.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-6 py-4 font-semibold text-rose-600">{d.dispute_reference}</td>
                    <td className="px-6 py-4 capitalize">{d.dispute_category.replace("_", " ")}</td>
                    <td className="px-6 py-4 max-w-xs truncate text-slate-900">{d.claim_summary}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-amber-50 text-amber-700">
                        {d.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {d.outcome ? (
                        <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-700">
                          {d.outcome}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Pending Decision</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/disputes/${d.id}`}
                        className="inline-flex items-center text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        Review Dispute
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Initiate Commerce Dispute</h3>
            <p className="text-xs text-slate-500 mb-4">
              Select an agreement order and state your factual breach claim.
            </p>

            <form onSubmit={handleCreateDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">Select Order</label>
                <select
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg"
                >
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_reference} — {o.title} (${o.total_amount})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">Dispute Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="damaged_goods">Damaged Goods on Delivery</option>
                  <option value="differing_description">Differs Materially from Description</option>
                  <option value="non_delivery">Non-Delivery / Missing Order</option>
                  <option value="incomplete_order">Incomplete Shipment / Missing Units</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">Factual Claim Summary</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail the exact deviation from the agreed order specifications..."
                  value={claimSummary}
                  onChange={(e) => setClaimSummary(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                >
                  {creating ? "Opening..." : "Submit Dispute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
