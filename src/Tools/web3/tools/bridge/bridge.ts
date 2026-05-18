import { getViemPublicClient } from "../../clients/viem/getViemPublicClient";
import {
  runBridgeAsset,
  BRIDGE_ASSET_RESPONSE_FIELD_ENUM,
} from "../../engines/bridge/core/bridgeAssetExecution";
import { BridgeAssetArgs, BridgeRouteStrategy } from "../../engines/bridge/core/BridgeTypes";
import { serializeBigIntValues } from "../types/serialization";

export type BridgeQuoteToolArgs = {
  fromChain: string;
  toChain: string;
  token: string;
  amount: string;
  recipient: `0x${string}`;
  srcTokenAddress?: `0x${string}` | null;
  dstTokenAddress?: `0x${string}` | null;
  slippageBps?: number | null;
  transportMode?: "taxi" | "bus" | null;
  routeStrategy?: BridgeRouteStrategy | null;
  fields?: string[] | null;
  includeRawStepData?: boolean | null;
}

export type BridgeExecuteToolArgs = BridgeQuoteToolArgs & {
  dryRun?: boolean | null;
}

export type BridgeStatusToolArgs = {
  fromChain: string;
  txHash: `0x${string}`;
  providerHint?: string | null;
  includeReceipt?: boolean | null;
  includeTransaction?: boolean | null;
}

function normalizeBridgeFields(fields?: string[] | null): string[] | null {
  if (!fields?.length) {
    return null;
  }

  const allowed = new Set(BRIDGE_ASSET_RESPONSE_FIELD_ENUM);
  const normalized = fields
    .map((value) => String(value ?? "").trim())
    .filter((value) => allowed.has(value as (typeof BRIDGE_ASSET_RESPONSE_FIELD_ENUM)[number]));

  return normalized.length ? Array.from(new Set(normalized)) : null;
}

function toBridgeAssetArgs(args: BridgeQuoteToolArgs, dryRun: boolean): BridgeAssetArgs {
  return {
    fromChain: args.fromChain,
    toChain: args.toChain,
    token: args.token,
    amount: args.amount,
    recipient: args.recipient,
    ...(args.srcTokenAddress ? { srcTokenAddress: args.srcTokenAddress } : {}),
    ...(args.dstTokenAddress ? { dstTokenAddress: args.dstTokenAddress } : {}),
    ...(args.slippageBps != null ? { slippageBps: args.slippageBps } : {}),
    ...(args.transportMode ? { transportMode: args.transportMode } : {}),
    ...(args.routeStrategy ? { routeStrategy: args.routeStrategy } : {}),
    fields: normalizeBridgeFields(args.fields),
    includeRawStepData: args.includeRawStepData ?? false,
    dryRun,
  };
}

export async function bridgeQuote(args: BridgeQuoteToolArgs) {
  try {
    const result = await runBridgeAsset(toBridgeAssetArgs(args, true));
    return {
      mode: "quote",
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      mode: "quote",
      status: "error",
      provider: null,
      reason: "Bridge simulation failed",
      details: message,
    };
  }
}

export async function bridgeExecute(args: BridgeExecuteToolArgs) {
  try {
    const dryRun = args.dryRun ?? false;
    const result = await runBridgeAsset(toBridgeAssetArgs(args, dryRun));

    return {
      mode: dryRun ? "execute_preview" : "execute",
      ...result,
    };
  } catch (error) {
    const dryRun = args.dryRun ?? false;
    const message = error instanceof Error ? error.message : String(error);
    return {
      mode: dryRun ? "execute_preview" : "execute",
      status: "error",
      provider: null,
      reason: "Bridge execution failed",
      details: message,
    };
  }
}

export async function bridgeStatus(args: BridgeStatusToolArgs) {
  const client = getViemPublicClient(args.fromChain);
  const txHash = args.txHash;
  let receipt: Record<string, unknown> | null = null;
  let transaction: Record<string, unknown> | null = null;

  try {
    const rawReceipt = await client.getTransactionReceipt({ hash: txHash });
    receipt = serializeBigIntValues(rawReceipt as unknown as Record<string, unknown>);
  } catch {
    receipt = null;
  }

  if (!receipt) {
    try {
      const rawTx = await client.getTransaction({ hash: txHash });
      transaction = serializeBigIntValues(rawTx as unknown as Record<string, unknown>);
    } catch {
      transaction = null;
    }
  }

  const latestBlock = await client.getBlockNumber().catch(() => null);

  if (receipt) {
    const status = String((receipt.status ?? "")).toLowerCase();
    const receiptBlock = receipt.blockNumber != null ? BigInt(String(receipt.blockNumber)) : null;
    const confirmations =
      latestBlock != null && receiptBlock != null && latestBlock >= receiptBlock
        ? Number(latestBlock - receiptBlock + 1n)
        : null;

    return {
      state: status === "success" ? "source_confirmed" : "failed",
      terminal: status !== "success" || confirmations !== null,
      fromChain: args.fromChain,
      txHash,
      providerHint: args.providerHint ?? null,
      confirmations,
      latestBlock: latestBlock?.toString() ?? null,
      nextPollSeconds: status === "success" ? 30 : 15,
      receipt: args.includeReceipt === true ? receipt : undefined,
      transaction: args.includeTransaction === true ? transaction : undefined,
    };
  }

  if (transaction) {
    return {
      state: "pending",
      terminal: false,
      fromChain: args.fromChain,
      txHash,
      providerHint: args.providerHint ?? null,
      confirmations: 0,
      latestBlock: latestBlock?.toString() ?? null,
      nextPollSeconds: 12,
      receipt: args.includeReceipt === true ? null : undefined,
      transaction: args.includeTransaction === true ? transaction : undefined,
    };
  }

  return {
    state: "unknown",
    terminal: false,
    fromChain: args.fromChain,
    txHash,
    providerHint: args.providerHint ?? null,
    confirmations: null,
    latestBlock: latestBlock?.toString() ?? null,
    nextPollSeconds: 20,
    reason: "Transaction hash not found on source chain yet.",
    receipt: args.includeReceipt === true ? null : undefined,
    transaction: args.includeTransaction === true ? null : undefined,
  };
}
