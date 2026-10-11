"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Order, Dispute } from "@/lib/types";
import { LayoutDashboard, FileText, Scale, CheckCircle2, Clock, ArrowUpRight, Plus } from "lucide-react";

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/orders").then((res) => res.json()),
      fetch("/api/disputes").then((res) => res.json()),
    ])
      .then(([ordersData, disputesData]) => {
        setOrders(ordersData.orders || []);
        setDisputes(disputesData.disputes || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const openDisputes = disputes.filter((d) => d.status !== "RESOLVED");
  const resolvedDisputes = disputes.filter((d) => d.status === "RESOLVED");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-8 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Commerce Operations Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor active agreements, tamper-evident evidence, and GenLayer StudioNet resolutions.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/orders/new"
            className="inline-flex items-center px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Order Agreement
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Orders</span>
            <FileText className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="mt-4 text-3xl font-extrabold text-slate-900">{orders.length}</div>
          <div className="mt-1 text-xs text-slate-500">Active agreements on file</div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Disputes</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-4 text-3xl font-extrabold text-amber-600">{openDisputes.length}</div>
          <div className="mt-1 text-xs text-slate-500">Awaiting consensus or evidence</div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Resolved Cases</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-4 text-3xl font-extrabold text-emerald-600">{resolvedDisputes.length}</div>
          <div className="mt-1 text-xs text-slate-500">Verified by GenLayer arbiter</div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Protected Volume</span>
            <Scale className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="mt-4 text-3xl font-extrabold text-slate-900">
            ${orders.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0).toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">Escrow commitment tracking</div>
        </div>
      </div>

      {/* Recent Disputes & Orders */}
      <div className="grid lg:grid-cols-2 gap-8 mt-10">
        {/* Open Disputes Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Disputes Requiring Attention</h2>
            <Link href="/disputes" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              View all &rarr;
            </Link>
          </div>
          {disputes.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No disputes registered.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {disputes.slice(0, 4).map((d) => (
                <div key={d.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-sm text-slate-900">{d.dispute_reference}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          d.status === "RESOLVED"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{d.claim_summary}</p>
                  </div>
                  <Link
                    href={`/disputes/${d.id}`}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Recent Order Agreements</h2>
            <Link href="/orders" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              View all &rarr;
            </Link>
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No orders created yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {orders.slice(0, 4).map((o) => (
                <div key={o.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-sm text-slate-900">{o.order_reference}</span>
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                        {o.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{o.title} &bull; ${o.total_amount}</p>
                  </div>
                  <Link
                    href={`/orders/${o.id}`}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
