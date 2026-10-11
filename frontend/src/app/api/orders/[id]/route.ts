import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = db.orders.get(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const body = await req.json();
  const { action, role } = body;

  if (action === "accept_agreement") {
    const agreements = db.agreements.get(id);
    if (!agreements || agreements.length === 0) {
      return NextResponse.json({ error: "No agreement found" }, { status: 400 });
    }

    const latest = agreements[agreements.length - 1];
    const timestamp = new Date().toISOString();

    if (role === "buyer") {
      latest.buyer_accepted_at = timestamp;
    } else {
      latest.seller_accepted_at = timestamp;
    }

    if (latest.buyer_accepted_at && latest.seller_accepted_at) {
      order.status = "AGREEMENT_ACCEPTED";
    }

    return NextResponse.json({ order, agreement: latest });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
