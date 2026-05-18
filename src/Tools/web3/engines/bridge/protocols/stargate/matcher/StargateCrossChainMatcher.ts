import {
  StargateBridgeExecutionMode,
  BridgeRouteStrategy,
} from "../../../core/BridgeTypes";
import { matchesRequestedStargateExecutionMode } from "../planning/resolveStargateExecutionMode";
import { resolveMatchedDstTokenAddress } from "../shared/StargateNormalizer";
import { StargateIntrospector } from "../runtime/StargateIntrospector";
import {
  CrossChainMatchResult,
  StargateV1Matcher,
} from "../stargateV1/stargateV1CrossChainMatcher";
import {
  V2MatchRequest,
  V2MatchResult,
  StargateV2Matcher,
} from "../stargatev2/StargateV2CrossChainMatcher";

export type StargateMatchStrategy = BridgeRouteStrategy;

export interface StargateCrossChainMatchRequest extends V2MatchRequest {
  routeStrategy?: StargateMatchStrategy;
}

type StargateExecutionType = "pool" | "oft";

type StargateMatchExecutionHints = {
  executionMode: StargateBridgeExecutionMode;
  mechanism: StargateExecutionType;
  execution: {
    type: StargateExecutionType;
  };
  executionHints: {
    poolId?: number;
    executionTarget?: "router" | "token" | "adapter" | "unknown";
  };
  confidence: "high" | "medium" | "low";
};

export type StargateCrossChainMatchResult =
  | (({ version: "v1" } & CrossChainMatchResult) & StargateMatchExecutionHints)
  | (({ version: "v2" } & V2MatchResult) & StargateMatchExecutionHints);

export function shouldPreserveV2FailureContext(
  match?: V2MatchResult | null
): match is V2MatchResult {
  return Boolean(
    match &&
      (match.executionMode !== "unknown" ||
        match.executionTargetType !== "unknown" ||
        match.metadata.validationClassification === "oft_like")
  );
}

export class StargateCrossChainMatcher {
  static async match(
    args: StargateCrossChainMatchRequest
  ): Promise<StargateCrossChainMatchResult> {
    const strategy = args.routeStrategy ?? "auto";
    const wantsV1Only = strategy === "v1" || strategy === "v1_pool";
    const wantsV2Only =
      strategy === "v2" ||
      strategy === "v2_router" ||
      strategy === "v2_adapter" ||
      strategy === "v2_oft";

    const introspection = await StargateIntrospector.probeChain(args.fromChain).catch(() => null);

    let v2Failure: string | undefined;
    let v1Failure: string | undefined;
    let lastV2Match: V2MatchResult | undefined;

    if (!wantsV1Only) {
      const v2Match = await StargateV2Matcher.match(args);
      lastV2Match = v2Match;

      if (v2Match.supported) {
        if (
          strategy !== "auto" &&
          !matchesRequestedStargateExecutionMode(strategy, v2Match.executionMode)
        ) {
          v2Failure = `Resolved ${v2Match.executionMode} but ${strategy} was requested.`;
        } else {
          return {
            ...v2Match,
            version: "v2",
            executionMode: v2Match.executionMode,
            mechanism: "oft",
            execution: { type: "oft" },
            executionHints: {
              executionTarget:
                v2Match.executionTargetType ?? v2Match.metadata.executionTarget ?? "unknown",
            },
            confidence:
              v2Match.metadata.executionValid === true
                ? "high"
                : v2Match.metadata.capabilityConfidence,
          };
        }
      } else {
        v2Failure = v2Match.reason;
      }

      if (wantsV2Only) {
        return {
          ...v2Match,
          supported: false,
          version: "v2",
          reason: this.buildUnsupportedReason(strategy, undefined, v2Failure),
          executionMode: v2Match.executionMode,
          mechanism: "oft",
          execution: { type: "oft" },
          executionHints: {
            executionTarget:
              v2Match.executionTargetType ?? v2Match.metadata.executionTarget ?? "unknown",
          },
          confidence: "low",
        };
      }
    }

    const failureMechanism: StargateExecutionType =
      v2Failure || introspection?.type === "stargate_v2" ? "oft" : "pool";

    if (!wantsV2Only) {
      const v1Match = await StargateV1Matcher.match({
        fromChain: args.fromChain,
        toChain: args.toChain,
        tokenAddress: args.tokenAddress,
      });

      if (v1Match.supported) {
        return {
          ...v1Match,
          version: "v1",
          executionMode: "v1_pool",
          mechanism: "pool",
          execution: { type: "pool" },
          executionHints: {
            poolId: v1Match.srcPoolId,
          },
          confidence: "high",
        };
      }

      v1Failure = v1Match.reason;

      if (shouldPreserveV2FailureContext(lastV2Match)) {
        return {
          ...lastV2Match,
          supported: false,
          version: "v2",
          reason: this.buildUnsupportedReason(strategy, v1Failure, v2Failure),
          executionMode: lastV2Match.executionMode,
          mechanism: "oft",
          execution: { type: "oft" },
          executionHints: {
            executionTarget:
              lastV2Match.executionTargetType ?? lastV2Match.metadata.executionTarget ?? "unknown",
          },
          confidence: lastV2Match.metadata.identityConfidence,
        };
      }

      return {
        ...v1Match,
        version: "v1",
        executionMode: "unknown",
        reason: this.buildUnsupportedReason(strategy, v1Failure, v2Failure),
        mechanism: failureMechanism,
        execution: {
          type: failureMechanism,
        },
        executionHints: {},
        confidence: "low",
      };
    }

    return this.buildFailure(args, {
      reason: this.buildUnsupportedReason(strategy, v1Failure, v2Failure),
      mechanism: failureMechanism,
      confidence: "low",
    });
  }

  private static buildFailure(
    args: StargateCrossChainMatchRequest,
    options: {
      reason: string;
      mechanism: StargateExecutionType;
      confidence: "low" | "medium";
    }
  ): StargateCrossChainMatchResult {
    return {
      supported: false,
      reason: options.reason,
      version: "v1",
      fromChain: args.fromChain,
      toChain: args.toChain,
      srcToken: args.tokenAddress,
      dstToken: resolveMatchedDstTokenAddress({
        fromChain: args.fromChain,
        toChain: args.toChain,
        tokenAddress: args.tokenAddress,
      }),
      srcPoolId: -1,
      dstPoolId: -1,
      router: "0x0000000000000000000000000000000000000000",
      metadata: {},
      executionMode: "unknown",
      mechanism: options.mechanism,
      execution: { type: options.mechanism },
      executionHints: {},
      confidence: options.confidence,
    };
  }

  private static buildUnsupportedReason(
    strategy: StargateMatchStrategy,
    v1Reason?: string,
    v2Reason?: string
  ): string {
    if (
      strategy === "v2" ||
      strategy === "v2_router" ||
      strategy === "v2_adapter" ||
      strategy === "v2_oft"
    ) {
      return v2Reason ?? "No supported Stargate V2 route found.";
    }

    if (strategy === "v1" || strategy === "v1_pool") {
      return v1Reason ?? "No supported Stargate V1 route found.";
    }

    return `No supported Stargate route found (V2: ${
      v2Reason ?? "failed"
    }, V1: ${v1Reason ?? "failed"})`;
  }
}