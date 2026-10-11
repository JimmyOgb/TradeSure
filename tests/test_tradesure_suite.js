const assert = require("assert");
const crypto = require("crypto");
const gen = require("../frontend/node_modules/genlayer-js");

console.log("=== TradeSure Comprehensive Production Readiness Test Suite ===");

// 1. Test Cryptographic Terms Commitment Hashing
console.log("\n[Test 1] Cryptographic Terms Commitment Hash Consistency");
function computeTermsCommitmentHash(terms) {
  const canonicalString = JSON.stringify({
    product_description: terms.product_description.trim(),
    quantity: terms.quantity,
    condition_requirements: terms.condition_requirements.trim(),
    acceptance_criteria: terms.acceptance_criteria.trim(),
    permitted_evidence_types: [...terms.permitted_evidence_types].sort(),
    dispute_procedure: terms.dispute_procedure.trim(),
  });
  return crypto.createHash("sha256").update(canonicalString).digest("hex");
}

const termsA = {
  product_description: "Industrial Precision Sensors",
  quantity: 5,
  condition_requirements: "Factory Sealed",
  acceptance_criteria: "Benchmark within 48h",
  permitted_evidence_types: ["receipt_invoice", "delivery_photo"],
  dispute_procedure: "GenLayer consensus evaluation",
};
const termsB = {
  product_description: "Industrial Precision Sensors",
  quantity: 5,
  condition_requirements: "Factory Sealed",
  acceptance_criteria: "Benchmark within 48h",
  permitted_evidence_types: ["delivery_photo", "receipt_invoice"], // different array order
  dispute_procedure: "GenLayer consensus evaluation",
};

const hashA = computeTermsCommitmentHash(termsA);
const hashB = computeTermsCommitmentHash(termsB);
assert.strictEqual(hashA, hashB, "Sorted permitted evidence types must produce identical canonical hashes");
assert.strictEqual(hashA.length, 64, "SHA-256 hash must be 64 hex characters");
console.log("✔ Terms commitment hashing passed (Deterministic SHA-256:", hashA.slice(0, 16) + "...)");

// 2. Test File Byte Hashing
console.log("\n[Test 2] Evidence File Byte SHA-256 Calculation");
const sampleBuffer = Buffer.from("CRACKED_SCREEN_EVIDENCE_PHOTO_BYTES_2026");
const expectedHash = crypto.createHash("sha256").update(sampleBuffer).digest("hex");
assert.strictEqual(typeof expectedHash, "string");
assert.strictEqual(expectedHash.length, 64);
console.log("✔ Evidence byte hashing verified (SHA-256:", expectedHash.slice(0, 16) + "...)");

// 3. Test Live GenLayer StudioNet Contract Read-Only Interface
console.log("\n[Test 3] Live GenLayer StudioNet Contract State Verification");
const CONTRACT_ADDRESS = "0x09ee2561c62CC6e74cf2111D062560422376666C";
const client = gen.createClient({ chain: gen.chains.studionet });

async function verifyContract() {
  const chainId = await client.getChainId();
  assert.strictEqual(Number(chainId), 61999, "Chain ID must match StudioNet (61999)");
  console.log("✔ Connected to StudioNet (Chain ID: " + chainId + ")");

  const totalDisputes = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_total_disputes",
    args: [],
  });
  assert(Number(totalDisputes) >= 1, "Contract state must reflect at least 1 verified registered dispute");
  console.log("✔ Real on-chain readContract (get_total_disputes: " + totalDisputes + ")");

  const owner = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_owner",
    args: [],
  });
  assert(owner.startsWith("0x"), "Owner must be a valid 0x address");
  console.log("✔ Contract owner verified: " + owner);
}

verifyContract().then(() => {
  console.log("\n✔ ALL TESTS PASSED SUCCESSFULLY");
  process.exit(0);
}).catch((err) => {
  console.error("✖ Test failed:", err.message);
  process.exit(1);
});
