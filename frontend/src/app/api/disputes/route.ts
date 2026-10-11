import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Dispute } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchDisputesFromSupabase,
  insertDisputeIntoSupabase,
  fetchOrderByIdFromSupabase,
} from "@/lib/supabaseService";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("organization_id") || undefined;

    if (isSupabaseConfigured()) {
      const disputes = await fetchDisputesFromSupabase(orgId);
      return NextResponse.json({ disputes, storage: "supabase" });
    }

    const disputes = Array.from(db.disputes.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json({
      disputes,
      storage: "in_memory",
      notice: "Disputes operating with in-memory storage.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { order_id, claim_summary, dispute_category = "damaged_goods" } = body;

    if (!order_id || !claim_summary) {
      return NextResponse.json(
        { error: "Missing required dispute fields: order_id and claim_summary are required." },
        { status: 400 }
      );
    }

    const disputeId = `disp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const disputeRef = `DSP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (isSupabaseConfigured()) {
      const orderData = await fetchOrderByIdFromSupabase(order_id);
      if (!orderData.order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const newDispute: Dispute = {
        id: disputeId,
        dispute_reference: disputeRef,
        order_id,
        opened_by: orderData.order.buyer_id,
        claim_summary: String(claim_summary).trim(),
        dispute_category,
        status: "DISPUTE_OPEN",
        created_at: new Date().toISOString(),
      };

      const savedDispute = await insertDisputeIntoSupabase(newDispute);
      return NextResponse.json({ dispute: savedDispute, storage: "supabase" }, { status: 201 });
    }

    const order = db.orders.get(order_id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const newDispute: Dispute = {
      id: disputeId,
      dispute_reference: disputeRef,
      order_id,
      opened_by: order.buyer_id,
      claim_summary: String(claim_summary).trim(),
      dispute_category,
      status: "DISPUTE_OPEN",
      created_at: new Date().toISOString(),
    };

    db.disputes.set(disputeId, newDispute);
    order.status = "DISPUTE_OPEN";

    return NextResponse.json(
      {
        dispute: newDispute,
        storage: "in_memory",
        warning: "Dispute opened in in-memory session. Configure Supabase for durable record keeping.",
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
