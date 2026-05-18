import { Address, getAddress } from "viem";
import { resolveChainKey } from "../../../../../clients/viem/viemChains";
import { getStargateRouterForChain } from "./stargateRouters";
import { getLayerZeroTransferRoutingHint } from "../../../shared/layerZeroTransferRegistry";

export type StargateExecutionSurface = "oft" | "router" | "adapter" | "asset0" | "unknown";

export interface StargateOftRegistryEntry {
  // Minimal routing hints only: adapter-backed tokens and asset0-style routes.
  chain: string;
  address: Address;
  symbol?: string;
  canonicalId?: string;
  protocolVersion: "v2";
  executionSurface: StargateExecutionSurface;
  executionModeHint?: "v2_adapter";
  confidence: "high";
  router?: Address | null;
  metadata?: {
    source?: "manual" | "deployment-list" | "verified-runtime";
    notes?: string;
  };
}

const STARGATE_OFT_REGISTRY_OVERLAY: Record<string, Record<string, StargateOftRegistryEntry>> = {
  polygon: {
    [getAddress("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359").toLowerCase()]: {
      chain: "polygon",
      address: getAddress("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"),
      symbol: "USDC",
      canonicalId: "stablecoin:usdc",
      protocolVersion: "v2",
      executionSurface: "adapter",
      executionModeHint: "v2_adapter",
      confidence: "high",
      router: null,
      metadata: {
        source: "manual",
        notes: "Polygon native USDC should resolve through Stargate V2 adapter-backed routing so matcher output can map the canonical destination token instead of echoing the source address.",
      },
    },
    [getAddress("0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A").toLowerCase()]: {
      chain: "polygon",
      address: getAddress("0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A"),
      symbol: "weth",
      canonicalId: "wrapped:ether",
      protocolVersion: "v2",
      executionSurface: "adapter",
      executionModeHint: "v2_adapter",
      confidence: "high",
      router: null,
      metadata: {
        source: "manual",
        notes: "Polygon WETH is routed through adapter-backed Stargate V2 execution; the registry should prefer the router path instead of direct OFT peer inspection on the token address.",
      },
    },
  },
  base: {
     [getAddress("0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a").toLowerCase()]: {
      chain: "base",
      address: getAddress("0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a"),
      symbol: "aUSD",
      canonicalId: "stablecoin:ausd",
      protocolVersion: "v2",
      executionSurface: "asset0",
      confidence: "high",
      router: null,
      metadata: {
        source: "manual",
        notes: "Base aUSD requires asset0 hub or multihop routing. Do not classify it as a direct OFT from registry hints.",
      },
    },
    [getAddress("0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A").toLowerCase()]: {
      chain: "base",
      address: getAddress("0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A"),
      symbol: "weth",
      canonicalId: "wrapped:ether",
      protocolVersion: "v2",
      executionSurface: "adapter",
      executionModeHint: "v2_adapter",
      confidence: "high",
      router: null,
      metadata: {
        source: "manual",
        notes: "Base WETH is routed through adapter-backed Stargate V2 execution; the registry should prefer the router path instead of direct OFT peer inspection on the token address.",
      },
    },
    [getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase()]: {
      chain: "base",
      address: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
      symbol: "USDC",
      canonicalId: "stablecoin:usdc",
      protocolVersion: "v2",
      executionSurface: "adapter",
      executionModeHint: "v2_adapter",
      confidence: "high",
      router: null,
      metadata: {
        source: "manual",
        notes: "Base native USDC is the canonical destination-side asset for Stargate V2 adapter-backed stablecoin routing.",
      },
    },
  },
};

export function getStargateOftRegistryEntry(chain: string, address: Address): StargateOftRegistryEntry | null {
  const resolvedChain = resolveChainKey(chain);
  return STARGATE_OFT_REGISTRY_OVERLAY[resolvedChain]?.[getAddress(address).toLowerCase()] ?? null;
}

export function hasStargateOftRegistryEntry(chain: string, address: Address): boolean {
  return getStargateOftRegistryEntry(chain, address) != null;
}

export async function resolveStargateOftRoutingHint(
  chain: string,
  address: Address
): Promise<StargateOftRegistryEntry | null> {
  const resolvedChain = resolveChainKey(chain);
  const normalizedAddress = getAddress(address);
  const overlayHint = getStargateOftRegistryEntry(resolvedChain, normalizedAddress);

  // Keep explicit asset0 exceptions deterministic until the public API offers a robust signal.
  const overlayRouter = await getStargateRouterForChain(resolvedChain);

  if (overlayHint?.executionSurface === "asset0") {
    return {
      ...overlayHint,
      router: overlayRouter,
    };
  }

  const dynamicHint = await getLayerZeroTransferRoutingHint(resolvedChain, normalizedAddress);
  if (dynamicHint?.executionSurface === "adapter") {
    return {
      chain: resolvedChain,
      address: normalizedAddress,
      ...(dynamicHint.symbol ? { symbol: dynamicHint.symbol } : {}),
      protocolVersion: "v2",
      executionSurface: "adapter",
      executionModeHint: "v2_adapter",
      confidence: "high",
      router: overlayRouter,
      metadata: {
        source: "deployment-list",
        notes: "LayerZero transfer metadata reports an adapter-backed deployment for this token on the source chain.",
      },
    };
  }

  if (dynamicHint?.executionSurface === "oft") {
    return {
      chain: resolvedChain,
      address: normalizedAddress,
      ...(dynamicHint.symbol ? { symbol: dynamicHint.symbol } : {}),
      protocolVersion: "v2",
      executionSurface: "oft",
      confidence: "high",
      metadata: {
        source: "deployment-list",
        notes: "LayerZero transfer metadata reports a direct OFT deployment for this token on the source chain.",
      },
    };
  }

  if (!overlayHint) {
    return null;
  }

  return {
    ...overlayHint,
    router: overlayRouter,
  };
}

export { STARGATE_OFT_REGISTRY_OVERLAY as STARGATE_OFT_REGISTRY };
