import { Address, ChainKey } from "../../../../clients/viem/viem-types";
import { getAddress } from "viem";

interface HopRouteConfig {
  bridgeAddress: Address;
  destinationChainId: number;
}

export interface HopRouteDefinition {
  fromChain: ChainKey;
  toChain: ChainKey;
  token: string;
  bridgeAddress: Address;
  destinationChainId: number;
}

// Registry is intentionally minimal and explicit; expand as routes are validated in production.
const HOP_ROUTES: Partial<Record<ChainKey, Partial<Record<ChainKey, Record<string, HopRouteConfig>>>>> = {
  ethereum: {
    arbitrum: {
      USDC: {
        bridgeAddress: "0x3666f603CC164936c1b87e207F36Beba4AC5f18a",
        destinationChainId: 42161,
      },
    },
    polygon: {
      USDC: {
        bridgeAddress: "0x3666f603CC164936c1b87e207F36Beba4AC5f18a",
        destinationChainId: 137,
      },
    },
  },
  mainnet: {
    arbitrum: {
      USDC: {
        bridgeAddress: "0x3666f603CC164936c1b87e207F36Beba4AC5f18a",
        destinationChainId: 42161,
      },
    },
    polygon: {
      USDC: {
        bridgeAddress: "0x3666f603CC164936c1b87e207F36Beba4AC5f18a",
        destinationChainId: 137,
      },
    },
  },
};

export function getHopRouteConfig(fromChain: ChainKey, toChain: ChainKey, token: string): HopRouteConfig {
  const symbol = String(token || "").trim().toUpperCase();
  const route = HOP_ROUTES[fromChain]?.[toChain]?.[symbol];
  if (!route) {
    throw new Error(`Hop route not configured for ${symbol} ${fromChain}->${toChain}.`);
  }

  return {
    bridgeAddress: getAddress(route.bridgeAddress) as Address,
    destinationChainId: route.destinationChainId,
  };
}

export function hasHopSupport(fromChain: ChainKey, toChain: ChainKey, token: string): boolean {
  const symbol = String(token || "").trim().toUpperCase();
  return Boolean(HOP_ROUTES[fromChain]?.[toChain]?.[symbol]);
}

export function listHopRoutes(): HopRouteDefinition[] {
  const routes: HopRouteDefinition[] = [];

  for (const [fromChain, destinations] of Object.entries(HOP_ROUTES)) {
    for (const [toChain, tokens] of Object.entries(destinations ?? {})) {
      for (const [token, route] of Object.entries(tokens ?? {})) {
        routes.push({
          fromChain: fromChain as ChainKey,
          toChain: toChain as ChainKey,
          token,
          bridgeAddress: getAddress(route.bridgeAddress) as Address,
          destinationChainId: route.destinationChainId,
        });
      }
    }
  }

  return routes;
}
