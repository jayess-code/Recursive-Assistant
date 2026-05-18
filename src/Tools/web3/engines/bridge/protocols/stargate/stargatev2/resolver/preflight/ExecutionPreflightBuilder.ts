import { Address, PublicClient } from "viem";
import { addressToBytes32 } from "../../utils/address";
import { buildExecutorOptions, ensureHex } from "../../utils/encoding";
import { buildQuoteParams } from "../quoteBuilders/buildQuoteParams";
import {
  ExecutionPreflight,
  V2ExecutionCandidate,
  V2ResolutionConfidence,
  V2RoutingGraphStatus,
} from "../types";

const ENFORCED_OPTIONS_ABI = [
  {
    name: "enforcedOptions",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "dstEid", type: "uint32" },
      { name: "msgType", type: "uint16" },
    ],
    outputs: [{ type: "bytes" }],
  },
] as const;

export type ExecutionPreflightQuoteArgs = {
  dstEid: number;
  recipient: Address;
  amount: bigint;
  slippageBps?: number;
  transportMode?: "taxi" | "bus";
  strictMinAmount?: boolean;
  asset0HubEid?: number;
  asset0FinalDstEid?: number;
};

export type ExecutionPreflightBuilderArgs = {
  candidate: V2ExecutionCandidate;
  quoteArgs: ExecutionPreflightQuoteArgs;
  routingGraph: V2RoutingGraphStatus;
  client?: PublicClient;
};

export { buildExecutorOptions };

function deriveMinAmountLD(amount: bigint, slippageBps: number = 100): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

async function readEnforcedOptions(
  client: PublicClient | undefined,
  target: Address,
  dstEid: number,
  msgType: number
): Promise<`0x${string}` | null> {
  if (!client) {
    return null;
  }

  try {
    const result = await client.readContract({
      address: target,
      abi: ENFORCED_OPTIONS_ABI,
      functionName: "enforcedOptions",
      args: [dstEid, msgType],
    });

    const normalized = ensureHex(result as `0x${string}`);
    return normalized === "0x" ? null : normalized;
  } catch {
    return null;
  }
}

function mergeExtraOptions(
  enforcedOptions: `0x${string}` | null,
  defaultOptions: `0x${string}`
): `0x${string}` {
  if (!enforcedOptions || enforcedOptions === "0x") {
    return defaultOptions;
  }

  // LayerZero sums duplicate executor options, so appending our fallback on top of
  // enforced options can over-allocate gas and trigger worker option validation failures.
  return enforcedOptions;
}

function getExecutionConfidence(preflight: ExecutionPreflight): V2ResolutionConfidence {
  if (preflight.ready) {
    return "high";
  }

  if (preflight.executorValid || preflight.dvnValid) {
    return "medium";
  }

  return "low";
}

export function deriveExecutionConfidenceFromPreflight(
  preflight: ExecutionPreflight
): V2ResolutionConfidence {
  return getExecutionConfidence(preflight);
}

export async function buildExecutionPreflight(
  args: ExecutionPreflightBuilderArgs
): Promise<ExecutionPreflight> {
  const msgType = 1;
  const gasLimit = 200000n;
  const transportMode = args.quoteArgs.transportMode ?? "taxi";
  const isAdapter =
    args.candidate.executionSurface === "adapter" || args.candidate.executionSurface === "asset0";
  const defaultOptions = buildExecutorOptions({
    dstEid: args.quoteArgs.dstEid,
    gasLimit,
    msgType,
  });
  const enforcedOptions = await readEnforcedOptions(
    args.client,
    args.candidate.executionTarget,
    args.quoteArgs.dstEid,
    msgType
  );
  const extraOptions = mergeExtraOptions(enforcedOptions, defaultOptions);

  const minAmountLD =
    args.candidate.executionMode === "v2_oft"
      ? 0n
      : args.quoteArgs.strictMinAmount
        ? args.quoteArgs.amount
        : deriveMinAmountLD(args.quoteArgs.amount, args.quoteArgs.slippageBps ?? 100);

  const quoteParams = (() => {
    switch (args.candidate.executionSurface) {
      case "adapter":
        return buildQuoteParams("adapter", {
          dstEid: args.quoteArgs.dstEid,
          recipient: args.quoteArgs.recipient,
          amount: args.quoteArgs.amount,
          minAmountLD,
          extraOptions,
        });

      case "asset0":
        if (args.quoteArgs.asset0HubEid && args.quoteArgs.asset0FinalDstEid) {
          return buildQuoteParams("asset0", {
            hubEid: args.quoteArgs.asset0HubEid,
            finalDstEid: args.quoteArgs.asset0FinalDstEid,
            recipient: args.quoteArgs.recipient,
            amount: args.quoteArgs.amount,
          });
        }

        return null;

      case "oft":
      default:
        return buildQuoteParams("oft", {
          dstEid: args.quoteArgs.dstEid,
          recipient: args.quoteArgs.recipient,
          amount: args.quoteArgs.amount,
          transportMode,
          minAmountLD,
          extraOptions,
        });
    }
  })();

  const fallbackParams = {
    dstEid: args.quoteArgs.dstEid,
    to: addressToBytes32(args.quoteArgs.recipient),
    amountLD: args.quoteArgs.amount,
    minAmountLD,
    extraOptions,
    composeMsg: "0x" as const,
    oftCmd: transportMode === "bus" ? ("0x00" as const) : ("0x" as const),
  };
  const params = quoteParams ?? fallbackParams;
  const baseReason =
    quoteParams == null
      ? "Asset0 hub parameters are missing for quote construction."
      : args.routingGraph.reason;

  const basePreflight: ExecutionPreflight = {
    params,
    recipient: args.quoteArgs.recipient,
    msgType,
    dvnValid: isAdapter ? true : args.routingGraph.dvnConfigReady && !args.routingGraph.deadDvnPresent,
    executorValid: isAdapter ? true : args.routingGraph.executorConfigReady,
    ready: false,
    ...(baseReason != null ? { reason: baseReason } : {}),
  };

  if (!args.routingGraph.routeWired) {
    return {
      ...basePreflight,
      ready: false,
      reason: args.routingGraph.reason ?? "Routing graph is not wired for this destination.",
    };
  }

  if (isAdapter) {
    const reason =
      basePreflight.params.extraOptions === "0x"
        ? "Execution options could not be constructed for this adapter route."
        : null;

    return {
      ...basePreflight,
      ready: basePreflight.params.extraOptions !== "0x",
      ...(reason ? { reason } : {}),
    };
  }

  if (args.routingGraph.deadDvnPresent) {
    return {
      ...basePreflight,
      ready: false,
      dvnValid: false,
      reason: args.routingGraph.reason ?? "DVN config contains the LayerZero dead DVN placeholder.",
    };
  }

  if (!basePreflight.executorValid) {
    return {
      ...basePreflight,
      ready: false,
      reason: args.routingGraph.reason ?? "Executor config is missing for this route.",
    };
  }

  if (!basePreflight.dvnValid) {
    return {
      ...basePreflight,
      ready: false,
      reason: args.routingGraph.reason ?? "DVN config is invalid for this route.",
    };
  }

  if (basePreflight.params.extraOptions === "0x") {
    return {
      ...basePreflight,
      ready: false,
      executorValid: false,
      reason: "Execution options could not be constructed for this route.",
    };
  }

  return {
    ...basePreflight,
    ready: true,
  };
}
