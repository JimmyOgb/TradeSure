const { createClient } = require("../frontend/node_modules/@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load local environment variables if available
const envLocalPath = path.join(__dirname, "../frontend/.env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...rest] = trimmed.split("=");
      const val = rest.join("=").replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== TradeSure Supabase Setup & Verification Utility ===");

if (!SUPABASE_URL || SUPABASE_URL.includes("your-project-id") || !SUPABASE_URL.startsWith("https://")) {
  console.error("✖ Blocked: Valid NEXT_PUBLIC_SUPABASE_URL not detected in environment.");
  console.log("  Please set your Supabase Project URL in frontend/.env.local or Vercel.");
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY.includes("your-supabase-service-role-key")) {
  console.error("✖ Blocked: Valid SUPABASE_SERVICE_ROLE_KEY not detected in environment.");
  console.log("  Please set your Supabase Service Role Key in frontend/.env.local or Vercel.");
  process.exit(1);
}

console.log(`✔ Detected Supabase Project URL: ${SUPABASE_URL}`);
console.log("✔ Service Role Key present (hidden for security)");

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("\n[Step 1] Verifying Storage Bucket: 'evidence-vault'...");
  const testFileName = `test_${Date.now()}.txt`;
  const { error: uploadErr } = await adminClient.storage
    .from("evidence-vault")
    .upload(testFileName, Buffer.from("TradeSure evidence-vault validation payload"), {
      contentType: "text/plain",
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Failed to upload to 'evidence-vault' storage bucket: ${uploadErr.message}`);
  }
  console.log("✔ Upload to private 'evidence-vault' bucket succeeded!");

  const { data: downloadData, error: downloadErr } = await adminClient.storage
    .from("evidence-vault")
    .download(testFileName);

  if (downloadErr) {
    throw new Error(`Failed to read from 'evidence-vault' storage bucket: ${downloadErr.message}`);
  }
  const downloadedText = await downloadData.text();
  console.log("✔ Read verification payload from 'evidence-vault' bucket succeeded!");

  // Clean up
  await adminClient.storage.from("evidence-vault").remove([testFileName]);
  console.log("✔ Verified and cleaned up test evidence storage artifact");

  console.log("\n[Step 2] Checking Database Tables from 20261011_tradesure_schema.sql...");
  const requiredTables = [
    "profiles",
    "organizations",
    "orders",
    "agreement_versions",
    "agreement_acceptances",
    "evidence",
    "disputes",
    "dispute_submissions",
    "onchain_transactions",
    "audit_events",
  ];

  const missingTables = [];
  for (const table of requiredTables) {
    const { error } = await adminClient.from(table).select("*").limit(1);
    if (error) {
      console.log(`  ✖ Table '${table}': ${error.message}`);
      missingTables.push(table);
    } else {
      console.log(`  ✔ Table '${table}' is accessible`);
    }
  }

  if (missingTables.length > 0) {
    console.error(`\n✖ Missing tables detected: ${missingTables.join(", ")}`);
    console.log("  Please apply supabase/migrations/20261011_tradesure_schema.sql in your Supabase SQL Editor.");
    process.exit(1);
  }

  console.log("\n[Step 3] Testing Real Database Write and Read Roundtrip...");
  const testOrderId = crypto.randomUUID();
  const testOrderRef = `TS-TEST-${Date.now().toString(36)}`;
  
  const { data: insertedOrder, error: insertErr } = await adminClient.from("orders").insert([
    {
      id: testOrderId,
      order_reference: testOrderRef,
      title: "Persistence Verification Test Order",
      currency: "USD",
      total_amount: 100,
      status: "ORDER_CREATED",
      created_at: new Date().toISOString(),
    },
  ]).select().single();

  if (insertErr) {
    throw new Error(`Write verification failed: ${insertErr.message}`);
  }
  console.log("✔ Test order written to Supabase orders table with ID:", insertedOrder.id);

  // Read back
  const { data: readOrder, error: readErr } = await adminClient.from("orders").select("*").eq("id", testOrderId).single();
  if (readErr || !readOrder) {
    throw new Error(`Read verification failed: ${readErr ? readErr.message : "Order not found"}`);
  }
  console.log("✔ Test order retrieved from Supabase orders table. Reference:", readOrder.order_reference);

  // Clean up test order
  await adminClient.from("orders").delete().eq("id", testOrderId);
  console.log("✔ Cleaned up temporary test order record");

  console.log("\n=== ALL SUPABASE STORAGE & DATABASE CHECKS PASSED ===");
}

main().catch((err) => {
  console.error("✖ Supabase Setup / Verification error:", err.message);
  process.exit(1);
});
