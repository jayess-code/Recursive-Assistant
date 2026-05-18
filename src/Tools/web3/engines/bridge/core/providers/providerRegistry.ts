import { BridgeProvider } from "./BridgeProvider";
import { HopProvider } from "../../protocols/hop/HopProvider";
import { StargateProvider } from "../../protocols/stargate/StargateProvider";

const PROVIDERS: BridgeProvider[] = [new StargateProvider(), new HopProvider()];

export function listBridgeProviders(): BridgeProvider[] {
  return [...PROVIDERS];
}
