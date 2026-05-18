import { Address, zeroAddress } from "viem";
import { StargateOftRegistryEntry } from "../../discovery/stargateOftRegistry";
import { V2ExecutionCandidate } from "../resolver/types";

export function resolveAsset0Surface(args: {
  router: Address;
  routingHint?: StargateOftRegistryEntry | null;
}): V2ExecutionCandidate | null {
  if (args.routingHint?.executionSurface !== "asset0") {
    return null;
  }

  if (args.router === zeroAddress) {
    return null;
  }

  return {
    executionTarget: args.router,
    executionTargetType: "router",
    executionSurface: "asset0",
    executionMode: "v2_adapter",
    selectionSource: "registry",
    attributionSource: "asset0_overlay",
    identityConfidence: "high",
    executionConfidence: "medium",
  };
}
