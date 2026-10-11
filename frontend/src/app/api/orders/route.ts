import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Order, computeTermsCommitmentHash } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase";
import { fetchOrdersFromSupabase, insertOrderIntoSupabase } from "@/lib/supabaseService";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("organization_id") || undefined;

    if (isSupabaseConfigured()) {
      const orders = await fetchOrdersFromSupabase(orgId);
      return NextResponse.json({ orders, storage: "supabase" });
    }

    // In-memory fallback with transparent persistence notice
    const orders = Array.from(db.orders.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json({
      orders,
      storage: "in_memory",
      notice: "Operating with in-memory storage. Configure Supabase credentials for durable multi-tenant persistence.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      currency = "USD",
      total_amount,
      buyer_email,
      seller_email,
      product_description,
      quantity = 1,
      condition_requirements,
      acceptance_criteria,
      permitted_evidence_types = ["delivery_photo", "product_condition_photo"],
      dispute_procedure = "GenLayer consensus evaluation followed by appeal rights within 14 days",
      delivery_deadline,
      dispute_deadline,
      organization_id = "org-default",
    } = body;

    // Server-side field validation & sanitization
    if (!title || !total_amount || !product_description) {
      return NextResponse.json(
        { error: "Missing required order fields: title, total_amount, and product_description are mandatory." },
        { status: 400 }
      );
    }

    if (Number(total_amount) <= 0 || isNaN(Number(total_amount))) {
      return NextResponse.json({ error: "Order total_amount must be a positive number." }, { status: 400 });
    }

    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const agreementId = `agv-${Date.now().toString(36)}-01`;
    const orderRef = `TS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const terms = {
      product_description: String(product_description).trim(),
      quantity: Number(quantity),
      condition_requirements: String(condition_requirements || "Standard commercial grade").trim(),
      acceptance_criteria: String(acceptance_criteria || "Inspection within 48 hours").trim(),
      permitted_evidence_types,
      dispute_procedure: String(dispute_procedure).trim(),
    };

    const commitmentHash = computeTermsCommitmentHash(terms);

    const newOrder: Order = {
      id: orderId,
      order_reference: orderRef,
      organization_id,
      buyer_id: "usr-buyer-01",
      buyer_email: buyer_email || "buyer@tradesure.example",
      seller_id: "usr-seller-01",
      seller_email: seller_email || "seller@tradesure.example",
      title: String(title).trim(),
      currency,
      total_amount: Number(total_amount),
      status: "ORDER_CREATED",
      delivery_deadline: delivery_deadline || new Date(Date.now() + 7 * 86400000).toISOString(),
      dispute_deadline: dispute_deadline || new Date(Date.now() + 21 * 86400000).toISOString(),
      active_agreement_id: agreementId,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured()) {
      const result = await insertOrderIntoSupabase(newOrder, {
        ...terms,
        terms_commitment_hash: commitmentHash,
      });
      return NextResponse.json(
        { order: result.order, agreement_id: result.agreement_id, storage: "supabase" },
        { status: 201 }
      );
    }

    // Persist to local memory store with explicit warning
    db.orders.set(orderId, newOrder);
    db.agreements.set(orderId, [
      {
        id: agreementId,
        order_id: orderId,
        version_number: 1,
        ...terms,
        terms_commitment_hash: commitmentHash,
        created_at: newOrder.created_at,
      },
    ]);

    return NextResponse.json(
      {
        order: newOrder,
        agreement_id: agreementId,
        storage: "in_memory",
        warning: "Saved to in-memory store. Configure Supabase for durable serverless persistence.",
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
