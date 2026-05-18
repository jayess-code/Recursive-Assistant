import {
  BridgeAssetArgs,
  BridgeCapabilityDiscoveryArgs,
  BridgeExecutionResult,
  BridgeProviderCapabilities,
  BridgeSimulationResult,
} from "../BridgeTypes";

export interface BridgeProvider {
  readonly id: string;
  match(args: BridgeAssetArgs): Promise<BridgeAssetArgs | null>;
  discoverCapabilities?(args: BridgeCapabilityDiscoveryArgs): Promise<BridgeProviderCapabilities>;
  simulate(args: BridgeAssetArgs): Promise<BridgeSimulationResult>;
  execute(args: BridgeAssetArgs): Promise<BridgeExecutionResult>;
  assessRouteSupport?(args: BridgeAssetArgs): Promise<any>;
}

export interface BridgeProviderSelection {
  status: "supported" | "unsupported" | "known_not_executable";
  provider?: BridgeProvider;
  matchedArgs?: BridgeAssetArgs;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface SupportedBridgeProviderSelection extends BridgeProviderSelection {
  status: "supported";
  provider: BridgeProvider;
  matchedArgs: BridgeAssetArgs;
}
