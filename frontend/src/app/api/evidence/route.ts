import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { EvidenceItem, computeBufferSha256 } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const order_id = formData.get("order_id") as string;
    const submitted_by_role = (formData.get("submitted_by_role") as "buyer" | "seller") || "buyer";
    const evidence_type = (formData.get("evidence_type") as any) || "product_condition_photo";
    const description = (formData.get("description") as string) || "";
    const file = formData.get("file") as File | null;

    if (!order_id || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const order = db.orders.get(order_id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let fileHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    let fileName = "evidence_record.txt";
    let mimeType = "text/plain";

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fileHash = computeBufferSha256(buffer);
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
    }

    const evidenceId = `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newEvidence: EvidenceItem = {
      id: evidenceId,
      order_id,
      submitted_by: submitted_by_role === "buyer" ? order.buyer_id : order.seller_id,
      submitted_by_role,
      evidence_type,
      description,
      file_name: fileName,
      file_bytes_sha256: fileHash,
      storage_path: `evidence/${order_id}/${evidenceId}_${fileName}`,
      mime_type: mimeType,
      submitted_at: new Date().toISOString(),
    };

    const existing = db.evidence.get(order_id) || [];
    existing.push(newEvidence);
    db.evidence.set(order_id, existing);

    if (order.status === "AGREEMENT_ACCEPTED") {
      order.status = "EVIDENCE_SUBMITTED";
    }

    return NextResponse.json({ evidence: newEvidence }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
