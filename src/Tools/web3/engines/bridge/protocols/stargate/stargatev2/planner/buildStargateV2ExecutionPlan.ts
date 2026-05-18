import { BridgeAssetArgs, BridgeExecutionPlan } from "../../../../core/BridgeTypes";
import { isExecutableStargateV2Resolution } from "../../planning/resolveStargateExecutionMode";
import { buildAsset0ExecutionPlan } from "../asset0/buildAsset0ExecutionPlan";
import { buildOftAdapterExecutionPlan } from "../oft-adapter/buildOftAdapterExecutionPlan";
import { buildOftExecutionPlan } from "../oft/buildOftExecutionPlan";
import { resolveV2ExecutionTarget } from "../resolver/resolveV2ExecutionTarget";
import { V2ExecutionTargetResolution } from "../resolver/types";

export async function buildStargateV2ExecutionPlan(
  args: BridgeAssetArgs,
  preResolved?: Extract<V2ExecutionTargetResolution, { supported: true }>
): Promise<BridgeExecutionPlan> {
  if (!args.srcTokenAddress) {
    throw new Error("srcTokenAddress is required for Stargate V2 execution plan");
  }

  const resolution =
    preResolved ??
    (await resolveV2ExecutionTarget({
      fromChain: args.fromChain,
      toChain: args.toChain,
      srcTokenAddress: args.srcTokenAddress,
      recipient: args.recipient,
      amount: BigInt(args.amount),
      ...(args.slippageBps != null ? { slippageBps: args.slippageBps } : {}),
      ...(args.transportMode != null ? { transportMode: args.transportMode } : {}),
    }));

  if (!resolution.supported) {
    throw new Error(resolution.reason);
  }

  if (!isExecutableStargateV2Resolution(resolution)) {
    // throw new Error(
    //   resolution.validationReason ??
    //     `Resolved ${resolution.executionMode}, but only validated simple V2 OFT execution is enabled right now.`
    // );
    // allow routing, but enforce correct builder usage
  }

  switch (resolution.executionMode) {
    case "v2_asset0":
      return buildAsset0ExecutionPlan(args, resolution);
    case "v2_oft":
      return buildOftExecutionPlan(args, resolution);
    case "v2_adapter":
      return buildOftAdapterExecutionPlan(args, resolution);
    default:
      throw new Error("Unable to derive a Stargate V2 execution mode for this route.");
  }
}
