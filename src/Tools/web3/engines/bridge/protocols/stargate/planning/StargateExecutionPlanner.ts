import {
  BridgeAssetArgs,
  BridgeExecutionPlan,
  BridgeRouteStrategy,
} from "../../../core/BridgeTypes";
import {
  isExecutableStargateV2Resolution,
  matchesRequestedStargateExecutionMode,
  normalizeRequestedStargateExecutionMode,
} from "./resolveStargateExecutionMode";
import { buildStargateV1ExecutionPlan } from "../stargateV1/buildStargateV1ExecutionPlan";
import { buildStargateV2ExecutionPlan } from "../stargatev2/planner/buildStargateV2ExecutionPlan";
import {
  resolveV2ExecutionTarget,
  V2ExecutionTargetResolution,
} from "../stargatev2/StargateV2TokenResolver";

export type StargateExecutionPlanStrategy = BridgeRouteStrategy;

export interface StargateExecutionPlanOptions {
  strategy?: StargateExecutionPlanStrategy;
  preResolvedV2?: Extract<V2ExecutionTargetResolution, { supported: true }>;
}

export class StargateExecutionPlanner {
  static async plan(
    args: BridgeAssetArgs,
    options: StargateExecutionPlanOptions = {}
  ): Promise<BridgeExecutionPlan> {
    const strategy = options.strategy ?? args.routeStrategy ?? "auto";
    const wantsV2 = strategy !== "v1" && strategy !== "v1_pool";

    const v2Resolution =
      wantsV2 && args.srcTokenAddress
        ? options.preResolvedV2 ??
          (await resolveV2ExecutionTarget({
            fromChain: args.fromChain,
            toChain: args.toChain,
            srcTokenAddress: args.srcTokenAddress,
            recipient: args.recipient,
            amount: BigInt(args.amount),
            ...(args.slippageBps != null ? { slippageBps: args.slippageBps } : {}),
            ...(args.transportMode != null ? { transportMode: args.transportMode } : {}),
          }))
        : undefined;

    if (
      strategy !== "auto" &&
      v2Resolution?.supported &&
      !matchesRequestedStargateExecutionMode(strategy, v2Resolution.executionMode)
    ) {
      throw new Error(
        `Requested ${strategy} but resolved ${v2Resolution.executionMode} for this Stargate route.`
      );
    }

    const executionMode =
      strategy === "auto"
        ? v2Resolution?.supported && isExecutableStargateV2Resolution(v2Resolution)
          ? normalizeRequestedStargateExecutionMode("auto", v2Resolution)
          : "v1_pool"
        : normalizeRequestedStargateExecutionMode(
            strategy,
            v2Resolution?.supported ? v2Resolution : undefined
          );

    switch (executionMode) {
      case "v2_router":
      case "v2_adapter":
      case "v2_oft":
        if (v2Resolution?.supported) {
          return buildStargateV2ExecutionPlan(args, v2Resolution);
        }
        throw new Error("No classified Stargate V2 route found.");

      case "v1_pool":
      default:
        return buildStargateV1ExecutionPlan(args);
    }
  }
}
