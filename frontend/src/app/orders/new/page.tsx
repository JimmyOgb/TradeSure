"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function NewOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    title: "",
    total_amount: "",
    currency: "USD",
    buyer_email: "",
    seller_email: "",
    product_description: "",
    quantity: "1",
    condition_requirements: "Factory sealed, brand new, unopened in original retail packaging",
    acceptance_criteria: "Buyer must report cosmetic defects or discrepancies within 72 hours of signed delivery",
    dispute_procedure: "GenLayer consensus evaluation followed by appeal rights within 14 days",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");
      router.push(`/orders/${data.order.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/orders" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Back to Orders
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="border-b border-slate-100 pb-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Create New Order & Terms Agreement</h1>
          <p className="text-sm text-slate-500 mt-1">
            Establishing an order generates an immutable cryptographic agreement hash commit for StudioNet arbitration.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">Order Reference Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Dell XPS 15 9530 Workstation"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">Agreed Total Price ($)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="2199.00"
                value={formData.total_amount}
                onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">Buyer Email</label>
              <input
                type="email"
                required
                placeholder="buyer@client.com"
                value={formData.buyer_email}
                onChange={(e) => setFormData({ ...formData, buyer_email: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">Seller Email</label>
              <input
                type="email"
                required
                placeholder="merchant@store.com"
                value={formData.seller_email}
                onChange={(e) => setFormData({ ...formData, seller_email: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">Detailed Product Specifications</label>
            <textarea
              rows={3}
              required
              placeholder="Full specs, part numbers, serial tracking policies..."
              value={formData.product_description}
              onChange={(e) => setFormData({ ...formData, product_description: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">Condition Requirements</label>
              <textarea
                rows={3}
                value={formData.condition_requirements}
                onChange={(e) => setFormData({ ...formData, condition_requirements: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">Acceptance & Dispute Criteria</label>
              <textarea
                rows={3}
                value={formData.acceptance_criteria}
                onChange={(e) => setFormData({ ...formData, acceptance_criteria: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              {loading ? "Generating Agreement..." : "Publish & Generate Commitment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
