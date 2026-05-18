import { resolveChainKey } from "../../clients/viem/viemChains";

export type DexToken = {
  address?: string;
  name?: string;
  symbol?: string;
};

export type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: DexToken;
  quoteToken?: DexToken;
  priceUsd?: string;
  priceNative?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  volume?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
  priceChange?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
  labels?: string[];
};

type DexResponse = {
  pairs?: DexPair[];
};

export function normalizeDexChain(chain?: string | null): string | null {
  if (!chain) {
    return null;
  }

  const resolved = resolveChainKey(chain).toLowerCase();
  return resolved === "mainnet" ? "ethereum" : resolved;
}

export function parseDexNullableNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchDexPairs(url: string, label: string): Promise<DexPair[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DexScreener request failed (${response.status}) for ${label}`);
  }

  const data = (await response.json()) as DexResponse;
  return data.pairs ?? [];
}

export async function fetchDexSearchPairs(query: string): Promise<DexPair[]> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
  return fetchDexPairs(url, `query ${query}`);
}

export async function fetchDexPairsByTokenAddress(tokenAddress: string): Promise<DexPair[]> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`;
  return fetchDexPairs(url, `token ${tokenAddress}`);
}