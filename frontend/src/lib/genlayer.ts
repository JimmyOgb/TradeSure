import { createClient, createAccount, chains } from "genlayer-js";
import { EscrowAgreementState, EscrowMilestone } from "./types";

export const GENLAYER_STUDIONET_CONFIG = {
  chainId: 61999,
  rpc: "https://studio.genlayer.com/api",
  explorer: "https://studio.genlayer.com",
};

export const TRADESURE_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_TRADESURE_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x09ee2561c62CC6e74cf2111D062560422376666C";

export const TRADESURE_ESCROW_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_TRADESURE_ESCROW_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x25c769C2a74DEd3F7CE75C6c00EcCFC7b9da82cB";

export const WETH_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_WETH_CONTRACT_ADDRESS as `0x${string}`) ||
  "0xA4D48154601A9356CCeF8E80ebe9c8ef10290e04";

export function getGenLayerClient(privateKey?: `0x${string}`) {
  const account = privateKey ? createAccount(privateKey) : createAccount();
  return createClient({
    chain: chains.studionet,
    account,
  });
}

export interface OnChainResolution {
  dispute_id: string;
  outcome: "BUYER_SUPPORTED" | "SELLER_SUPPORTED" | "INCONCLUSIVE";
  rationale: string;
  limitations?: string;
  criteria_applied?: string;
  evidence_cited?: string[];
  resolved_at_block?: string;
}

/**
 * Authoritatively reads and decodes the resolved outcome from the deployed TradeSureDispute contract.
 * Throws explicit errors if the dispute is unresolved or if the returned data is malformed.
 */
export async function getDisputeResolutionOnChain(disputeId: string): Promise<OnChainResolution> {
  const client = getGenLayerClient();
  const rawResolution = (await client.readContract({
    address: TRADESURE_CONTRACT_ADDRESS,
    functionName: "get_resolution",
    args: [disputeId],
  })) as Record<string, unknown> | null;

  if (!rawResolution || typeof rawResolution !== "object") {
    throw new Error(`Invalid resolution return value for dispute ${disputeId}`);
  }

  const rawOutcome = String(rawResolution.outcome || "").trim().toUpperCase();
  if (
    rawOutcome !== "BUYER_SUPPORTED" &&
    rawOutcome !== "SELLER_SUPPORTED" &&
    rawOutcome !== "INCONCLUSIVE"
  ) {
    throw new Error(
      `Unrecognized or invalid outcome '${rawOutcome}' returned by get_resolution for dispute ${disputeId}`
    );
  }

  const rationale = String(rawResolution.rationale || "").trim();
  if (!rationale) {
    throw new Error(`Contract get_resolution returned empty rationale for dispute ${disputeId}`);
  }

  const evidenceCited = Array.isArray(rawResolution.evidence_cited)
    ? (rawResolution.evidence_cited as string[]).map(String)
    : [];

  return {
    dispute_id: String(rawResolution.dispute_id || disputeId),
    outcome: rawOutcome as "BUYER_SUPPORTED" | "SELLER_SUPPORTED" | "INCONCLUSIVE",
    rationale,
    limitations: rawResolution.limitations ? String(rawResolution.limitations) : undefined,
    criteria_applied: rawResolution.criteria_applied ? String(rawResolution.criteria_applied) : undefined,
    evidence_cited: evidenceCited,
    resolved_at_block: rawResolution.resolved_at_block ? String(rawResolution.resolved_at_block) : undefined,
  };
}

/**
 * Helper to distinguish confirmed unresolved contract state from RPC / transport errors.
 * Reverts from get_resolution when a dispute is unresolved explicitly return "[EXPECTED] Dispute not yet resolved".
 */
export function isConfirmedUnresolvedError(err: any): boolean {
  if (!err) return false;
  const rawStrings: string[] = [
    String(err.message || ""),
    String(err.shortMessage || ""),
    String(err.details || ""),
    String(err.cause?.message || ""),
    String(err.cause?.data?.receipt?.result || ""),
  ];

  const rawResult = err.cause?.data?.receipt?.result;
  if (typeof rawResult === "string") {
    try {
      const decoded = Buffer.from(rawResult, "base64").toString("utf8");
      rawStrings.push(decoded);
    } catch {
      // ignore
    }
  }

  const combined = rawStrings.join(" ");
  return (
    combined.includes("Dispute not yet resolved") ||
    combined.includes("Dispute not found")
  );
}

/**
 * Helper to distinguish a confirmed nonexistent dispute from RPC / transport errors.
 * Reverts from get_dispute when a dispute is not registered explicitly return "[EXPECTED] Dispute not found".
 */
export function isConfirmedNonexistentDisputeError(err: any): boolean {
  if (!err) return false;
  const rawStrings: string[] = [
    String(err.message || ""),
    String(err.shortMessage || ""),
    String(err.details || ""),
    String(err.cause?.message || ""),
    String(err.cause?.data?.receipt?.result || ""),
  ];

  const rawResult = err.cause?.data?.receipt?.result;
  if (typeof rawResult === "string") {
    try {
      const decoded = Buffer.from(rawResult, "base64").toString("utf8");
      rawStrings.push(decoded);
    } catch {
      // ignore
    }
  }

  const combined = rawStrings.join(" ");
  return combined.includes("Dispute not found");
}

/**
 * Validates that a GenLayer StudioNet transaction receipt exhibits genuine protocol-level finalization.
 * Rejects missing, pending, accepted-only, and failed receipts without fallback defaults.
 * Under official StudioNet receipt schema, either numeric status: 7 or status_name: "FINALIZED" establishes genuine finalization.
 */
export function verifyReceiptFinalized(
  receipt: any,
  txHash: string
): { status: string; result: string } {
  if (!receipt || typeof receipt !== "object") {
    throw new Error(`Receipt missing or unconfirmed for transaction: ${txHash}`);
  }

  const rawStatus = receipt.status;
  const statusName = String(
    receipt.status_name || receipt.statusName || ""
  ).toUpperCase();

  const resultName = String(
    receipt.result_name || receipt.resultName || ""
  ).toUpperCase();

  // Failed states
  if (
    statusName.includes("REVERT") ||
    statusName.includes("FAIL") ||
    statusName === "CANCELED" ||
    statusName === "LEADER_TIMEOUT" ||
    statusName === "VALIDATORS_TIMEOUT" ||
    resultName.includes("DISAGREE") ||
    resultName.includes("FAILURE")
  ) {
    throw new Error(
      `Dispute resolution transaction failed on-chain: ${txHash} (${statusName || resultName || "FAILED"})`
    );
  }

  // Pending states (status 1-4)
  if (
    statusName === "PENDING" ||
    statusName === "PROPOSING" ||
    statusName === "COMMITTING" ||
    statusName === "REVEALING" ||
    rawStatus === 1 ||
    rawStatus === 2 ||
    rawStatus === 3 ||
    rawStatus === 4
  ) {
    throw new Error(
      `Dispute resolution transaction is still pending consensus: ${txHash} (status: ${statusName || rawStatus})`
    );
  }

  // Accepted-only state (status 5) is NOT finalized into a block
  if (statusName === "ACCEPTED" || rawStatus === 5) {
    throw new Error(
      `Dispute resolution transaction is ACCEPTED by validators but not yet FINALIZED into a StudioNet block: ${txHash}. Awaiting protocol finalization.`
    );
  }

  // Under GenLayer StudioNet receipt schema (TransactionStatus enum in genlayer-js):
  // Status 7 = FINALIZED, with documented string status_name = "FINALIZED".
  // Either status: 7 or status_name: "FINALIZED" establishes genuine protocol finalization.
  const isFinalized = statusName === "FINALIZED" || rawStatus === 7;
  if (!isFinalized) {
    throw new Error(
      `Dispute resolution transaction lacks genuine finalization evidence on StudioNet: ${txHash} (status: ${statusName || rawStatus || "UNKNOWN"}).`
    );
  }

  return {
    status: "FINALIZED",
    result: resultName || "FINALIZED",
  };
}

/**
 * Checks whether a dispute is already registered on-chain.
 * Distinguishes a confirmed nonexistent dispute from RPC failures.
 * Throws on RPC/network errors so a transient read failure cannot trigger an unnecessary registration transaction.
 */
export async function getDisputeOnChain(disputeId: string): Promise<Record<string, unknown> | null> {
  const client = getGenLayerClient();
  try {
    const rawDispute = (await client.readContract({
      address: TRADESURE_CONTRACT_ADDRESS,
      functionName: "get_dispute",
      args: [disputeId],
    })) as Record<string, unknown> | null;
    return rawDispute;
  } catch (err: any) {
    if (isConfirmedNonexistentDisputeError(err)) {
      return null;
    }
    throw new Error(
      `RPC failure querying on-chain dispute ${disputeId}: ${err.message || err}. Aborting registration check to prevent duplicate transaction.`
    );
  }
}

/**
 * Executes authentic on-chain dispute resolution via GenLayer StudioNet.
 * Directly submits writeContract transaction to the deployed contract with required parameters,
 * waits for confirmed finalization, and reads the authoritative resolution.
 */
export async function evaluateDisputeOnChain(params: {
  disputeId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  agreementHash: string;
  agreementTerms: string;
  claimSummary: string;
  evidenceManifest: Array<{
    id: string;
    type: string;
    sha256: string;
    description: string;
  }>;
  existingTxHash?: string;
  onTransactionBroadcast?: (txHash: string) => Promise<void> | void;
}) {
  const client = getGenLayerClient();
  const manifestJson = JSON.stringify(params.evidenceManifest);
  let resolveTxHash: string | undefined = params.existingTxHash;

  // Authorize caller on-chain: if buyerId is internal ID, use client wallet address
  const onchainBuyerId =
    params.buyerId.startsWith("0x") && params.buyerId.length === 42
      ? params.buyerId
      : (client.account?.address || "0x0000000000000000000000000000000000000000");
  const onchainSellerId =
    params.sellerId.startsWith("0x") && params.sellerId.length === 42
      ? params.sellerId
      : "0x0000000000000000000000000000000000000001";

  try {
    // 1. If an actual resolution transaction hash already exists, safely wait for its finalization and persist
    if (params.existingTxHash && params.existingTxHash.startsWith("0x") && !params.existingTxHash.includes("ALREADY")) {
      const receipt = await (client.waitForTransactionReceipt as any)({
        hash: params.existingTxHash as `0x${string}`,
        status: "FINALIZED",
        interval: 2500,
        retries: 24,
      });
      const finalization = verifyReceiptFinalized(receipt, params.existingTxHash);
      const res = await getDisputeResolutionOnChain(params.disputeId);
      return {
        success: true,
        outcome: res.outcome,
        rationale: res.rationale,
        evidenceCited: res.evidence_cited || [],
        criteriaApplied: res.criteria_applied || "",
        contractAddress: TRADESURE_CONTRACT_ADDRESS,
        consensusStatus: finalization.status,
        consensusResult: finalization.result,
        txHash: params.existingTxHash,
        isExisting: true,
      };
    }

    // 2. Check on-chain resolution state, distinguishing confirmed unresolved from RPC errors
    try {
      const existingResolution = await getDisputeResolutionOnChain(params.disputeId);
      return {
        success: true,
        outcome: existingResolution.outcome,
        rationale: existingResolution.rationale,
        evidenceCited: existingResolution.evidence_cited || [],
        criteriaApplied: existingResolution.criteria_applied || "",
        contractAddress: TRADESURE_CONTRACT_ADDRESS,
        consensusStatus: "FINALIZED",
        txHash: resolveTxHash || params.existingTxHash || undefined,
        isExisting: true,
      };
    } catch (err: any) {
      if (!isConfirmedUnresolvedError(err)) {
        // Never submit another resolve_dispute transaction merely because an on-chain read failed
        throw new Error(
          `RPC error querying on-chain resolution for dispute ${params.disputeId}: ${err.message}. Aborting to prevent duplicate resolution submission.`
        );
      }
      // Confirmed unresolved on-chain; proceed with resolution pipeline
    }

    const existingDispute = await getDisputeOnChain(params.disputeId);
    let registerTxHash: string | undefined;

    // 3. Submit on-chain registration transaction only if not registered yet
    if (!existingDispute) {
      registerTxHash = await client.writeContract({
        address: TRADESURE_CONTRACT_ADDRESS,
        functionName: "register_dispute",
        args: [
          params.disputeId,
          params.orderId,
          onchainBuyerId,
          onchainSellerId,
          params.agreementHash,
          params.agreementTerms,
          params.claimSummary,
          manifestJson,
        ],
        value: BigInt(0),
      });

      // Wait for confirmed acceptance of registration
      const regReceipt = await (client.waitForTransactionReceipt as any)({
        hash: registerTxHash as `0x${string}`,
        status: "ACCEPTED",
      });
      const regStatus = String((regReceipt as any)?.statusName || (regReceipt as any)?.status || "");
      if (regStatus.includes("REVERT") || regStatus.includes("FAIL")) {
        throw new Error(`Dispute registration transaction failed on-chain: ${registerTxHash}`);
      }
    }

    // 4. Submit on-chain consensus resolution transaction
    resolveTxHash = await client.writeContract({
      address: TRADESURE_CONTRACT_ADDRESS,
      functionName: "resolve_dispute",
      args: [params.disputeId],
      value: BigInt(0),
    });

    if (params.onTransactionBroadcast && resolveTxHash) {
      try {
        await params.onTransactionBroadcast(resolveTxHash);
      } catch (broadcastErr) {
        console.warn("Failed to notify transaction broadcast:", broadcastErr);
      }
    }

    // Wait for protocol-confirmed FINALIZED execution state on StudioNet
    const resolveReceipt = await (client.waitForTransactionReceipt as any)({
      hash: resolveTxHash,
      status: "FINALIZED",
      interval: 2500,
      retries: 24,
    });

    // Strictly verify genuine finalization evidence without default fallbacks
    const finalizationInfo = verifyReceiptFinalized(resolveReceipt, resolveTxHash || "");

    // 5. Read the authoritative on-chain resolution from get_resolution
    const authoritativeResolution = await getDisputeResolutionOnChain(params.disputeId);

    return {
      success: true,
      outcome: authoritativeResolution.outcome,
      rationale: authoritativeResolution.rationale,
      txHash: resolveTxHash,
      registerTxHash,
      contractAddress: TRADESURE_CONTRACT_ADDRESS,
      evidenceCited: authoritativeResolution.evidence_cited || [],
      criteriaApplied: authoritativeResolution.criteria_applied || "",
      consensusStatus: finalizationInfo.status,
      consensusResult: finalizationInfo.result,
    };
  } catch (error: any) {
    return {
      success: false,
      txHash: resolveTxHash,
      error: error.message || "Failed to execute GenLayer StudioNet transaction",
    };
  }
}

/**
 * Reads live on-chain escrow state for an agreement ID.
 */
export async function getEscrowOnChain(agreementId: string): Promise<EscrowAgreementState | null> {
  const client = getGenLayerClient();
  try {
    const rawData = (await client.readContract({
      address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
      functionName: "get_escrow",
      args: [agreementId],
    })) as any;

    const lockedBalance = (await client.readContract({
      address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
      functionName: "get_locked_balance",
      args: [agreementId],
    })) as any;

    return {
      ...rawData,
      locked_balance: lockedBalance ? lockedBalance.toString() : "0",
      contract_address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    };
  } catch {
    // If agreement does not exist on-chain yet
    return null;
  }
}

/**
 * Initializes a milestone escrow agreement on-chain.
 */
export async function createEscrowOnChain(params: {
  agreementId: string;
  buyer: string;
  seller: string;
  tokenAddress?: string;
  termsHash: string;
  totalAmountWei: string | bigint;
  milestones: EscrowMilestone[];
}) {
  const client = getGenLayerClient();
  const token = params.tokenAddress || WETH_CONTRACT_ADDRESS;

  const milestonesFormatted = params.milestones.map((m, idx) => ({
    id: m.id || `m-${idx + 1}`,
    title: m.title,
    amount: Number(m.amount),
    deadline: m.deadline || "",
    acceptance_criteria: m.acceptance_criteria || "",
  }));

  const txHash = await client.writeContract({
    address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    functionName: "create_escrow",
    args: [
      params.agreementId,
      params.buyer,
      params.seller,
      token,
      params.termsHash,
      BigInt(params.totalAmountWei),
      JSON.stringify(milestonesFormatted),
    ],
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}

/**
 * Deposits tokens into escrow (approves tokens first, then locks them in TradeSureEscrow).
 */
export async function depositEscrowTokensOnChain(params: {
  agreementId: string;
  amountWei: string | bigint;
  signerPrivateKey?: `0x${string}`;
  faucetIfEmpty?: boolean;
}) {
  const client = getGenLayerClient(params.signerPrivateKey);
  const amount = BigInt(params.amountWei);

  // If testnet user needs WETH, mint via faucet
  if (params.faucetIfEmpty && client.account?.address) {
    try {
      const bal = (await client.readContract({
        address: WETH_CONTRACT_ADDRESS,
        functionName: "balance_of",
        args: [client.account.address],
      })) as any;

      if (BigInt(bal || 0) < amount) {
        const fTx = await client.writeContract({
          address: WETH_CONTRACT_ADDRESS,
          functionName: "faucet",
          args: [BigInt(2) * amount],
          value: BigInt(0),
        });
        await client.waitForTransactionReceipt({ hash: fTx });
      }
    } catch {
      // Continue to approval
    }
  }

  // 1. Approve escrow contract to spend tokens
  const approveTxHash = await client.writeContract({
    address: WETH_CONTRACT_ADDRESS,
    functionName: "approve",
    args: [TRADESURE_ESCROW_CONTRACT_ADDRESS, amount],
    value: BigInt(0),
  });
  await client.waitForTransactionReceipt({ hash: approveTxHash });

  // 2. Deposit into TradeSureEscrow
  const depositTxHash = await client.writeContract({
    address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    functionName: "deposit",
    args: [params.agreementId, amount],
    value: BigInt(0),
  });
  const receipt = await client.waitForTransactionReceipt({ hash: depositTxHash });

  return { approveTxHash, depositTxHash, receipt };
}

/**
 * Seller submits evidence for a completed milestone on-chain.
 */
export async function submitMilestoneEvidenceOnChain(params: {
  agreementId: string;
  milestoneId: string;
  evidenceHash: string;
  evidenceSummary: string;
  signerPrivateKey?: `0x${string}`;
}) {
  const client = getGenLayerClient(params.signerPrivateKey);
  const txHash = await client.writeContract({
    address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    functionName: "submit_milestone",
    args: [
      params.agreementId,
      params.milestoneId,
      params.evidenceHash,
      params.evidenceSummary,
    ],
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}

/**
 * Buyer approves and releases a milestone payout to the seller.
 */
export async function releaseMilestoneOnChain(params: {
  agreementId: string;
  milestoneId: string;
  signerPrivateKey?: `0x${string}`;
}) {
  const client = getGenLayerClient(params.signerPrivateKey);
  const txHash = await client.writeContract({
    address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    functionName: "release_milestone",
    args: [params.agreementId, params.milestoneId],
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}

/**
 * Buyer or Seller opens an escrow dispute to freeze funds.
 */
export async function openEscrowDisputeOnChain(params: {
  agreementId: string;
  milestoneId: string;
  disputeId: string;
  signerPrivateKey?: `0x${string}`;
}) {
  const client = getGenLayerClient(params.signerPrivateKey);
  const txHash = await client.writeContract({
    address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    functionName: "open_dispute",
    args: [params.agreementId, params.milestoneId, params.disputeId],
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}

/**
 * Settles locked escrow funds based on the verified resolution from TradeSureDispute.
 */
export async function settleEscrowDisputeOnChain(params: {
  agreementId: string;
  signerPrivateKey?: `0x${string}`;
}) {
  const client = getGenLayerClient(params.signerPrivateKey);
  const txHash = await client.writeContract({
    address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    functionName: "settle_dispute",
    args: [params.agreementId],
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}

/**
 * Voluntary refund from seller to buyer.
 */
export async function refundBuyerOnChain(params: {
  agreementId: string;
  signerPrivateKey?: `0x${string}`;
}) {
  const client = getGenLayerClient(params.signerPrivateKey);
  const txHash = await client.writeContract({
    address: TRADESURE_ESCROW_CONTRACT_ADDRESS,
    functionName: "refund_buyer",
    args: [params.agreementId],
    value: BigInt(0),
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}
