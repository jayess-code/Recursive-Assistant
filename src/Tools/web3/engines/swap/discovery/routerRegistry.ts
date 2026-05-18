import { Address, ChainKey } from "../../../clients/viem/viem-types";
import { SwapExecutionFamily } from "../core/SwapTypes";
import { resolveChainKey } from "../../../clients/viem/viemChains";

export interface RouterRegistryEntry {
  chain: ChainKey;
  family: SwapExecutionFamily;
  routerAddress: Address;
  quoterAddress?: Address | null;
  label: string;
  /** Normalized DexScreener / user-facing dexId aliases for this router. */
  dexIds?: string[];
}

const REGISTRY: RouterRegistryEntry[] = [
  {
    chain: "ethereum",
    family: "uniswap_v2",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    label: "Uniswap V2 Router02",
    dexIds: ["uniswap-v2", "uniswap_v2"],
  },
  {
    chain: "ethereum",
    family: "uniswap_v3",
    routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoterAddress: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    label: "Uniswap V3 SwapRouter",
    dexIds: [],
  },
  {
    chain: "ethereum",
    family: "uniswap_v3",
    routerAddress: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoterAddress: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    label: "Uniswap Universal SwapRouter02",
    dexIds: ["uniswap-v3", "uniswap_v3", "uniswap"],
  },
  {
    chain: "base",
    family: "uniswap_v3",
    routerAddress: "0x2626664c2603336E57B271c5C0b26F421741e481",
    quoterAddress: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    label: "Uniswap Base V3 SwapRouter",
    dexIds: ["uniswap-v3", "uniswap_v3", "uniswap"],
  },
  {
    chain: "ethereum",
    family: "aggregator_0x",
    routerAddress: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    label: "0x Exchange Proxy",
    dexIds: ["0x", "zerox", "0x-v3", "0x-v4"],
  },
  {
    chain: "base",
    family: "aggregator_0x",
    routerAddress: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    label: "0x Exchange Proxy",
    dexIds: ["0x", "zerox", "0x-v3", "0x-v4"],
  },
  {
    chain: "arbitrum",
    family: "aggregator_0x",
    routerAddress: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    label: "0x Exchange Proxy",
    dexIds: ["0x", "zerox", "0x-v3", "0x-v4"],
  },
  {
    chain: "polygon",
    family: "uniswap_v3",
    routerAddress: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoterAddress: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    label: "Uniswap Universal SwapRouter02",
    // DexScreener returns "uniswap" (no version suffix) for Uniswap V3 pools on Polygon.
    dexIds: ["uniswap-v3", "uniswap_v3", "uniswap"],
  },
  {
    chain: "polygon",
    family: "algebra",
    routerAddress: "0xf5b509bB0909a69B1c207E495f687a596C168E12",
    quoterAddress: "0xa15F0D7377B2A0C0c10db057f641beD21028FC89",
    label: "QuickSwap V3 (Algebra)",
    dexIds: ["quickswap", "quickswap-v3"],
  },
  {
    chain: "polygon",
    family: "uniswap_v2",
    routerAddress: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
    label: "QuickSwap V2 Router02",
    dexIds: ["quickswap-v2"],
  },
  {
    chain: "polygon",
    family: "uniswap_v2",
    routerAddress: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    label: "SushiSwap V2 Polygon",
    dexIds: ["sushiswap", "sushiswap-v2"],
  },
  {
    chain: "polygon",
    family: "aggregator_0x",
    routerAddress: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF",
    label: "0x Exchange Proxy",
    dexIds: ["0x", "zerox", "0x-v3", "0x-v4"],
  },
];

export function findRouterRegistryEntry(chain: ChainKey, routerAddress: Address): RouterRegistryEntry | null {
  const resolvedChain = resolveChainKey(chain);
  const normalized = String(routerAddress).toLowerCase();

  return (
    REGISTRY.find(
      (entry) => resolveChainKey(entry.chain) === resolvedChain && entry.routerAddress.toLowerCase() === normalized
    ) ?? null
  );
}

/**
 * Look up a registry entry by a normalized dexId alias (e.g. "quickswap", "uniswap", "sushiswap").
 * Returns the first matching entry for the given chain.
 */
export function findRouterRegistryEntryByDexId(chain: ChainKey, dexId: string): RouterRegistryEntry | null {
  const resolvedChain = resolveChainKey(chain);
  const normalizedId = dexId.trim().toLowerCase();

  return (
    REGISTRY.find(
      (entry) =>
        resolveChainKey(entry.chain) === resolvedChain &&
        (entry.dexIds ?? []).includes(normalizedId)
    ) ?? null
  );
}

export function listRouterRegistryEntries(chain?: ChainKey): RouterRegistryEntry[] {
  if (!chain) return [...REGISTRY];
  const resolvedChain = resolveChainKey(chain);
  return REGISTRY.filter((entry) => resolveChainKey(entry.chain) === resolvedChain);
}
