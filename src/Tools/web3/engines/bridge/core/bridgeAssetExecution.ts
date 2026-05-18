import { formatUnits } from "viem";
import { TokenIdentityResolver } from "../identity/TokenIdentityResolver";
import { resolveChainKey, viemChains } from  "../../../clients/viem/viemChains";
import { selectBridgeProvider } from "./providers/selectProvider";
import { BridgeAssetArgs, BridgeExecutionPlan, BridgePlanStep } from "./BridgeTypes";

type NativeCurrencyMetadata = {
  symbol: string;
  decimals: number;
};

export type BridgeAssetResponseField =
  | "status"
  | "simulated"
  | "executed"
  | "dryRun"
  | "provider"
  | "reason"
  | "approval"
  | "summary"
  | "plan"
  | "txHashes";

export const BRIDGE_ASSET_RESPONSE_FIELD_ENUM: BridgeAssetResponseField[] = [
  "status",
  "simulated",
  "executed",
  "dryRun",
  "provider",
  "reason",
  "approval",
  "summary",
  "plan",
  "txHashes",
];

const DEFAULT_RESPONSE_FIELDS: BridgeAssetResponseField[] = [
  "status",
  "simulated",
  "executed",
  "dryRun",
  "provider",
  "summary",
  "approval",
  "plan",
  "txHashes",
];

function serializeBigInts<T>(value: T): T {
  if (typeof value === "bigint") {
    return value.toString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInts(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        serializeBigInts(nestedValue),
      ])
    ) as T;
  }

  return value;
}

function compactStep(step: BridgePlanStep, includeRawStepData: boolean) {
  if (includeRawStepData) {
    return serializeBigInts(step);
  }

  if (step.tool === "write_contract") {
    return {
      type: step.type,
      tool: step.tool,
      description: step.description ?? null,
      target: step.args.address,
      functionName: step.args.functionName,
      argCount: Array.isArray(step.args.args) ? step.args.args.length : 0,
      value: step.args.value ?? null,
      chain: step.args.chain,
    };
  }

  return {
    type: step.type,
    tool: step.tool,
    description: step.description ?? null,
    target: step.args.to,
    value: step.args.value ?? null,
    chain: step.args.chain,
  };
}

function compactPlan(plan: BridgeExecutionPlan, includeRawStepData: boolean) {
  const serialized = serializeBigInts(plan);
  return {
    provider: serialized.provider,
    fromChain: serialized.fromChain,
    toChain: serialized.toChain,
    token: serialized.token,
    amount: serialized.amount,
    recipient: serialized.recipient,
    slippageBps: serialized.slippageBps,
    fee: serialized.fee,
    approval: serialized.approval,
    steps: serialized.steps.map((step) => compactStep(step as BridgePlanStep, includeRawStepData)),
    metadata: serialized.metadata,
  };
}

function getNativeCurrencyMetadata(chainKey: string): NativeCurrencyMetadata {
  const resolvedChainKey = resolveChainKey(chainKey as any);
  const nativeCurrency = viemChains[resolvedChainKey]?.nativeCurrency;

  return {
    symbol: nativeCurrency?.symbol ?? resolvedChainKey.toUpperCase(),
    decimals: nativeCurrency?.decimals ?? 18,
  };
}

function getBridgeTokenMetadata(plan: BridgeExecutionPlan): { symbol: string; decimals: number } {
  const resolvedIdentity = TokenIdentityResolver.resolveIdentity({
    chain: plan.fromChain,
    symbol: String(plan.metadata["tokenSymbol"] ?? plan.token ?? "").trim(),
    decimals: Number(plan.metadata["tokenDecimals"] ?? null),
  });

  const metadataSymbol = String(plan.metadata["tokenSymbol"] ?? plan.token ?? "TOKEN").trim();
  const metadataDecimals = Number(plan.metadata["tokenDecimals"] ?? resolvedIdentity.decimals ?? 18);

  return {
    symbol: (resolvedIdentity.symbol ?? metadataSymbol) || plan.token,
    decimals: Number.isFinite(metadataDecimals) ? metadataDecimals : 18,
  };
}

function formatAmount(rawAmount: string | null, decimals: number): string | null {
  if (rawAmount == null) {
    return null;
  }

  try {
    return formatUnits(BigInt(rawAmount), decimals);
  } catch {
    return null;
  }
}

function buildSummary(plan: BridgeExecutionPlan) {
  const serialized = serializeBigInts(plan);
  const tokenMetadata = getBridgeTokenMetadata(plan);
  const nativeCurrency = getNativeCurrencyMetadata(plan.fromChain);
  const estimatedReceived = String(serialized.metadata["estimatedReceived"] ?? null);
  const approvalAmount = String(serialized.approval.amount);

  return {
    route: `${serialized.fromChain} -> ${serialized.toChain}`,
    token: serialized.token,
    amount: serialized.amount,
    amountFormatted: formatAmount(serialized.amount, tokenMetadata.decimals),
    amountSymbol: tokenMetadata.symbol,
    amountDecimals: tokenMetadata.decimals,
    estimatedReceived,
    estimatedReceivedFormatted: formatAmount(estimatedReceived === "null" ? null : estimatedReceived, tokenMetadata.decimals),
    estimatedReceivedSymbol: tokenMetadata.symbol,
    quotedNativeFee: serialized.fee.quotedNativeFee,
    quotedNativeFeeFormatted: formatAmount(serialized.fee.quotedNativeFee, nativeCurrency.decimals),
    quotedNativeFeeSymbol: nativeCurrency.symbol,
    approvalRequired: serialized.approval.required,
    approvalAmount,
    approvalAmountFormatted: formatAmount(approvalAmount, tokenMetadata.decimals),
    approvalAmountSymbol: tokenMetadata.symbol,
    stepCount: serialized.steps.length,
    mode: serialized.metadata["mode"] ?? null,
    resolutionSource: serialized.metadata["resolutionSource"] ?? null,
  };
}

function selectResponseFields(
  payload: Record<string, unknown>,
  fields: BridgeAssetResponseField[]
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, payload[field]]));
}

export function normalizeBridgeAssetResponseFields(fields?: string[] | null): BridgeAssetResponseField[] {
  const allowed = new Set<BridgeAssetResponseField>(BRIDGE_ASSET_RESPONSE_FIELD_ENUM);
  const normalized = (fields ?? [])
    .map((value) => String(value ?? "").trim())
    .filter((value): value is BridgeAssetResponseField => allowed.has(value as BridgeAssetResponseField));

  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_RESPONSE_FIELDS;
}

export async function runBridgeAsset(
  args: BridgeAssetArgs
): Promise<Record<string, unknown>> {
  const dryRun = Boolean(args.dryRun ?? true);
  const fields = normalizeBridgeAssetResponseFields(args.fields);
  const includeRawStepData = args.includeRawStepData === true;
  // Pass routeStrategy to selectBridgeProvider if present
  const selection = await selectBridgeProvider(args, args.routeStrategy);

  if (selection.status !== "supported" || !selection.provider || !selection.matchedArgs) {
    return {
      status: selection.status,
      provider: selection.provider?.id ?? null,
      reason: selection.reason ?? null,
      details: selection.details ?? null,
    };
  }

  const { provider, matchedArgs } = selection;

  if (dryRun) {
    const simulation = await provider.simulate(matchedArgs);
    const payload = {
      status: "supported",
      simulated: true,
      executed: false,
      dryRun: true,
      plan: compactPlan(simulation.plan, includeRawStepData),
      txHashes: [],
      provider: provider.id,
      reason: null,
      summary: buildSummary(simulation.plan),
      approval: {
        ...serializeBigInts(simulation.plan.approval),
        amount: simulation.plan.approval.amount.toString(),
      },
    };

    return selectResponseFields(payload, fields);
  }

  const execution = await provider.execute({ ...matchedArgs, dryRun: false });

  const payload = {
    status: "supported",
    simulated: execution.simulated,
    executed: execution.executed,
    dryRun: execution.dryRun,
    plan: compactPlan(execution.plan, includeRawStepData),
    txHashes: execution.txHashes,
    provider: provider.id,
    reason: null,
    summary: buildSummary(execution.plan),
    approval: {
      ...serializeBigInts(execution.plan.approval),
      amount: execution.plan.approval.amount.toString(),
    },
  };

  return selectResponseFields(payload, fields);
}
