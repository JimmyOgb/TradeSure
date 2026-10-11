import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { isSupabaseConfigured, getSupabaseAdmin } from "@/lib/supabase";
import { fetchOrderByIdFromSupabase } from "@/lib/supabaseService";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (isSupabaseConfigured()) {
      const data = await fetchOrderByIdFromSupabase(id);
      if (!data.order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      return NextResponse.json({ ...data, storage: "supabase" });
    }

    const order = db.orders.get(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const agreements = db.agreements.get(id) || [];
    const evidence = db.evidence.get(id) || [];

    return NextResponse.json({
      order,
      agreements,
      evidence,
      storage: "in_memory",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, role } = body;

    if (action === "accept_agreement") {
      const timestamp = new Date().toISOString();

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseAdmin();
        const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        const { data: agreements } = await supabase
          .from("agreement_versions")
          .select("*")
          .eq("order_id", id)
          .order("version_number", { ascending: false })
          .limit(1);

        const latest = agreements?.[0];
        if (!latest) return NextResponse.json({ error: "No agreement found" }, { status: 400 });

        const updateField = role === "buyer" ? { buyer_accepted_at: timestamp } : { seller_accepted_at: timestamp };
        await supabase.from("agreement_versions").update(updateField).eq("id", latest.id);

        const buyerAccepted = role === "buyer" ? true : Boolean(latest.buyer_accepted_at);
        const sellerAccepted = role === "seller" ? true : Boolean(latest.seller_accepted_at);

        if (buyerAccepted && sellerAccepted) {
          await supabase.from("orders").update({ status: "AGREEMENT_ACCEPTED" }).eq("id", id);
          order.status = "AGREEMENT_ACCEPTED";
        }

        return NextResponse.json({ order, agreement: { ...latest, ...updateField }, storage: "supabase" });
      }

      // In-memory fallback
      const order = db.orders.get(id);
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const agreements = db.agreements.get(id);
      if (!agreements || agreements.length === 0) {
        return NextResponse.json({ error: "No agreement found" }, { status: 400 });
      }

      const latest = agreements[agreements.length - 1];

      if (role === "buyer") {
        latest.buyer_accepted_at = timestamp;
      } else {
        latest.seller_accepted_at = timestamp;
      }

      if (latest.buyer_accepted_at && latest.seller_accepted_at) {
        order.status = "AGREEMENT_ACCEPTED";
      }

      return NextResponse.json({ order, agreement: latest, storage: "in_memory" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
