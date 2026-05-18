import { Address, zeroAddress } from "viem";
import { V2RoutingGraphStatus } from "../resolver/types";

export function buildOftAdapterRoutingGraph(router: Address): V2RoutingGraphStatus {
  const routeWired = router !== zeroAddress;
  const reason = routeWired ? null : "No Stargate router is configured for this adapter route.";

  return {
    routeType: "adapter_router",
    routeWired,
    peer: null,
    endpoint: null,
    sendLibrary: null,
    executorConfigReady: true,
    dvnConfigReady: true,
    deadDvnPresent: false,
    configValid: routeWired,
    ...(reason ? { reason } : {}),
  };
}
