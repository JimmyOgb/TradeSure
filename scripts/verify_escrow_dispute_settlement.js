const assert = require("assert");
const crypto = require("crypto");
const gen = require("../frontend/node_modules/genlayer-js");

const ESCROW_ADDRESS = "0x25c769C2a74DEd3F7CE75C6c00EcCFC7b9da82cB";
const WETH_ADDRESS = "0xA4D48154601A9356CCeF8E80ebe9c8ef10290e04";
const DISPUTE_ADDRESS = "0x09ee2561c62CC6e74cf2111D062560422376666C";

async function testDisputeFlow() {
  console.log("=== Testing On-Chain Dispute Freeze and Settlement ===");

  const buyerAccount = gen.createAccount();
  const sellerAccount = gen.createAccount();

  const buyerClient = gen.createClient({ chain: gen.chains.studionet, account: buyerAccount });
  const sellerClient = gen.createClient({ chain: gen.chains.studionet, account: sellerAccount });
  const readClient = gen.createClient({ chain: gen.chains.studionet });

  const TOTAL_AMOUNT = 500000000000000000n; // 0.5 WETH
  const agreementId = crypto.randomUUID();
  const termsSummary = "Certified Hardware Delivery with QA Proof. Defective unit entitles buyer to full refund.";
  const termsHash = crypto.createHash("sha256").update(termsSummary).digest("hex");

  // 1. Faucet & approve
  console.log("\n[1] Funding buyer and setting allowance...");
  const fTx = await buyerClient.writeContract({
    address: WETH_ADDRESS,
    functionName: "faucet",
    args: [TOTAL_AMOUNT],
  });
  await readClient.waitForTransactionReceipt({ hash: fTx, status: "FINALIZED" });

  const aTx = await buyerClient.writeContract({
    address: WETH_ADDRESS,
    functionName: "approve",
    args: [ESCROW_ADDRESS, TOTAL_AMOUNT],
  });
  await readClient.waitForTransactionReceipt({ hash: aTx, status: "FINALIZED" });

  // 2. Create and fund escrow
  console.log("\n[2] Creating and funding escrow:", agreementId);
  const milestones = [
    {
      id: "m-1",
      title: "Full Delivery",
      amount: 500000000000000000,
      acceptance_criteria: "Hardware fully functional",
    },
  ];

  const cTx = await buyerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "create_escrow",
    args: [
      agreementId,
      buyerAccount.address,
      sellerAccount.address,
      WETH_ADDRESS,
      termsHash,
      TOTAL_AMOUNT,
      JSON.stringify(milestones),
    ],
  });
  await readClient.waitForTransactionReceipt({ hash: cTx, status: "FINALIZED" });

  const dTx = await buyerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "deposit",
    args: [agreementId, TOTAL_AMOUNT],
  });
  await readClient.waitForTransactionReceipt({ hash: dTx, status: "FINALIZED" });

  const funded = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_escrow",
    args: [agreementId],
  });
  assert.strictEqual(funded.status, "FUNDED");
  console.log("✔ Escrow funded successfully");

  // 3. Register dispute on TradeSureDispute
  const disputeId = crypto.randomUUID();
  console.log("\n[3] Registering dispute on TradeSureDispute contract:", disputeId);

  const manifest = [
    {
      id: "ev-01",
      type: "damage_photo",
      sha256: crypto.createHash("sha256").update("SHATTERED_SCREEN").digest("hex"),
      summary: "Screen crushed on unboxing",
    },
  ];

  const regDisputeTx = await buyerClient.writeContract({
    address: DISPUTE_ADDRESS,
    functionName: "register_dispute",
    args: [
      disputeId,
      agreementId,
      buyerAccount.address,
      sellerAccount.address,
      termsHash,
      termsSummary,
      "Device was crushed upon delivery, completely unusable.",
      JSON.stringify(manifest),
    ],
  });
  console.log("  Register Dispute Tx Hash:", regDisputeTx);
  await readClient.waitForTransactionReceipt({ hash: regDisputeTx, status: "FINALIZED" });
  console.log("✔ Dispute registered on-chain");

  // 4. Open dispute on Escrow Contract to freeze funds
  console.log("\n[4] Freezing escrow funds by opening dispute...");
  const freezeTx = await buyerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "open_dispute",
    args: [agreementId, "m-1", disputeId],
  });
  console.log("  Open Dispute Tx Hash:", freezeTx);
  await readClient.waitForTransactionReceipt({ hash: freezeTx, status: "FINALIZED" });

  const disputedEscrow = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_escrow",
    args: [agreementId],
  });
  console.log("✔ Escrow Status after dispute freeze:", disputedEscrow.status);
  assert.strictEqual(disputedEscrow.status, "DISPUTED");
  assert.strictEqual(disputedEscrow.active_dispute_id, disputeId);

  // 5. Resolve dispute on TradeSureDispute via GenLayer validator consensus
  console.log("\n[5] Resolving dispute on TradeSureDispute with GenLayer multi-validator consensus...");
  const resolveTx = await buyerClient.writeContract({
    address: DISPUTE_ADDRESS,
    functionName: "resolve_dispute",
    args: [disputeId],
  });
  console.log("  Resolve Dispute Tx Hash:", resolveTx);
  const resolveReceipt = await readClient.waitForTransactionReceipt({ hash: resolveTx, status: "FINALIZED" });
  console.log("✔ Dispute Consensus Finalized (Result:", resolveReceipt.result_name, ")");

  const resolution = await readClient.readContract({
    address: DISPUTE_ADDRESS,
    functionName: "get_resolution",
    args: [disputeId],
  });
  console.log("✔ Arbiter Decision Outcome:", resolution.outcome);
  console.log("  Rationale:", resolution.rationale);

  // 6. Execute Settle Dispute on Escrow Contract
  console.log("\n[6] Settling escrow funds based on verified dispute resolution...");
  const settleTx = await buyerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "settle_dispute",
    args: [agreementId],
  });
  console.log("  Settle Escrow Tx Hash:", settleTx);
  const settleReceipt = await readClient.waitForTransactionReceipt({ hash: settleTx, status: "FINALIZED" });
  console.log("✔ Escrow Settlement Finalized (Result:", settleReceipt.result_name, ")");

  const settledEscrow = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_escrow",
    args: [agreementId],
  });
  console.log("✔ Final Escrow Status:", settledEscrow.status);
  console.log("✔ Refunded Amount:", settledEscrow.refunded_amount);
  console.log("✔ Released Amount:", settledEscrow.released_amount);

  const finalLockedBalance = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_locked_balance",
    args: [agreementId],
  });
  console.log("✔ Final Remaining Locked Balance:", finalLockedBalance.toString(), "wei");
  assert.strictEqual(BigInt(finalLockedBalance), 0n);

  console.log("\n🎉 FULL DISPUTE RESOLUTION & ESCROW SETTLEMENT VERIFIED SUCCESSFULLY!");
}

testDisputeFlow().catch((err) => {
  console.error("✖ Dispute flow test failed:", err);
  process.exit(1);
});
