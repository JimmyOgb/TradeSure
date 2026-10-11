-- TradeSure Complete Supabase Database Schema
-- Production-oriented Commerce Trust & Dispute Resolution Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'org_admin', 'dispute_reviewer')),
    organization_id UUID,
    wallet_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    subscription_tier TEXT DEFAULT 'starter' CHECK (subscription_tier IN ('starter', 'growth', 'enterprise')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Organization Members
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- 4. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_reference TEXT NOT NULL UNIQUE,
    organization_id UUID REFERENCES public.organizations(id),
    buyer_id UUID REFERENCES public.profiles(id),
    seller_id UUID REFERENCES public.profiles(id),
    buyer_email TEXT,
    seller_email TEXT,
    title TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    total_amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'ORDER_CREATED' CHECK (status IN (
        'ORDER_CREATED',
        'AGREEMENT_ACCEPTED',
        'EVIDENCE_SUBMITTED',
        'DISPUTE_OPEN',
        'UNDER_REVIEW',
        'RESOLVED',
        'CANCELLED'
    )),
    delivery_deadline TIMESTAMPTZ,
    dispute_deadline TIMESTAMPTZ,
    active_agreement_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Agreement Versions Table
CREATE TABLE IF NOT EXISTS public.agreement_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    version_number INT NOT NULL DEFAULT 1,
    product_description TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    condition_requirements TEXT NOT NULL,
    acceptance_criteria TEXT NOT NULL,
    permitted_evidence_types TEXT[] NOT NULL,
    dispute_procedure TEXT NOT NULL,
    terms_commitment_hash TEXT NOT NULL, -- SHA-256 canonical hash of agreement terms
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, version_number)
);

-- 6. Agreement Acceptances Table
CREATE TABLE IF NOT EXISTS public.agreement_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_version_id UUID NOT NULL REFERENCES public.agreement_versions(id) ON DELETE CASCADE,
    party_id UUID NOT NULL REFERENCES public.profiles(id),
    party_role TEXT NOT NULL CHECK (party_role IN ('buyer', 'seller')),
    commitment_hash_accepted TEXT NOT NULL,
    accepted_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    UNIQUE(agreement_version_id, party_id)
);

-- 7. Evidence Table
CREATE TABLE IF NOT EXISTS public.evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    dispute_id UUID,
    submitted_by UUID NOT NULL REFERENCES public.profiles(id),
    organization_id UUID REFERENCES public.organizations(id),
    evidence_type TEXT NOT NULL CHECK (evidence_type IN (
        'delivery_photo',
        'product_condition_photo',
        'receipt_invoice',
        'carrier_tracking',
        'delivery_confirmation',
        'inspection_record',
        'written_explanation'
    )),
    description TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_bytes_sha256 TEXT NOT NULL, -- SHA-256 of raw file
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Disputes Table
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_reference TEXT NOT NULL UNIQUE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES public.profiles(id),
    claim_summary TEXT NOT NULL,
    dispute_category TEXT NOT NULL CHECK (dispute_category IN (
        'damaged_goods',
        'differing_description',
        'non_delivery',
        'incomplete_order',
        'seller_breach',
        'other'
    )),
    status TEXT NOT NULL DEFAULT 'DISPUTE_OPEN' CHECK (status IN (
        'DISPUTE_OPEN',
        'ADDITIONAL_EVIDENCE_REQUESTED',
        'UNDER_REVIEW',
        'RESOLVED',
        'HUMAN_ESCALATED',
        'APPEALED'
    )),
    outcome TEXT CHECK (outcome IN ('BUYER_SUPPORTED', 'SELLER_SUPPORTED', 'INCONCLUSIVE')),
    onchain_tx_hash TEXT,
    onchain_contract_address TEXT,
    resolution_summary TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Dispute Submissions (Responses & Rebuttals)
CREATE TABLE IF NOT EXISTS public.dispute_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES public.profiles(id),
    submission_type TEXT NOT NULL CHECK (submission_type IN ('buyer_rebuttal', 'seller_response', 'reviewer_note', 'evidence_attachment')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Dispute Reviews (Human or Escalated Reviews)
CREATE TABLE IF NOT EXISTS public.dispute_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES public.profiles(id),
    review_type TEXT NOT NULL CHECK (review_type IN ('initial_review', 'appeal_review', 'human_escalation')),
    findings TEXT NOT NULL,
    recommended_outcome TEXT CHECK (recommended_outcome IN ('BUYER_SUPPORTED', 'SELLER_SUPPORTED', 'INCONCLUSIVE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Onchain Transactions Table
CREATE TABLE IF NOT EXISTS public.onchain_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID REFERENCES public.disputes(id) ON DELETE CASCADE,
    network TEXT NOT NULL DEFAULT 'studionet',
    chain_id TEXT NOT NULL DEFAULT '61999',
    contract_address TEXT NOT NULL,
    method TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'FINALIZED', 'FAILED')),
    execution_result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Audit Events Table (Immutable Audit Log)
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Subscription Records
CREATE TABLE IF NOT EXISTS public.subscription_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK (tier IN ('starter', 'growth', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    valid_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance & tenant isolation
CREATE INDEX IF NOT EXISTS idx_orders_org ON public.orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_disputes_order ON public.disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_evidence_order ON public.evidence(order_id);
CREATE INDEX IF NOT EXISTS idx_tx_dispute ON public.onchain_transactions(dispute_id);

-- Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Parties or org members can view orders" ON public.orders
    FOR SELECT USING (
        auth.uid() = buyer_id OR
        auth.uid() = seller_id OR
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Parties or org members can view evidence" ON public.evidence
    FOR SELECT USING (
        submitted_by = auth.uid() OR
        order_id IN (
            SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
        )
    );

CREATE POLICY "Parties can view their disputes" ON public.disputes
    FOR SELECT USING (
        opened_by = auth.uid() OR
        order_id IN (
            SELECT id FROM public.orders WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
        )
    );
