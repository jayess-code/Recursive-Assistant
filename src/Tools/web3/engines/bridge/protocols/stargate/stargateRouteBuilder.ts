import { BridgeAssetArgs, BridgeRoute } from "../../core/BridgeTypes";
import { StargateExecutionPlanner } from "./planning/StargateExecutionPlanner";

export class StargateRouteBuilder {
  static async buildRoute(args: BridgeAssetArgs): Promise<BridgeRoute | null> {
    try {
      // Use the planner's auto strategy to select V1 or V2 as appropriate
      const plan = await StargateExecutionPlanner.plan(args, { strategy: "auto" });

      return {
        provider: plan.provider,
        fromChain: plan.fromChain,
        toChain: plan.toChain,
        srcToken: plan.token,
        dstToken: String(plan.metadata.dstToken ?? plan.token),
        amount: plan.amount,
        estimatedReceived: null,
        fee: {
          native: BigInt(plan.fee.bufferedNativeFee),
        },
        timeEstimate: "fast",
        riskLevel: "low",
        executionPlan: plan,
        metadata: plan.metadata,
      };
    } catch (err: any) {
      // Return null if not executable, but log the actual error for debugging
      if (err?.message?.includes("No executable Stargate pool-graph or V2 route")) {
        // This is the new execution-truth-based error
        return null;
      }
      // For other errors, optionally rethrow or handle as needed
      return null;
    }
  }
}
