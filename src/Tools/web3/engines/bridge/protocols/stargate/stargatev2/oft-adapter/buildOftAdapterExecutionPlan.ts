import {
  BridgeAssetArgs,
  BridgeExecutionPlan,
  BridgePlanStep,
} from "../../../../core/BridgeTypes";
import { SupportedV2Resolution } from "../planner/types";
import {
  buildBaseStargateV2ExecutionPlan,
  ERC20_APPROVE_ABI,
  prepareStargateV2ExecutionContext,
} from "../execution/shared";
import { AdapterQuoteSendParams } from "../resolver/types";
import { getViemPublicClient } from "../../../../../../clients/viem/getViemPublicClient";

function isStructuralAdapterSimulationFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("function does not exist") ||
    normalized.includes("function selector was not recognized") ||
    normalized.includes("returned no data") ||
    normalized.includes("no matching function")
  );
}

const STARGATE_V2_ADAPTER_ABI = [
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
        ],
      },
      { name: "refundAddress", type: "address" },
    ],
    outputs: [],
  },
] as const;

export async function buildOftAdapterExecutionPlan(
  args: BridgeAssetArgs,
  preResolved?: SupportedV2Resolution
): Promise<BridgeExecutionPlan> {
  const context = await prepareStargateV2ExecutionContext(args, preResolved);

  if (context.resolution.executionMode !== "v2_adapter") {
    throw new Error("Resolved Stargate V2 route is not an adapter execution mode.");
  }

  if (!args.srcTokenAddress) {
    throw new Error("srcTokenAddress is required for Stargate V2 adapter execution plan");
  }

  const params = context.params as AdapterQuoteSendParams;

  const client = getViemPublicClient(context.resolvedFrom);
  try {
    await client.simulateContract({
      address: context.resolution.executionTarget,
      abi: STARGATE_V2_ADAPTER_ABI,
      functionName: "send",
      args: [params, args.recipient],
      account: args.sender ?? args.recipient,
      value: context.bufferedFee,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isStructuralAdapterSimulationFailure(reason)) {
      throw new Error(`Stargate V2 adapter send simulation failed: ${reason}`);
    }
  }

  const steps: BridgePlanStep[] = [
    {
      type: "approval",
      tool: "write_contract",
      description: "Approve Stargate V2 adapter router to spend source token",
      args: {
        chain: context.resolvedFrom,
        address: args.srcTokenAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [context.resolution.executionTarget, context.amountLD],
        value: null,
      },
    },
    {
      type: "bridge",
      tool: "write_contract",
      description: "Execute Stargate V2 send via adapter router",
      args: {
        chain: context.resolvedFrom,
        address: context.resolution.executionTarget,
        abi: STARGATE_V2_ADAPTER_ABI,
        functionName: "send",
        args: [params, args.recipient],
        value: context.bufferedFee.toString(),
      },
    },
  ];

  return buildBaseStargateV2ExecutionPlan(args, context, steps, "v2_adapter");
}
