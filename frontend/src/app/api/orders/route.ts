import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Order, computeTermsCommitmentHash } from "@/lib/types";

export async function GET() {
  const orders = Array.from(db.orders.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return NextResponse.json({ orders });
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
    } = body;

    if (!title || !total_amount || !product_description) {
      return NextResponse.json(
        { error: "Missing required order fields" },
        { status: 400 }
      );
    }

    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const agreementId = `agv-${Date.now().toString(36)}-01`;
    const orderRef = `TS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const terms = {
      product_description,
      quantity: Number(quantity),
      condition_requirements: condition_requirements || "Standard commercial grade",
      acceptance_criteria: acceptance_criteria || "Inspection within 48 hours",
      permitted_evidence_types,
      dispute_procedure,
    };

    const commitmentHash = computeTermsCommitmentHash(terms);

    const newOrder: Order = {
      id: orderId,
      order_reference: orderRef,
      organization_id: "org-default",
      buyer_id: "usr-buyer-01",
      buyer_email: buyer_email || "buyer@tradesure.example",
      seller_id: "usr-seller-01",
      seller_email: seller_email || "seller@tradesure.example",
      title,
      currency,
      total_amount: Number(total_amount),
      status: "ORDER_CREATED",
      delivery_deadline: delivery_deadline || new Date(Date.now() + 7 * 86400000).toISOString(),
      dispute_deadline: dispute_deadline || new Date(Date.now() + 21 * 86400000).toISOString(),
      active_agreement_id: agreementId,
      created_at: new Date().toISOString(),
    };

    db.orders.set(orderId, newOrder);
    db.agreements.set(orderId, [
      {
        id: agreementId,
        order_id: orderId,
        version_number: 1,
        ...terms,
        terms_commitment_hash: commitmentHash,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({ order: newOrder, agreement_id: agreementId }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
