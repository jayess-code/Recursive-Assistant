// StargatePlanBuilder.ts

import { createViemWalletClient } from "../../../../../clients/viem/createViemWalletClient";
import { ChainKey } from "../../../../../clients/viem/viem-types";
import {
  BridgeAssetArgs,
  BridgeExecutionPlan,
  BridgeRouteStrategy,
} from "../../../core/BridgeTypes";
import { resolveChainKey } from "../../../../../clients/viem/viemChains";
import { StargateRouteSupportAssessment } from "../assessment/StargateAssessment";
import { StargateExecutionPlanner } from "./StargateExecutionPlanner";

export async function buildPlan(
  assessment: StargateRouteSupportAssessment,
  matchedArgs: BridgeAssetArgs
): Promise<BridgeExecutionPlan> {
  if (assessment.status !== "supported") {
    throw new Error(assessment.reason);
  }

  const fromChain = resolveChainKey(String(matchedArgs.fromChain || "").trim() as ChainKey);
  const walletClient = createViemWalletClient(fromChain);

  const strategy: BridgeRouteStrategy =
    matchedArgs.routeStrategy ?? "auto";

  return StargateExecutionPlanner.plan(
    {
      ...matchedArgs,
      sender: walletClient.account.address,
      routeStrategy: strategy,
    },
    {
      strategy,
      ...(assessment.status === "supported" && assessment.strategy === "v2_execution_truth"
        ? { preResolvedV2: assessment.v2Match.resolution }
        : {}),
    }
  );
}
