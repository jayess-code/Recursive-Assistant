import {
  BridgeAssetArgs,
  BridgeExecutionPlan,
  BridgePlanStep,
} from "../../../../core/BridgeTypes";
import { resolveChainKey } from "../../../../../../clients/viem/viemChains";
import {
  buildOFTQuoteSendParams,
  resolveV2ExecutionTarget,
  V2ExecutionTargetResolution,
} from "../StargateV2TokenResolver";

export const STARGATE_V2_ABI = [
  {
    name: "quoteSend",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
      },
      { name: "payInLzToken", type: "bool" },
    ],
    outputs: [
      { name: "nativeFee", type: "uint256" },
      { name: "lzTokenFee", type: "uint256" },
    ],
  },
  {
    name: "send",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
      },
      { name: "refundAddress", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export interface PreparedStargateV2ExecutionContext {
  resolvedFrom: ReturnType<typeof resolveChainKey>;
  resolvedTo: ReturnType<typeof resolveChainKey>;
  amountLD: bigint;
  nativeFee: bigint;
  bufferedFee: bigint;
  params: Extract<V2ExecutionTargetResolution, { supported: true }>['params'];
  resolution: Extract<V2ExecutionTargetResolution, { supported: true }>;
}

export async function prepareStargateV2ExecutionContext(
  args: BridgeAssetArgs,
  preResolved?: Extract<V2ExecutionTargetResolution, { supported: true }>
): Promise<PreparedStargateV2ExecutionContext> {
  const resolvedFrom = resolveChainKey(args.fromChain);
  const resolvedTo = resolveChainKey(args.toChain);

  if (!args.srcTokenAddress) {
    throw new Error("srcTokenAddress is required for Stargate V2 execution plan");
  }

  const amountLD = BigInt(args.amount);
  const resolution =
    preResolved ??
    (await resolveV2ExecutionTarget({
      fromChain: resolvedFrom,
      toChain: resolvedTo,
      srcTokenAddress: args.srcTokenAddress,
      recipient: args.recipient,
      amount: amountLD,
      ...(args.slippageBps != null ? { slippageBps: args.slippageBps } : {}),
      ...(args.transportMode != null ? { transportMode: args.transportMode } : {}),
    }));

  if (!resolution.supported) {
    throw new Error(resolution.reason);
  }

  const isAdapterExecution = resolution.executionMode === "v2_adapter";
  const canProceedWithAdapter = isAdapterExecution && resolution.executionValid !== false;

  if (resolution.executionValid !== true && !canProceedWithAdapter) {
    throw new Error(
      resolution.validationReason ??
        "Stargate V2 execution target could not be validated for this route."
    );
  }

  const nativeFee = resolution.nativeFee;
  const bufferedFee = (nativeFee * 110n) / 100n;
  const params =
    resolution.params ??
    buildOFTQuoteSendParams({
      dstEid: resolution.dstEid,
      recipient: args.recipient,
      amount: amountLD,
      ...(args.slippageBps != null ? { slippageBps: args.slippageBps } : {}),
      ...(args.transportMode != null ? { transportMode: args.transportMode } : {}),
    });

  return {
    resolvedFrom,
    resolvedTo,
    amountLD,
    nativeFee,
    bufferedFee,
    params,
    resolution,
  };
}

export function buildBaseStargateV2ExecutionPlan(
  args: BridgeAssetArgs,
  context: PreparedStargateV2ExecutionContext,
  steps: BridgePlanStep[],
  executionMode: "v2_router" | "v2_adapter" | "v2_oft"
): BridgeExecutionPlan {
  const executionTarget = context.resolution.executionTarget;
  const executionTargetType = context.resolution.executionTargetType;

  if (!args.srcTokenAddress) {
    throw new Error("srcTokenAddress is required for Stargate V2 execution plan");
  }

  const requiresApproval = executionMode === "v2_router" || executionMode === "v2_adapter";

  return {
    provider: "stargate_v2",
    executionMode,
    fromChain: context.resolvedFrom,
    toChain: context.resolvedTo,
    token: args.token,
    amount: args.amount,
    recipient: args.recipient,
    slippageBps: args.slippageBps ?? 100,
    fee: {
      quotedNativeFee: context.nativeFee.toString(),
      bufferedNativeFee: context.bufferedFee.toString(),
      bufferBps: 1000,
    },
    approval: {
      required: requiresApproval,
      token: args.srcTokenAddress,
      spender: requiresApproval ? executionTarget : null,
      amount: context.amountLD,
    },
    steps,
    metadata: {
      dstEid: context.resolution.dstEid,
      dstToken: context.resolution.dstToken,
      isV2: true,
      mechanism: context.resolution.mechanism,
      executionSurface: context.resolution.executionSurface,
      selectionSource: context.resolution.selectionSource,
      attributionSource: context.resolution.attributionSource,
      executionMode,
      executionTarget,
      executionTargetType,
    },
  };
}
