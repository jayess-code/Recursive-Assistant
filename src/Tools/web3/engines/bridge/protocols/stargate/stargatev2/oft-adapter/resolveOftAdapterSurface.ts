import { Address, zeroAddress } from "viem";
import { ContractCapabilities } from "../../runtime/StargateContractClassifier";
import { StargateOftRegistryEntry } from "../../discovery/stargateOftRegistry";
import { V2ExecutionCandidate } from "../resolver/types";

export function resolveOftAdapterSurface(args: {
  router: Address;
  capability?: ContractCapabilities | null;
  routingHint?: StargateOftRegistryEntry | null;
}): V2ExecutionCandidate | null {
  const hasExplicitAdapterHint =
    args.routingHint?.executionSurface === "adapter" ||
    args.routingHint?.executionModeHint === "v2_adapter";
  const isAsset0 = args.routingHint?.executionSurface === "asset0";
  const canFallbackToRouter = args.capability?.supportsQuoteSend === false;

  if (args.router === zeroAddress || isAsset0 || (!hasExplicitAdapterHint && !canFallbackToRouter)) {
    return null;
  }

  return {
    executionTarget: args.router,
    executionTargetType: "router",
    executionSurface: "adapter",
    executionMode: "v2_adapter",
    selectionSource: hasExplicitAdapterHint ? "registry" : "surface_probe",
    attributionSource:
      hasExplicitAdapterHint && args.routingHint?.metadata?.source === "deployment-list"
        ? "layerzero_api"
        : "probe_fallback",
    identityConfidence:
      hasExplicitAdapterHint
        ? "high"
        : args.capability?.executionModeConfidence ?? args.capability?.confidence ?? "medium",
    executionConfidence: "medium",
  };
}
