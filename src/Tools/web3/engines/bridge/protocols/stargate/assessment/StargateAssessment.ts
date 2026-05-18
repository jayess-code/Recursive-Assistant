// StargateAssessment.ts
import { BridgeAssetArgs } from "../../../core/BridgeTypes";
import { CrossChainMatchResult } from "../stargateV1/stargateV1CrossChainMatcher";
import { StargateCrossChainMatcher, StargateCrossChainMatchResult, StargateMatchStrategy } from "../matcher/StargateCrossChainMatcher";
import { NormalizedBridgeInput, resolveV1SourceTokenAddress } from "../shared/StargateNormalizer";

type SupportedV2Match = Extract<StargateCrossChainMatchResult, { version: "v2" }>; 

export type StargateRouteSupportAssessment =
  | {
      status: "supported";
      strategy: "v1_pool_graph";
      matchedArgs: BridgeAssetArgs;
      crossChainMatch: CrossChainMatchResult;
    }
  | {
      status: "supported";
      strategy: "v2_execution_truth";
      matchedArgs: BridgeAssetArgs;
      crossChainMatch?: undefined;
      v2Match: SupportedV2Match;
    }
  | {
      status: "unsupported" | "known_not_executable";
      reason: string;
      details?: Record<string, unknown>;
    };

export function buildAssessmentCacheKey(input: NormalizedBridgeInput): string {
  return JSON.stringify({
    fromChain: input.fromChain,
    toChain: input.toChain,
    token: input.token,
    amount: input.amount,
    recipient: input.recipient,
    slippageBps: input.slippageBps,
    transportMode: input.transportMode,
    srcTokenAddress: input.srcTokenAddress ?? null,
    dstTokenAddress: input.dstTokenAddress ?? null,
  });
}

export function buildV1MatchedArgs(normalized: NormalizedBridgeInput, match: CrossChainMatchResult): BridgeAssetArgs {
  return {
    fromChain: normalized.fromChain,
    toChain: normalized.toChain,
    token: normalized.token,
    amount: normalized.amount,
    recipient: normalized.recipient,
    slippageBps: normalized.slippageBps,
    dryRun: normalized.dryRun,
    transportMode: normalized.transportMode,
    srcTokenAddress: match.srcToken,
    dstTokenAddress: match.dstToken,
  };
}

export async function assessUnifiedRouteSupport(
  normalized: NormalizedBridgeInput,
  routeStrategy?: StargateMatchStrategy
): Promise<Extract<StargateRouteSupportAssessment, { status: "supported" }> | null> {
  const sourceTokenAddress = normalized.srcTokenAddress ?? resolveV1SourceTokenAddress(normalized);
  if (!sourceTokenAddress) {
    return null;
  }

  const match = await StargateCrossChainMatcher.match({
    fromChain: normalized.fromChain,
    toChain: normalized.toChain,
    tokenAddress: sourceTokenAddress,
    recipient: normalized.recipient,
    amount: BigInt(normalized.amount),
    slippageBps: normalized.slippageBps,
    routeStrategy: routeStrategy ?? "auto",
  });

  if (!match.supported) {
    return null;
  }

  if (match.version === "v2") {
    return {
      status: "supported",
      strategy: "v2_execution_truth",
      v2Match: match,
      matchedArgs: {
        fromChain: normalized.fromChain,
        toChain: normalized.toChain,
        token: normalized.token,
        amount: normalized.amount,
        recipient: normalized.recipient,
        slippageBps: normalized.slippageBps,
        dryRun: normalized.dryRun,
        transportMode: normalized.transportMode,
        srcTokenAddress: normalized.srcTokenAddress ?? match.srcToken,
        dstTokenAddress: normalized.dstTokenAddress ?? match.dstToken,
      },
    };
  }

  return {
    status: "supported",
    strategy: "v1_pool_graph",
    matchedArgs: buildV1MatchedArgs(normalized, match),
    crossChainMatch: match,
  };
}

