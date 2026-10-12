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

/**
 * Executes authentic on-chain dispute resolution via GenLayer StudioNet.
 * Directly submits writeContract transaction to the deployed contract with required parameters.
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
}) {
  const client = getGenLayerClient();
  const manifestJson = JSON.stringify(params.evidenceManifest);

  // Authorize caller on-chain: if buyerId is an internal ID, use client wallet address
  const onchainBuyerId =
    params.buyerId.startsWith("0x") && params.buyerId.length === 42
      ? params.buyerId
      : (client.account?.address || "0x0000000000000000000000000000000000000000");
  const onchainSellerId =
    params.sellerId.startsWith("0x") && params.sellerId.length === 42
      ? params.sellerId
      : "0x0000000000000000000000000000000000000001";

  try {
    // 1. Submit on-chain registration transaction
    const registerTxHash = await client.writeContract({
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

    // Wait for the on-chain registration receipt
    const regReceipt = await client.waitForTransactionReceipt({ hash: registerTxHash });

    // 2. Submit on-chain consensus resolution transaction
    const resolveTxHash = await client.writeContract({
      address: TRADESURE_CONTRACT_ADDRESS,
      functionName: "resolve_dispute",
      args: [params.disputeId],
      value: BigInt(0),
    });

    // Wait for the resolution receipt
    const resolveReceipt = await client.waitForTransactionReceipt({ hash: resolveTxHash });

    // 3. Read the actual on-chain resolution determined by GenLayer multi-validator consensus
    const onchainResolution = (await client.readContract({
      address: TRADESURE_CONTRACT_ADDRESS,
      functionName: "get_resolution",
      args: [params.disputeId],
    })) as any;

    const outcome = onchainResolution?.outcome || "INCONCLUSIVE";
    const rationale = onchainResolution?.rationale || "Arbitration completed by GenLayer validator consensus.";
    const evidenceCited = onchainResolution?.evidence_cited || [];
    const criteriaApplied = onchainResolution?.criteria_applied || "Product condition & delivery criteria";

    return {
      success: true,
      outcome,
      rationale,
      txHash: resolveTxHash,
      registerTxHash,
      contractAddress: TRADESURE_CONTRACT_ADDRESS,
      evidenceCited,
      criteriaApplied,
      consensusStatus: (resolveReceipt as any).result_name || (resolveReceipt as any).resultName || "FINALIZED",
    };
  } catch (error: any) {
    return {
      success: false,
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
