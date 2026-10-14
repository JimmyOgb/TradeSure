const assert = require("assert");
const fs = require("fs");
const path = require("path");
const gen = require("../frontend/node_modules/genlayer-js");
const { createClient } = require("../frontend/node_modules/@supabase/supabase-js");

console.log("================================================================================");
console.log("   TradeSure Live Production Dispute Resolution Verification");
console.log("   Exercising live API (https://tradesure.vercel.app) with on-chain consensus");
console.log("================================================================================\n");

// Read environment variables
const envPath = path.resolve(__dirname, "../frontend/.env.local");
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || "";
    if (val.startsWith("\"") && val.endsWith("\"")) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const PROD_URL = "https://tradesure.vercel.app";
const DISPUTE_CONTRACT =
  env.NEXT_PUBLIC_TRADESURE_CONTRACT_ADDRESS ||
  "0x09ee2561c62CC6e74cf2111D062560422376666C";
const genClient = gen.createClient({ chain: gen.chains.studionet });
const sbClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function runLiveVerification() {
  // Step 1: Create a fresh order
  console.log("[Step 1] Creating new order on production...");
  const orderRes = await fetch(`${PROD_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Live Production Test Order - Turbine Inspection",
      total_amount: 8500,
      currency: "USD",
      buyer_email: "buyer-live@tradesure.example",
      seller_email: "seller-live@tradesure.example",
      product_description: "Industrial grade rotor bearing set, serial cert required",
      quantity: 2,
      condition_requirements: "Factory sealed, zero surface fractures",
      acceptance_criteria: "Laboratory ultrasound inspection within 72 hours",
      permitted_evidence_types: ["product_condition_photo", "inspection_record"],
      dispute_procedure: "GenLayer consensus evaluation on StudioNet",
      delivery_deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      dispute_deadline: new Date(Date.now() + 21 * 86400000).toISOString(),
    }),
  });

  const orderData = await orderRes.json();
  assert(orderRes.ok, `Order creation failed: ${JSON.stringify(orderData)}`);
  const orderId = orderData.order.id;
  console.log(`✔ Order created: ID=${orderId}, Ref=${orderData.order.order_reference}`);

  // Step 2: Accept agreement
  console.log("\n[Step 2] Accepting agreement for both parties...");
  await fetch(`${PROD_URL}/api/orders/${orderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept_agreement", role: "buyer" }),
  });
  await fetch(`${PROD_URL}/api/orders/${orderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept_agreement", role: "seller" }),
  });
  console.log("✔ Agreement accepted by buyer and seller.");

  // Step 3: Upload Evidence
  console.log("\n[Step 3] Uploading verified laboratory inspection evidence...");
  const formData = new FormData();
  formData.append("order_id", orderId);
  formData.append("submitted_by_role", "buyer");
  formData.append("evidence_type", "product_condition_photo");
  formData.append(
    "description",
    "Laboratory ultrasound scan reveals deep internal micro-fractures violating agreed zero-fracture term."
  );
  const fakeFile = new Blob(["VERIFIED_ULTRASOUND_IMAGE_DATA_FRACTURE_CONFIRMED"], { type: "text/plain" });
  formData.append("file", fakeFile, "ultrasound_defect_scan.txt");

  const evRes = await fetch(`${PROD_URL}/api/evidence`, {
    method: "POST",
    body: formData,
  });
  const evData = await evRes.json();
  assert(evRes.ok, `Evidence upload failed: ${JSON.stringify(evData)}`);
  console.log(`✔ Evidence uploaded: ID=${evData.evidence.id}, SHA256=${evData.evidence.file_bytes_sha256}`);

  // Step 4: Open Dispute
  console.log("\n[Step 4] Opening dispute on production...");
  const dispRes = await fetch(`${PROD_URL}/api/disputes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      claim_summary: "Ultrasound inspection revealed internal micro-fractures in violation of zero-fracture condition",
      dispute_category: "damaged_goods",
    }),
  });
  const dispData = await dispRes.json();
  assert(dispRes.ok, `Dispute opening failed: ${JSON.stringify(dispData)}`);
  const disputeId = dispData.dispute.id;
  console.log(`✔ Dispute opened: ID=${disputeId}, Ref=${dispData.dispute.dispute_reference}`);

  // Step 5: Execute On-Chain Dispute Resolution
  console.log("\n[Step 5] Triggering on-chain dispute resolution via production API...");
  console.log("Executing POST /api/disputes/" + disputeId + " (action: resolve_onchain)...");
  const startTime = Date.now();
  const resolveRes = await fetch(`${PROD_URL}/api/disputes/${disputeId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolve_onchain" }),
  });
  const resolveData = await resolveRes.json();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Response received in ${duration}s: Status=${resolveRes.status}`);
  console.log("API Response Body:", JSON.stringify(resolveData, null, 2));

  assert(resolveRes.ok, `Production resolution failed: ${JSON.stringify(resolveData)}`);
  assert.strictEqual(resolveData.evaluation.success, true);
  assert(
    ["BUYER_SUPPORTED", "SELLER_SUPPORTED", "INCONCLUSIVE"].includes(resolveData.evaluation.outcome),
    "Must be valid outcome"
  );
  assert(resolveData.evaluation.rationale.length > 0, "Rationale must not be empty");

  const apiOutcome = resolveData.evaluation.outcome;
  const apiRationale = resolveData.evaluation.rationale;
  const apiTxHash = resolveData.evaluation.txHash;
  console.log(`✔ Production API returned: Outcome=${apiOutcome}, TxHash=${apiTxHash}`);

  // Step 6: Independently query get_resolution on StudioNet
  console.log("\n[Step 6] Independently querying deployed contract get_resolution on StudioNet...");
  const onchainResolution = await genClient.readContract({
    address: DISPUTE_CONTRACT,
    functionName: "get_resolution",
    args: [disputeId],
  });
  console.log("Live On-Chain get_resolution Result:", JSON.stringify(onchainResolution, null, 2));

  assert.strictEqual(
    onchainResolution.outcome,
    apiOutcome,
    "Authoritative on-chain outcome must strictly match API response outcome"
  );
  assert.strictEqual(
    onchainResolution.rationale.trim(),
    apiRationale.trim(),
    "Authoritative on-chain rationale must strictly match API response rationale"
  );
  console.log("✔ INDEPENDENT ON-CHAIN VERIFICATION CONFIRMED:");
  console.log(`   On-chain Outcome:  ${onchainResolution.outcome}`);
  console.log(`   API Outcome:        ${apiOutcome}`);
  console.log("   Outcome MATCH:      100% IDENTICAL");
  console.log("   Rationale MATCH:    100% IDENTICAL");

  // Step 7: Verify Supabase record
  console.log("\n[Step 7] Querying Supabase persistent record for this dispute...");
  const { data: dbDispute, error: dbErr } = await sbClient
    .from("disputes")
    .select("*")
    .eq("id", disputeId)
    .single();

  assert(!dbErr, `Supabase query failed: ${dbErr?.message}`);
  assert.strictEqual(dbDispute.status, "RESOLVED");
  assert.strictEqual(dbDispute.outcome, onchainResolution.outcome);
  assert.strictEqual(dbDispute.resolution_summary, onchainResolution.rationale);
  console.log("✔ SUPABASE RECORD VERIFIED:");
  console.log(`   DB Status:          ${dbDispute.status}`);
  console.log(`   DB Outcome:         ${dbDispute.outcome}`);
  console.log(`   DB Summary:         ${dbDispute.resolution_summary.slice(0, 80)}...`);
  console.log(`   DB OnChain Tx:      ${dbDispute.onchain_tx_hash}`);
  console.log("   Outcome MATCH:      100% IDENTICAL");
  console.log("   Rationale MATCH:    100% IDENTICAL");

  console.log("\n================================================================================");
  console.log("🎉 LIVE PRODUCTION DISPUTE RESOLUTION VERIFICATION SUCCEEDED!");
  console.log("   - Fresh Dispute ID: " + disputeId);
  console.log("   - StudioNet TxHash: " + (apiTxHash || dbDispute.onchain_tx_hash));
  console.log("   - On-Chain Outcome: " + onchainResolution.outcome);
  console.log("   - Supabase Outcome: " + dbDispute.outcome);
  console.log("================================================================================\n");
}

runLiveVerification().catch((err) => {
  console.error("\n❌ LIVE VERIFICATION FAILED:", err);
  process.exit(1);
});
