import {
  BridgeAssetArgs,
  BridgeExecutionPlan,
  BridgePlanStep,
} from "../../../../core/BridgeTypes";
import {
  buildBaseStargateV2ExecutionPlan,
  prepareStargateV2ExecutionContext,
  STARGATE_V2_ABI,
} from "../execution/shared";
import { SupportedV2Resolution } from "../planner/types";

export async function buildAsset0ExecutionPlan(
  args: BridgeAssetArgs,
  preResolved?: SupportedV2Resolution
): Promise<BridgeExecutionPlan> {
  const context = await prepareStargateV2ExecutionContext(args, preResolved);

  if (context.resolution.executionMode !== "v2_oft") {
    throw new Error("Resolved Stargate V2 route is not an OFT execution mode.");
  }

  const steps: BridgePlanStep[] = [
    {
      type: "bridge",
      tool: "write_contract",
      description: "Execute Stargate V2 send via OFT token",
      args: {
        chain: context.resolvedFrom,
        address: context.resolution.executionTarget,
        abi: STARGATE_V2_ABI,
        functionName: "send",
        args: [context.params, args.recipient],
        value: context.bufferedFee.toString(),
      },
    },
  ];

  return buildBaseStargateV2ExecutionPlan(args, context, steps, "v2_oft");
}
