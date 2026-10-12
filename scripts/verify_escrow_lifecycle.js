const assert = require("assert");
const crypto = require("crypto");
const gen = require("../frontend/node_modules/genlayer-js");

const ESCROW_ADDRESS = "0x25c769C2a74DEd3F7CE75C6c00EcCFC7b9da82cB";
const WETH_ADDRESS = "0xA4D48154601A9356CCeF8E80ebe9c8ef10290e04";
const DISPUTE_ADDRESS = "0x09ee2561c62CC6e74cf2111D062560422376666C";

async function main() {
  console.log("=== TradeSure Live Escrow On-Chain Verification ===");
  console.log("Escrow Contract:", ESCROW_ADDRESS);
  console.log("WETH Token Contract:", WETH_ADDRESS);
  console.log("Dispute Contract:", DISPUTE_ADDRESS);

  // Generate distinct test accounts for Buyer and Seller
  const buyerAccount = gen.createAccount();
  const sellerAccount = gen.createAccount();

  console.log("\n[Setup] Generated Participants:");
  console.log("  Buyer Address :", buyerAccount.address);
  console.log("  Seller Address:", sellerAccount.address);

  const buyerClient = gen.createClient({ chain: gen.chains.studionet, account: buyerAccount });
  const sellerClient = gen.createClient({ chain: gen.chains.studionet, account: sellerAccount });
  const readClient = gen.createClient({ chain: gen.chains.studionet });

  // 1. Verify Escrow Contract Deployment
  console.log("\n[Step 1] Verifying TradeSureEscrow on-chain state...");
  const owner = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_owner",
    args: [],
  });
  console.log("✔ Contract Owner verified:", owner);
  const totalEscrowsBefore = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_total_escrows",
    args: [],
  });
  console.log("✔ Total Escrows initial count:", totalEscrowsBefore);

  // 2. Fund Buyer with test WETH via faucet
  const TOTAL_DEPOSIT = 1000000000000000000n; // 1.0 WETH (in wei)
  console.log("\n[Step 2] Minting 2.0 WETH to Buyer via Faucet...");
  const mintTxHash = await buyerClient.writeContract({
    address: WETH_ADDRESS,
    functionName: "faucet",
    args: [2000000000000000000n],
  });
  console.log("  Faucet Tx Hash:", mintTxHash);
  await readClient.waitForTransactionReceipt({ hash: mintTxHash, status: "FINALIZED" });

  const buyerWethBal = await readClient.readContract({
    address: WETH_ADDRESS,
    functionName: "balance_of",
    args: [buyerAccount.address],
  });
  console.log("✔ Buyer WETH Balance:", buyerWethBal.toString(), "wei");
  assert(BigInt(buyerWethBal) >= TOTAL_DEPOSIT, "Buyer must have sufficient WETH");

  // 3. Buyer Approves Escrow Contract
  console.log("\n[Step 3] Buyer approves TradeSureEscrow to spend WETH...");
  const approveTxHash = await buyerClient.writeContract({
    address: WETH_ADDRESS,
    functionName: "approve",
    args: [ESCROW_ADDRESS, TOTAL_DEPOSIT],
  });
  console.log("  Approve Tx Hash:", approveTxHash);
  await readClient.waitForTransactionReceipt({ hash: approveTxHash, status: "FINALIZED" });

  const allowance = await readClient.readContract({
    address: WETH_ADDRESS,
    functionName: "allowance",
    args: [buyerAccount.address, ESCROW_ADDRESS],
  });
  console.log("✔ Escrow allowance verified:", allowance.toString(), "wei");
  assert(BigInt(allowance) >= TOTAL_DEPOSIT, "Allowance must cover deposit");

  // 4. Create Escrow Agreement
  const agreementId = crypto.randomUUID();
  const termsHash = crypto.createHash("sha256").update("TradeSure-Live-Test-Terms-" + agreementId).digest("hex");
  const milestones = [
    {
      id: "m-1",
      title: "Phase 1: Initial Prototype Delivery",
      amount: 500000000000000000, // 0.5 WETH
      deadline: "2026-12-01",
      acceptance_criteria: "Fully functional staging deployment",
    },
    {
      id: "m-2",
      title: "Phase 2: Final Production Signoff",
      amount: 500000000000000000, // 0.5 WETH
      deadline: "2026-12-15",
      acceptance_criteria: "Live verified contract and QA tests passed",
    },
  ];

  console.log("\n[Step 4] Creating Escrow Agreement:", agreementId);
  console.log("  Terms Hash:", termsHash);
  console.log("  Milestones:", milestones.length, "milestones totaling 1.0 WETH");

  const createTxHash = await buyerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "create_escrow",
    args: [
      agreementId,
      buyerAccount.address,
      sellerAccount.address,
      WETH_ADDRESS,
      termsHash,
      TOTAL_DEPOSIT,
      JSON.stringify(milestones),
    ],
  });
  console.log("  Create Escrow Tx Hash:", createTxHash);
  const createReceipt = await readClient.waitForTransactionReceipt({ hash: createTxHash, status: "FINALIZED" });
  console.log("✔ Escrow Created (Status:", createReceipt.result_name, ")");

  const escrowData = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_escrow",
    args: [agreementId],
  });
  console.log("✔ Retrieved Escrow Agreement Status:", escrowData.status);
  assert.strictEqual(escrowData.status, "CREATED");
  assert.strictEqual(escrowData.buyer.toLowerCase(), buyerAccount.address.toLowerCase());
  assert.strictEqual(escrowData.seller.toLowerCase(), sellerAccount.address.toLowerCase());

  // 5. Buyer Deposits Tokens into Escrow
  console.log("\n[Step 5] Buyer depositing", TOTAL_DEPOSIT.toString(), "wei into escrow...");
  const depositTxHash = await buyerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "deposit",
    args: [agreementId, TOTAL_DEPOSIT],
  });
  console.log("  Deposit Tx Hash:", depositTxHash);
  const depositReceipt = await readClient.waitForTransactionReceipt({ hash: depositTxHash, status: "FINALIZED" });
  console.log("✔ Deposit finalized (Result:", depositReceipt.result_name, ")");

  const fundedEscrow = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_escrow",
    args: [agreementId],
  });
  console.log("✔ Updated Escrow Status:", fundedEscrow.status);
  assert.strictEqual(fundedEscrow.status, "FUNDED");
  assert.strictEqual(String(fundedEscrow.deposited_amount), TOTAL_DEPOSIT.toString());

  const lockedBalance = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_locked_balance",
    args: [agreementId],
  });
  console.log("✔ On-Chain Locked Balance verified:", lockedBalance.toString(), "wei");
  assert.strictEqual(BigInt(lockedBalance), TOTAL_DEPOSIT);

  // 6. Seller Submits Milestone 1 Evidence
  console.log("\n[Step 6] Seller submits Milestone 1 evidence...");
  const evidenceHash = crypto.createHash("sha256").update("PROTOTYPE_DEMO_VIDEO_BYTES").digest("hex");
  const submitTxHash = await sellerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "submit_milestone",
    args: [agreementId, "m-1", evidenceHash, "Staging link and video walkthrough"],
  });
  console.log("  Submit Milestone Tx Hash:", submitTxHash);
  await readClient.waitForTransactionReceipt({ hash: submitTxHash, status: "FINALIZED" });

  const m1State = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_escrow",
    args: [agreementId],
  });
  const m1 = m1State.milestones.find((m) => m.id === "m-1");
  console.log("✔ Milestone 1 Status:", m1.status, "(Evidence Hash:", m1.evidence_hash.slice(0, 16) + "...)");
  assert.strictEqual(m1.status, "SUBMITTED");

  // 7. Buyer Approves and Releases Milestone 1
  console.log("\n[Step 7] Buyer approves and releases Milestone 1 (0.5 WETH)...");
  const releaseTxHash = await buyerClient.writeContract({
    address: ESCROW_ADDRESS,
    functionName: "release_milestone",
    args: [agreementId, "m-1"],
  });
  console.log("  Release Tx Hash:", releaseTxHash);
  const releaseReceipt = await readClient.waitForTransactionReceipt({ hash: releaseTxHash, status: "FINALIZED" });
  console.log("✔ Release Finalized (Result:", releaseReceipt.result_name, ")");

  const afterReleaseEscrow = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_escrow",
    args: [agreementId],
  });
  const m1After = afterReleaseEscrow.milestones.find((m) => m.id === "m-1");
  console.log("✔ Milestone 1 Status after release:", m1After.status);
  assert.strictEqual(m1After.status, "RELEASED");
  console.log("✔ Released Amount:", afterReleaseEscrow.released_amount.toString());

  const remainingBalance = await readClient.readContract({
    address: ESCROW_ADDRESS,
    functionName: "get_locked_balance",
    args: [agreementId],
  });
  console.log("✔ Remaining On-Chain Locked Balance:", remainingBalance.toString(), "wei");
  assert.strictEqual(BigInt(remainingBalance), 500000000000000000n);

  console.log("\n🎉 ALL ON-CHAIN ESCROW LIFECYCLE TESTS PASSED WITH 100% SUCCESS!");
  console.log("Verified Live Contract Address:", ESCROW_ADDRESS);
}

main().catch((err) => {
  console.error("✖ Verification failed:", err);
  process.exit(1);
});
