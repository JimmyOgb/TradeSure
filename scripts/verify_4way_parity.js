const gen = require("../frontend/node_modules/genlayer-js");
const { createClient: createSupabaseClient } = require("../frontend/node_modules/@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envContent = fs.readFileSync(path.resolve(__dirname, "../frontend/.env.local"), "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) {
    let v = m[2] || "";
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
});

const genClient = gen.createClient({ chain: gen.chains.studionet, endpoint: "https://studio.genlayer.com/api" });
const supabase = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const disputeId = "90f7d713-3a0d-46af-91b1-134d4e7863f3";
const txHash = "0x3ab82a8479bedc5f66c9a14f9ed1040219b8fe34250f2d1d00a56739d091b27c";

async function verifyAll() {
  console.log("================================================================================");
  console.log("   TradeSure 4-Way Verification: Tx Receipt, On-Chain, API & Supabase DB");
  console.log("================================================================================\n");

  // 1. StudioNet Transaction Receipt
  const tx = await genClient.getTransaction({ hash: txHash });
  console.log("[1] StudioNet Transaction:", {
    hash: tx.hash,
    status: tx.status,
    status_name: tx.status_name,
    result_name: tx.result_name,
  });

  // 2. StudioNet get_resolution
  const onchainRes = await genClient.readContract({
    address: "0x09ee2561c62CC6e74cf2111D062560422376666C",
    functionName: "get_resolution",
    args: [disputeId],
  });
  console.log("\n[2] StudioNet get_resolution:", {
    outcome: onchainRes.outcome,
    rationale: onchainRes.rationale,
    evidence_cited: onchainRes.evidence_cited,
  });

  // 3. Production API response
  const apiRes = await fetch("https://tradesure.vercel.app/api/disputes/" + disputeId);
  const apiData = await apiRes.json();
  console.log("\n[3] Production API GET Response:", {
    status: apiRes.status,
    dispute_id: apiData.dispute.id,
    outcome: apiData.dispute.outcome,
    resolution_summary: apiData.dispute.resolution_summary,
    onchain_tx_hash: apiData.dispute.onchain_tx_hash,
  });

  // 4. Supabase DB record
  const { data: dbRow } = await supabase.from("disputes").select("*").eq("id", disputeId).single();
  console.log("\n[4] Supabase Direct DB Row:", {
    id: dbRow.id,
    status: dbRow.status,
    outcome: dbRow.outcome,
    resolution_summary: dbRow.resolution_summary,
    onchain_tx_hash: dbRow.onchain_tx_hash,
  });

  const outcomeMatch = onchainRes.outcome === apiData.dispute.outcome && apiData.dispute.outcome === dbRow.outcome;
  const rationaleMatch =
    onchainRes.rationale.trim() === apiData.dispute.resolution_summary.trim() &&
    apiData.dispute.resolution_summary.trim() === dbRow.resolution_summary.trim();
  const txMatch = dbRow.onchain_tx_hash === txHash && apiData.dispute.onchain_tx_hash === txHash;

  console.log("\n================================================================================");
  console.log("   PARITY RESULTS:");
  console.log("   Outcome 3-Way Match:       ", outcomeMatch ? "✔ 100% IDENTICAL" : "❌ MISMATCH");
  console.log("   Rationale 3-Way Match:     ", rationaleMatch ? "✔ 100% IDENTICAL" : "❌ MISMATCH");
  console.log("   TxHash Persistence Match:  ", txMatch ? "✔ 100% IDENTICAL" : "❌ MISMATCH");
  console.log("   StudioNet Receipt Finalized:", tx.status === 7 ? "✔ STATUS 7 (FINALIZED)" : "❌ NOT FINALIZED");
  console.log("   Consensus Result:          ", tx.result_name === "MAJORITY_AGREE" ? "✔ MAJORITY_AGREE" : "❌ NOT MAJORITY_AGREE");
  console.log("================================================================================\n");
}

verifyAll().catch(console.error);
