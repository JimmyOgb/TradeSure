import { Check, Shield, Zap } from "lucide-react";
import Link from "next/link";

export default function PricingPage() {
  const tiers = [
    {
      name: "Starter Merchant",
      price: "$49",
      description: "For independent e-commerce sellers wanting automated dispute evidence records.",
      features: [
        "Up to 100 documented order agreements / mo",
        "Cryptographic SHA-256 evidence hashing",
        "GenLayer consensus dispute evaluation",
        "Buyer & seller agreement sign-off workflow",
        "Community support",
      ],
      cta: "Get Started",
      highlighted: false,
    },
    {
      name: "Growth Organization",
      price: "$199",
      description: "For scaling retailers and marketplaces handling high-volume commerce trust.",
      features: [
        "Up to 1,000 documented agreements / mo",
        "Priority GenLayer StudioNet validator execution",
        "Multi-organization team access & roles",
        "Carrier tracking & photo verification integration",
        "Human review escalation workflows",
        "Dedicated technical support",
      ],
      cta: "Start Free Trial",
      highlighted: true,
    },
    {
      name: "Enterprise Platform",
      price: "Custom",
      description: "Custom dispute resolution infrastructure for enterprise commerce platforms.",
      features: [
        "Unlimited order agreements & evidence",
        "Custom GenLayer contract deployment",
        "Dedicated on-chain arbitration rules & policies",
        "Full Supabase private storage isolation",
        "SLA & 24/7 dedicated escalation support",
      ],
      cta: "Contact Enterprise Sales",
      highlighted: false,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Transparent, Predictable Pricing for Commerce Trust
        </h1>
        <p className="mt-4 text-slate-600 text-sm sm:text-base leading-relaxed">
          Select a plan designed for your merchant order volume. Automated dispute management and GenLayer StudioNet consensus verification included across all tiers.
        </p>
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 inline-block px-3 py-1 rounded-full border border-amber-200">
          Payment processing integration in sandbox staging &bull; No credit card required during preview
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mt-12">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-2xl p-8 border bg-white flex flex-col justify-between ${
              tier.highlighted
                ? "border-indigo-600 shadow-md ring-2 ring-indigo-600/10"
                : "border-slate-200 shadow-xs"
            }`}
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
                {tier.highlighted && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    Most Popular
                  </span>
                )}
              </div>
              <div className="mb-4">
                <span className="text-4xl font-extrabold text-slate-900">{tier.price}</span>
                {tier.price !== "Custom" && <span className="text-xs text-slate-500 font-medium"> / month</span>}
              </div>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">{tier.description}</p>

              <div className="space-y-3 mb-8">
                {tier.features.map((f) => (
                  <div key={f} className="flex items-start text-xs text-slate-600">
                    <Check className="w-4 h-4 text-emerald-500 mr-2 shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/orders/new"
              className={`w-full py-2.5 rounded-xl text-center text-xs font-semibold transition ${
                tier.highlighted
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200"
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
