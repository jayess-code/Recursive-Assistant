import {
  fetchTokenDisplayMetadata,
  TokenDisplayMetadata,
} from "../../../shared/fetchTokenDisplayMetadata";
import { StargateBridgeExecutionMode } from "../../../core/BridgeTypes";
import { resolveMatchedDstTokenAddress } from "../shared/StargateNormalizer";
import { isExecutableStargateV2Resolution } from "../planning/resolveStargateExecutionMode";
import { Address, getAddress, zeroAddress } from "viem";
import {
  resolveV2ExecutionTarget,
  V2ExecutionAttributionSource,
  StargateV2ExecutionSurface,
  V2ExecutionTargetResolution,
} from "./StargateV2TokenResolver";
import { resolveChainKey } from "../../../../../clients/viem/viemChains";

export interface V2MatchRequest {
  fromChain: string;
  toChain: string;
  tokenAddress: Address;
  recipient?: Address;
  amount?: bigint;
  slippageBps?: number;
}

export interface V2MatchResult {
  supported: boolean;
  reason?: string;
  fromChain: string;
  toChain: string;
  srcToken: Address;
  dstToken: Address;
  router: Address;
  executionTarget: Address;
  executionTargetType: "router" | "token" | "adapter" | "unknown";
  executionMode: StargateBridgeExecutionMode;
  mechanism: "oft";
  metadata: {
    mechanism: "oft";
    validation: "quoteSend" | "routing_graph";
    executionTarget: "router" | "token" | "adapter" | "unknown";
    executionTargetAddress: Address;
    executionSurface: StargateV2ExecutionSurface;
    executionMode: StargateBridgeExecutionMode;
    dstEid?: number;
    executionValid: boolean | "unknown";
    capabilityConfidence: "high" | "medium" | "low";
    identityConfidence: "high" | "medium" | "low";
    executionConfidence: "high" | "medium" | "low";
    executionModeConfidence?: "high" | "medium" | "low";
    attributionSource?: V2ExecutionAttributionSource;
    lastQuoteError?: string;
    srcTokenMetadata?: TokenDisplayMetadata | null;
    dstTokenMetadata?: TokenDisplayMetadata | null;
    validationReason?: string;
    validationClassification?: string;
  };
  resolution?: Extract<V2ExecutionTargetResolution, { supported: true }>;
}

export function shouldSurfaceV2Match(
  resolution?: V2ExecutionTargetResolution | null
): boolean {
  if (!resolution?.supported) {
    return false;
  }

  if (isExecutableStargateV2Resolution(resolution)) {
    return true;
  }

  const isVisibleOftCandidate =
    resolution.executionMode === "v2_oft" &&
    resolution.executionValid === "unknown" &&
    resolution.executionTargetType === "token";

  const isVisibleAdapterCandidate =
    resolution.executionMode === "v2_adapter" &&
    resolution.executionValid === "unknown" &&
    resolution.executionTargetType === "router";

  return Boolean(
    (isVisibleOftCandidate || isVisibleAdapterCandidate) &&
      resolution.executionTarget !== zeroAddress &&
      resolution.identityConfidence !== "low"
  );
}

export class StargateV2Matcher {
  static async match(args: V2MatchRequest): Promise<V2MatchResult> {
    const resolvedFrom = resolveChainKey(args.fromChain);
    const resolvedTo = resolveChainKey(args.toChain);
    const token = getAddress(args.tokenAddress);
    const fallbackDstToken = resolveMatchedDstTokenAddress({
      fromChain: resolvedFrom,
      toChain: resolvedTo,
      tokenAddress: token,
    });

    const resolution = await resolveV2ExecutionTarget({
      fromChain: resolvedFrom,
      toChain: resolvedTo,
      srcTokenAddress: token,
      ...(args.recipient != null ? { recipient: args.recipient } : {}),
      ...(args.amount != null ? { amount: args.amount } : {}),
      ...(args.slippageBps != null ? { slippageBps: args.slippageBps } : {}),
    });

    const dstToken = resolution.dstToken ?? fallbackDstToken;
    const [srcTokenMetadata, dstTokenMetadata] = await Promise.all([
      fetchTokenDisplayMetadata({ chain: resolvedFrom, address: token }).catch(() => null),
      fetchTokenDisplayMetadata({ chain: resolvedTo, address: dstToken }).catch(() => null),
    ]);

    if (!resolution.supported) {
      return this.unsupported(
        args,
        resolution.reason,
        resolution.router,
        resolution.dstEid,
        resolution.identityConfidence,
        {
          executionTarget: resolution.executionTarget,
          executionTargetType: resolution.executionTargetType,
          executionSurface: resolution.executionSurface,
          executionMode: resolution.executionMode,
          executionValid: resolution.executionValid,
          identityConfidence: resolution.identityConfidence,
          executionConfidence: resolution.executionConfidence,
          ...(resolution.executionModeConfidence != null
            ? { executionModeConfidence: resolution.executionModeConfidence }
            : {}),
          attributionSource: resolution.attributionSource,
          ...(resolution.lastQuoteError != null ? { lastQuoteError: resolution.lastQuoteError } : {}),
          validationReason: resolution.validationReason ?? resolution.reason,
          validationClassification: resolution.validationClassification,
          validation: resolution.validationClassification === "quote_ok" ? "quoteSend" : "routing_graph",
          ...(srcTokenMetadata != null ? { srcTokenMetadata } : {}),
          ...(dstTokenMetadata != null ? { dstTokenMetadata } : {}),
          dstToken,
        }
      );
    }

    if (!shouldSurfaceV2Match(resolution)) {
      return this.unsupported(
        args,
        resolution.validationReason ??
          `Resolved ${resolution.executionMode}, but only validated simple V2 OFT routes are executable right now.`,
        resolution.router,
        resolution.dstEid,
        resolution.identityConfidence,
        {
          executionTarget: resolution.executionTarget,
          executionTargetType: resolution.executionTargetType,
          executionSurface: resolution.executionSurface,
          executionMode: resolution.executionMode,
          executionValid: resolution.executionValid,
          identityConfidence: resolution.identityConfidence,
          executionConfidence: resolution.executionConfidence,
          ...(resolution.executionModeConfidence != null
            ? { executionModeConfidence: resolution.executionModeConfidence }
            : {}),
          attributionSource: resolution.attributionSource,
          ...(resolution.lastQuoteError != null ? { lastQuoteError: resolution.lastQuoteError } : {}),
          validationClassification: resolution.validationClassification,
          ...(resolution.validationReason != null ? { validationReason: resolution.validationReason } : {}),
          ...(srcTokenMetadata != null ? { srcTokenMetadata } : {}),
          ...(dstTokenMetadata != null ? { dstTokenMetadata } : {}),
          dstToken,
        }
      );
    }

    return {
      supported: true,
      ...(resolution.executionValid === true
        ? {}
        : resolution.validationReason != null
          ? { reason: resolution.validationReason }
          : {}),
      fromChain: resolvedFrom,
      toChain: resolvedTo,
      srcToken: token,
      dstToken,
      router: resolution.router,
      executionTarget: resolution.executionTarget,
      executionTargetType: resolution.executionTargetType,
      executionMode: resolution.executionMode,
      mechanism: "oft",
      metadata: {
        mechanism: "oft",
        validation: resolution.executionValid === true ? "quoteSend" : "routing_graph",
        executionTarget: resolution.executionTargetType,
        executionTargetAddress: resolution.executionTarget,
        executionSurface: resolution.executionSurface,
        executionMode: resolution.executionMode,
        ...(resolution.dstEid != null ? { dstEid: resolution.dstEid } : {}),
        executionValid: resolution.executionValid,
        capabilityConfidence: resolution.executionConfidence,
        identityConfidence: resolution.identityConfidence,
        executionConfidence: resolution.executionConfidence,
        ...(resolution.executionModeConfidence != null
          ? { executionModeConfidence: resolution.executionModeConfidence }
          : {}),
        attributionSource: resolution.attributionSource,
        ...(resolution.lastQuoteError != null ? { lastQuoteError: resolution.lastQuoteError } : {}),
        ...(srcTokenMetadata != null ? { srcTokenMetadata } : {}),
        ...(dstTokenMetadata != null ? { dstTokenMetadata } : {}),
        ...(resolution.validationReason != null ? { validationReason: resolution.validationReason } : {}),
        validationClassification: resolution.validationClassification,
      },
      resolution,
    };
  }

  private static unsupported(
    args: V2MatchRequest,
    reason: string,
    router: Address = zeroAddress,
    dstEid?: number,
    capabilityConfidence: "high" | "medium" | "low" = "low",
    details?: {
      executionTarget?: Address;
      executionTargetType?: "router" | "token" | "adapter" | "unknown";
      executionSurface?: StargateV2ExecutionSurface;
      executionMode?: StargateBridgeExecutionMode;
      executionValid?: boolean | "unknown";
      identityConfidence?: "high" | "medium" | "low";
      executionConfidence?: "high" | "medium" | "low";
      validationReason?: string;
      validationClassification?: string;
      validation?: "quoteSend" | "routing_graph";
      executionModeConfidence?: "high" | "medium" | "low";
      attributionSource?: V2ExecutionAttributionSource;
      lastQuoteError?: string;
      srcTokenMetadata?: TokenDisplayMetadata | null;
      dstTokenMetadata?: TokenDisplayMetadata | null;
      dstToken?: Address;
    }
  ): V2MatchResult {
    return {
      supported: false,
      reason,
      fromChain: args.fromChain,
      toChain: args.toChain,
      srcToken: args.tokenAddress,
      dstToken: details?.dstToken ??
        resolveMatchedDstTokenAddress({
          fromChain: args.fromChain,
          toChain: args.toChain,
          tokenAddress: args.tokenAddress,
        }),
      router,
      executionTarget: details?.executionTarget ?? zeroAddress,
      executionTargetType: details?.executionTargetType ?? "unknown",
      executionMode: details?.executionMode ?? "unknown",
      mechanism: "oft",
      metadata: {
        mechanism: "oft",
        validation: details?.validation ?? "routing_graph",
        executionTarget: details?.executionTargetType ?? "unknown",
        executionTargetAddress: details?.executionTarget ?? zeroAddress,
        executionSurface: details?.executionSurface ?? "unknown",
        executionMode: details?.executionMode ?? "unknown",
        ...(dstEid != null ? { dstEid } : {}),
        executionValid: details?.executionValid ?? false,
        capabilityConfidence,
        identityConfidence: details?.identityConfidence ?? capabilityConfidence,
        executionConfidence: details?.executionConfidence ?? "low",
        ...(details?.executionModeConfidence != null
          ? { executionModeConfidence: details.executionModeConfidence }
          : {}),
        attributionSource: details?.attributionSource ?? "unknown",
        ...(details?.lastQuoteError != null ? { lastQuoteError: details.lastQuoteError } : {}),
        ...(details?.srcTokenMetadata !== undefined ? { srcTokenMetadata: details.srcTokenMetadata } : {}),
        ...(details?.dstTokenMetadata !== undefined ? { dstTokenMetadata: details.dstTokenMetadata } : {}),
        ...(details?.validationReason != null
          ? { validationReason: details.validationReason }
          : { validationReason: reason }),
        validationClassification: details?.validationClassification ?? "unsupported",
      },
    };
  }
}