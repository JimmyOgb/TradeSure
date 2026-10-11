"use client";

import { useState } from "react";
import { User, Building, Shield, Key } from "lucide-react";

export default function SettingsPage() {
  const [profile, setProfile] = useState({
    fullName: "Commerce Operations Lead",
    email: "operations@tradesure.example",
    role: "org_admin",
    organization: "Global Merchants Corp",
    walletAddress: "0xE4220c4b71877bb94EB173f467ef5c5557017085",
  });
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="pb-6 border-b border-slate-200 mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Organization & Security Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage profile, dispute reviewer credentials, and StudioNet wallet keys.</p>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium">
          Settings successfully updated.
        </div>
      )}

      <div className="space-y-8">
        {/* Profile Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <User className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">User Profile & Access Role</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">Account Email</label>
                <input
                  type="email"
                  disabled
                  value={profile.email}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">Assigned Role</label>
              <select
                value={profile.role}
                onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="org_admin">Organization Administrator</option>
                <option value="dispute_reviewer">Authorized Dispute Reviewer</option>
                <option value="seller">Seller</option>
                <option value="buyer">Buyer</option>
              </select>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Security & StudioNet Credentials */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">Blockchain & Multi-Tenant Security</h2>
          </div>

          <div className="space-y-4 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-900 block mb-1">Configured StudioNet Wallet</span>
              <p className="font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-700">
                {profile.walletAddress}
              </p>
            </div>

            <div>
              <span className="font-semibold text-slate-900 block mb-1">Network & Consensus Chain</span>
              <p className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-700">
                GenLayer StudioNet &bull; Chain ID: 61999 &bull; RPC: https://studio.genlayer.com/api
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
