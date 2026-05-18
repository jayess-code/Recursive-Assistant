import { Address } from "viem";
import { ContractCapabilities } from "../../runtime/StargateContractClassifier";
import { StargateOftRegistryEntry } from "../../discovery/stargateOftRegistry";
import { V2ExecutionCandidate } from "../resolver/types";

export function resolveOftSurface(args: {
  tokenAddress: Address;
  capability: ContractCapabilities | null;
  routingHint?: StargateOftRegistryEntry | null;
}): V2ExecutionCandidate | null {
  if (args.routingHint?.executionSurface === "asset0") {
    return null;
  }

  const supportsDirectOft =
    args.capability?.executionMode === "v2_oft" ||
    args.capability?.supportsQuoteSend === true;

  if (!supportsDirectOft) {
    return null;
  }

  return {
    executionTarget: args.tokenAddress,
    executionTargetType: "token",
    executionSurface: "oft",
    executionMode: "v2_oft",
    selectionSource: "token_capability",
    attributionSource:
      args.routingHint?.metadata?.source === "deployment-list" ? "layerzero_api" : "probe_fallback",
    identityConfidence: args.capability?.executionModeConfidence ?? args.capability?.confidence ?? "medium",
    executionConfidence: args.capability?.supportsQuoteSend === true ? "high" : "medium",
  };
}
