const assert = require("assert");

const BASE_URL = "https://tradesure.vercel.app";

async function main() {
  console.log("=== Testing Live TradeSure Production Deployment at:", BASE_URL, "===");

  // 1. Homepage Health
  console.log("\n[Step 1] Verifying Homepage (HTTP 200)...");
  const homeRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(homeRes.status, 200, "Homepage must return HTTP 200");
  const homeHtml = await homeRes.text();
  assert(homeHtml.includes("TradeSure"), "Homepage must include TradeSure title/content");
  console.log("✔ Homepage HTTP 200 OK");

  // 2. Create Order
  console.log("\n[Step 2] Creating Order via POST /api/orders...");
  const createOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Batch of Precision Calibrated Turbines",
      currency: "USD",
      total_amount: 14500,
      buyer_email: "procurement@aerotech.example",
      seller_email: "sales@turbodynamics.example",
      product_description: "Aerospace-spec titanium rotor turbines, serial certified",
      quantity: 4,
      condition_requirements: "Zero micro-fractures, certified inspection log included",
      acceptance_criteria: "Laboratory ultrasound inspection within 72 hours",
      permitted_evidence_types: ["inspection_record", "product_condition_photo"],
      dispute_procedure: "GenLayer consensus evaluation on StudioNet",
    }),
  });
  assert.strictEqual(createOrderRes.status, 201, "Order creation must return HTTP 201");
  const orderData = await createOrderRes.json();
  const orderId = orderData.order.id;
  assert(orderId, "Order must have an ID");
  console.log("✔ Order Created successfully with ID:", orderId, "Storage:", orderData.storage);

  // 3. Refresh and Read Order
  console.log("\n[Step 3] Fetching Order via GET /api/orders/" + orderId + "...");
  const getOrderRes = await fetch(`${BASE_URL}/api/orders/${orderId}`);
  assert.strictEqual(getOrderRes.status, 200, "Get order must return HTTP 200");
  const fetchedOrderData = await getOrderRes.json();
  assert.strictEqual(fetchedOrderData.order.id, orderId);
  console.log("✔ Order retrieved and verified. Status:", fetchedOrderData.order.status);

  // 4. Accept Agreement
  console.log("\n[Step 4] Both parties accepting agreement...");
  await fetch(`${BASE_URL}/api/orders/${orderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept_agreement", role: "buyer" }),
  });
  const acceptRes = await fetch(`${BASE_URL}/api/orders/${orderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept_agreement", role: "seller" }),
  });
  const acceptedData = await acceptRes.json();
  assert.strictEqual(acceptedData.order.status, "AGREEMENT_ACCEPTED");
  console.log("✔ Agreement accepted by both parties. Status:", acceptedData.order.status);

  // 5. Submit Supporting Evidence
  console.log("\n[Step 5] Submitting cryptographic evidence file...");
  const formData = new FormData();
  formData.append("order_id", orderId);
  formData.append("submitted_by_role", "buyer");
  formData.append("evidence_type", "product_condition_photo");
  formData.append("description", "Ultrasound scan showing cracked titanium casing on unit #3 upon arrival");
  const fileBlob = new Blob(["SAMPLE_ULTRASOUND_DEFECT_EVIDENCE_BYTES_2026"], { type: "text/plain" });
  formData.append("file", fileBlob, "ultrasound_defect_scan.txt");

  const evRes = await fetch(`${BASE_URL}/api/evidence`, {
    method: "POST",
    body: formData,
  });
  assert.strictEqual(evRes.status, 201, "Evidence submission must return HTTP 201");
  const evData = await evRes.json();
  assert(evData.evidence.file_bytes_sha256, "Evidence must compute and return file SHA-256 hash");
  console.log("✔ Evidence submitted with verified SHA-256:", evData.evidence.file_bytes_sha256);

  // 6. Open Dispute
  console.log("\n[Step 6] Opening dispute via POST /api/disputes...");
  const openDispRes = await fetch(`${BASE_URL}/api/disputes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      claim_summary: "Turbine casing contains visible fractures violating agreed zero-fracture condition",
      dispute_category: "damaged_goods",
    }),
  });
  assert.strictEqual(openDispRes.status, 201, "Dispute opening must return HTTP 201");
  const dispData = await openDispRes.json();
  const disputeId = dispData.dispute.id;
  assert(disputeId, "Dispute must have an ID");
  console.log("✔ Dispute opened successfully with ID:", disputeId, "Reference:", dispData.dispute.dispute_reference);

  // 7. Execute On-Chain GenLayer Resolution
  console.log("\n[Step 7] Triggering live GenLayer intelligent contract resolution (evaluating on StudioNet)...");
  const resolveRes = await fetch(`${BASE_URL}/api/disputes/${disputeId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolve_onchain" }),
  });
  assert.strictEqual(resolveRes.status, 200, "On-chain evaluation endpoint must succeed");
  const resolveData = await resolveRes.json();
  assert(resolveData.evaluation.success, "GenLayer evaluation must succeed");
  console.log("✔ On-chain resolution finalized!");
  console.log("  Outcome:", resolveData.evaluation.outcome);
  console.log("  Contract Address:", resolveData.evaluation.contractAddress);
  console.log("  Transaction Hash:", resolveData.evaluation.txHash);
  console.log("  Rationale:", resolveData.evaluation.rationale);
  console.log("  Consensus Status:", resolveData.evaluation.consensusStatus);

  // 8. Re-fetch Dispute Verification
  console.log("\n[Step 8] Verifying resolved dispute status...");
  const finalDispRes = await fetch(`${BASE_URL}/api/disputes/${disputeId}`);
  assert.strictEqual(finalDispRes.status, 200);
  const finalDispData = await finalDispRes.json();
  assert.strictEqual(finalDispData.dispute.status, "RESOLVED");
  assert.strictEqual(finalDispData.dispute.outcome, resolveData.evaluation.outcome);
  console.log("✔ Final state confirmed: Status is RESOLVED with outcome", finalDispData.dispute.outcome);

  console.log("\n=== ALL 8 END-TO-END VERIFICATION STEPS PASSED ON PRODUCTION SITE ===");
}

main().catch((err) => {
  console.error("✖ Verification failed:", err);
  process.exit(1);
});
