import { Address } from "viem";
import { ContractCapabilities } from "../../runtime/StargateContractClassifier";
import { V2ExecutionCandidate } from "../resolver/types";

export function resolveTaggedOftSurface(args: {
  tokenAddress: Address;
  capability: ContractCapabilities | null;
}): V2ExecutionCandidate | null {
  if (args.capability?.executionMode !== "v2_oft") {
    return null;
  }

  return {
    executionTarget: args.tokenAddress,
    executionTargetType: "token",
    executionSurface: "oft",
    executionMode: "v2_oft",
    selectionSource: args.capability.identitySource === "registry" ? "registry" : "token_capability",
    attributionSource: "probe_fallback",
    identityConfidence: args.capability.executionModeConfidence ?? args.capability.confidence ?? "medium",
    executionConfidence: args.capability.supportsQuoteSend === true ? "high" : "medium",
  };
}
