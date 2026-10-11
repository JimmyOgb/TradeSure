import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { EvidenceItem, computeBufferSha256 } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase";
import { uploadEvidenceToSupabase, fetchOrderByIdFromSupabase } from "@/lib/supabaseService";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB maximum
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/json",
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const order_id = formData.get("order_id") as string;
    const submitted_by_role = (formData.get("submitted_by_role") as "buyer" | "seller") || "buyer";
    const evidence_type = (formData.get("evidence_type") as any) || "product_condition_photo";
    const description = (formData.get("description") as string) || "";
    const file = formData.get("file") as File | null;

    if (!order_id || !description) {
      return NextResponse.json(
        { error: "Missing required evidence parameters: order_id and description are mandatory." },
        { status: 400 }
      );
    }

    let fileHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    let fileName = "evidence_record.txt";
    let mimeType = "text/plain";
    let buffer: Buffer = Buffer.from("");

    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File exceeds maximum allowed size of 15MB (${(file.size / 1024 / 1024).toFixed(2)}MB uploaded).` },
          { status: 413 }
        );
      }

      mimeType = file.type || "application/octet-stream";
      if (!ALLOWED_MIME_TYPES.includes(mimeType) && !mimeType.startsWith("image/")) {
        return NextResponse.json(
          { error: `Unsupported file MIME type: ${mimeType}. Allowed formats: JPG, PNG, WEBP, PDF, TXT, JSON.` },
          { status: 415 }
        );
      }

      buffer = Buffer.from(await file.arrayBuffer());
      fileHash = computeBufferSha256(buffer);
      fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    }

    const evidenceId = `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // Persistent storage branch
    if (isSupabaseConfigured()) {
      const orderData = await fetchOrderByIdFromSupabase(order_id);
      if (!orderData.order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      const submittedById =
        submitted_by_role === "buyer" ? orderData.order.buyer_id : orderData.order.seller_id;

      const evidence = await uploadEvidenceToSupabase({
        orderId: order_id,
        evidenceId,
        submittedByRole: submitted_by_role,
        submittedById,
        evidenceType: evidence_type,
        description: description.trim(),
        fileName,
        fileBytesSha256: fileHash,
        fileBuffer: buffer,
        mimeType,
      });

      return NextResponse.json({ evidence, storage: "supabase" }, { status: 201 });
    }

    // In-memory fallback
    const order = db.orders.get(order_id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const newEvidence: EvidenceItem = {
      id: evidenceId,
      order_id,
      submitted_by: submitted_by_role === "buyer" ? order.buyer_id : order.seller_id,
      submitted_by_role,
      evidence_type,
      description: description.trim(),
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

    return NextResponse.json(
      {
        evidence: newEvidence,
        storage: "in_memory",
        warning: "Evidence metadata and hash registered in-memory. Configure Supabase storage bucket for persistent file archival.",
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
