import { NextResponse } from "next/server";
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

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Durable database persistence is unavailable. Supabase credentials must be configured." },
        { status: 503 }
      );
    }

    const disputes = await fetchDisputesFromSupabase(orgId);
    return NextResponse.json({ disputes, storage: "supabase" });
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

    const disputeId = crypto.randomUUID();
    const disputeRef = `DSP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Durable database persistence is unavailable. Supabase credentials must be configured." },
        { status: 503 }
      );
    }

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
