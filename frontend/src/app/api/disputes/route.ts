import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Dispute } from "@/lib/types";

export async function GET() {
  const disputes = Array.from(db.disputes.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return NextResponse.json({ disputes });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { order_id, claim_summary, dispute_category = "damaged_goods" } = body;

    if (!order_id || !claim_summary) {
      return NextResponse.json({ error: "Missing required dispute fields" }, { status: 400 });
    }

    const order = db.orders.get(order_id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const disputeId = `disp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const disputeRef = `DSP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newDispute: Dispute = {
      id: disputeId,
      dispute_reference: disputeRef,
      order_id,
      opened_by: order.buyer_id,
      claim_summary,
      dispute_category,
      status: "DISPUTE_OPEN",
      created_at: new Date().toISOString(),
    };

    db.disputes.set(disputeId, newDispute);
    order.status = "DISPUTE_OPEN";

    return NextResponse.json({ dispute: newDispute }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
