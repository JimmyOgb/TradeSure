# TradeSure — Commerce Trust & Intelligent Dispute Resolution Platform

TradeSure is a commerce trust and arbitration platform that resolves buyer and seller disputes using documented agreements, independently submitted tamper-evident evidence, and GenLayer Intelligent Contract consensus evaluation.

---

## 1. Architecture Overview

- **Frontend & Backend**: Next.js 16 (App Router), React, TypeScript, Tailwind CSS.
- **Database & Tenant Isolation**: Supabase (PostgreSQL with Row Level Security, profiles, organizations, orders, agreements, evidence, disputes, audit events).
- **Consensus & Dispute Arbiter**: GenLayer StudioNet (`Chain ID: 61999`, RPC: `https://studio.genlayer.com/api`).
- **Cryptographic Commitments**: SHA-256 canonical hashing of agreed terms and raw evidence payload bytes.

---

## 2. Directory Structure

```
TradeSure/
├── contracts/
│   └── tradesure_dispute.py         # GenLayer Intelligent Contract
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/                 # Next.js API Routes (Orders, Disputes, Evidence)
│   │   │   ├── dashboard/           # Metrics & Dispute Overview
│   │   │   ├── orders/              # Orders List & Details
│   │   │   ├── disputes/            # Dispute Resolution & Submissions
│   │   │   ├── pricing/             # Transparent Subscription Tiers
│   │   │   ├── settings/            # Organization & Security Settings
│   │   │   └── verify/[id]/         # Public Resolution Certificate
│   │   ├── lib/
│   │   │   ├── genlayer.ts          # StudioNet SDK Integration
│   │   │   ├── store.ts             # Server State & Persistence
│   │   │   └── types.ts             # Cryptographic Hashing & Interfaces
├── supabase/
│   └── migrations/
│       └── 20261011_tradesure_schema.sql # Complete Database Migration & RLS
├── tests/
│   └── direct/
│       └── test_tradesure_dispute.py # Direct Mode Contract Tests
└── .env.example                     # Environment Configuration Template
```

---

## 3. Intelligent Contract Details

- **File**: `contracts/tradesure_dispute.py`
- **Runner**: Pinned `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`
- **Validation**: Verified with `genvm-lint` (`✓ Lint passed (3 checks)`).
- **Consensus Principle**: Custom validator comparative evaluation (`gl.vm.run_nondet_unsafe`). Both leader and independent validators evaluate evidence and must agree on the decisive outcome (`BUYER_SUPPORTED`, `SELLER_SUPPORTED`, or `INCONCLUSIVE`).
- **StudioNet Deployment Transaction**: `0x50cda7f094a5c7ebad477232f828dda191be767d9eccd5055726a47eb1728e97` (Result: `MAJORITY_AGREE`, 5/5 validator votes agreed).

---

## 4. Local Development

### Prerequisites
- Node.js 18+ (tested with v24.15.0)
- Python 3.11 or 3.12 with `genvm-lint`
- npm

### Running the Frontend
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the platform.

### Running Contract Linting
```bash
# Set UTF-8 encoding in PowerShell if on Windows
$env:PYTHONIOENCODING="utf-8"
genvm-lint lint contracts/tradesure_dispute.py
```

---

## 5. Deployment Instructions

### Vercel Deployment
1. Import the repository into Vercel and set the Root Directory to `frontend`.
2. Configure environment variables matching `.env.example`:
   - `NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999`
   - `NEXT_PUBLIC_GENLAYER_RPC=https://studio.genlayer.com/api`
   - `NEXT_PUBLIC_TRADESURE_CONTRACT_ADDRESS=0x233e28b5c2a95b811A2d181773Abb56b4e3553a8`
3. Deploy.

### Supabase Setup
1. Create a project in [Supabase](https://supabase.com).
2. Go to the SQL Editor and execute `supabase/migrations/20261011_tradesure_schema.sql`.
3. Create a private bucket named `evidence` under Supabase Storage.
