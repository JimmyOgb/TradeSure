import Link from "next/link";
import { ShieldCheck, Scale, FileCheck, ArrowRight, CheckCircle2, Lock, Cpu } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white border-b border-slate-200 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center space-x-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase mb-6">
              <Cpu className="w-3.5 h-3.5" />
              <span>Decentralized Commerce Arbitration</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Resolve commerce disputes with <span className="text-indigo-600">verifiable evidence</span> and AI consensus.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed">
              TradeSure protects buyers and sellers using agreed terms, independent SHA-256 evidence commitments, and multi-validator GenLayer Intelligent Contract adjudication on StudioNet.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm shadow-sm hover:bg-indigo-700 transition"
              >
                Launch Platform
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
              <Link
                href="/orders/new"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition"
              >
                Create Order Agreement
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value Pillars */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-6">
              <FileCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Documented Agreements</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Cryptographically committed terms ensure specifications, permitted evidence categories, and return procedures cannot be modified after order creation.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-6">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">Tamper-Proof Evidence</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Delivery photos, carrier tracking PDFs, and inspection notes are verified with server-computed SHA-256 hashes before being submitted to the dispute arbiter.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-6">
              <Scale className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">GenLayer AI Arbiter</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Consensus-driven Intelligent Contracts evaluate claims against committed criteria, returning verifiable outcomes (`BUYER_SUPPORTED`, `SELLER_SUPPORTED`, or `INCONCLUSIVE`).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
