import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";
import { ChainKey } from "../../../../clients/viem/viem-types";
import {viemChains } from "../../../../clients/viem/viemChains";
import { CHAIN_ALIASES } from "../../../../utils/const/ALIAS";

export interface GetAvailableChainsArgs {
  filter?: string | null;
  filters?: string[] | null;
  fields?: string[] | null;
  exactOnly?: boolean | null;
  topN?: number | null;
}

/** Shape used internally by gas price and other tools that need chain context. */
export type ChainMetadata = {
  protocol: "evm";
  chain: string;
  chainId: number | null;
  nativeSymbol: string;
  nativeDecimals: number;
  rpcUrls: {
    default: {
      http: readonly string[] | null;
    } | null;
  } | null;
  testnet: boolean | null;
};

/** Shape returned by getAvailableChains for the chain registry tool. */
export type ChainInfo = {
  key: string;
  chainId: number | null;
  name: string | null;
  nativeCurrency: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
  } | null;
  rpcUrls: {
    default: {
      http: readonly string[] | null;
    } | null;
  } | null;
  testnet: boolean | null;
};

type MinimalChainRecord = {
  id?: number;
  name?: string;
  nativeCurrency?: ChainInfo["nativeCurrency"];
  rpcUrls?: ChainInfo["rpcUrls"];
  testnet?: boolean;
};

type Candidate = {
  chain: ChainInfo;
  keyLower: string;
  nameLower: string;
  symbolLower: string;
};

/** Single-chain metadata fetch — used by getGasPrice and other tools needing native currency info. */
export async function getChainMetadata({ chain }: { chain: string }): Promise<ChainMetadata> {
  const client = getViemPublicClient(chain);
  const nativeCurrency = client.chain?.nativeCurrency;
  return {
    protocol: "evm",
    chain,
    chainId: client.chain?.id ?? null,
    nativeSymbol: nativeCurrency?.symbol ?? "NATIVE",
    nativeDecimals: nativeCurrency?.decimals ?? 18,
    rpcUrls: client.chain?.rpcUrls
      ? { default: { http: client.chain.rpcUrls.default?.http ?? null } }
      : null,
    testnet: client.chain?.testnet ?? null,
  };
}

/** Registry listing — used by the get_available_chains tool. Supports filters, exactOnly, and field projection. */
export function getAvailableChains(args: GetAvailableChainsArgs): ChainInfo[] | Partial<ChainInfo>[] {
  const baseChains = getFilteredChainInfo(
    undefined,
    args.filters?.length ? args.filters : args.filter ? [args.filter] : undefined,
    Boolean(args.exactOnly),
    args.topN ?? null
  );

  const selectedFields = args.fields;
  if (!selectedFields?.length) {
    return baseChains;
  }

  return baseChains.map((c) => projectChainFields(c, selectedFields));
}

function projectChainFields(chain: ChainInfo, fields: string[]): Partial<ChainInfo> {
  const projected: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.includes(".")) {
      const [top, ...rest] = field.split(".");
      if (!top) continue;
      const topVal = chain[top as keyof ChainInfo];
      if (topVal != null && typeof topVal === "object") {
        if (!(top in projected)) {
          projected[top] = {};
        }
        let src: Record<string, unknown> = topVal as Record<string, unknown>;
        let dst: Record<string, unknown> = projected[top] as Record<string, unknown>;
        for (let i = 0; i < rest.length - 1; i++) {
          const seg = rest[i];
          if (!seg) continue;
          src = src[seg] as Record<string, unknown>;
          if (!(seg in dst)) dst[seg] = {};
          dst = dst[seg] as Record<string, unknown>;
        }
        const leaf = rest[rest.length - 1];
        if (!leaf) continue;
        dst[leaf] = src?.[leaf] ?? null;
      }
    } else if (field in chain) {
      projected[field] = chain[field as keyof ChainInfo];
    }
  }

  return projected as Partial<ChainInfo>;
}

export function getFilteredChainInfo(
  filter?: (chain: ChainInfo) => boolean,
  fuzzyFilters?: string | string[],
  exactOnly = false,
  topN: number | null = null
): ChainInfo[] {
  const chainMap = viemChains as Record<string, MinimalChainRecord>;

  const chains: ChainInfo[] = Object.keys(chainMap)
    .map((key) => {
      const chain = chainMap[key];
      return {
        key: key as ChainKey,
        chainId: chain?.id ?? null,
        name: chain?.name ?? key,
        nativeCurrency: chain?.nativeCurrency ?? null,
        rpcUrls: chain?.rpcUrls ?? null,
        testnet: chain?.testnet ?? null,
      };
    });

  const filteredChains = filter ? chains.filter(filter) : chains;

  if (!fuzzyFilters) return filteredChains;

  const rawFilters = (Array.isArray(fuzzyFilters) ? fuzzyFilters : [fuzzyFilters])
    .map((f) => normalizeTerm(f))
    .filter(Boolean);

  if (!rawFilters.length) return filteredChains;

  const normalizedFilters = rawFilters.map((f) => normalizeTerm(CHAIN_ALIASES[f] ?? f));

  const candidates: Candidate[] = filteredChains.map((chain) => ({
    chain,
    keyLower: normalizeTerm(chain.key),
    nameLower: normalizeTerm(chain.name ?? ""),
    symbolLower: normalizeTerm(chain.nativeCurrency?.symbol ?? ""),
  }));

  if (exactOnly) {
    return candidates
      .filter(({ keyLower, nameLower, symbolLower }) =>
        normalizedFilters.some((f) => f === keyLower || f === nameLower || f === symbolLower)
      )
      .map(({ chain }) => chain);
  }

  const scored = candidates
    .map(({ chain, keyLower, nameLower, symbolLower }) => {
      let best = 0;
      for (const f of normalizedFilters) {
        const score = fuzzyScore(f, keyLower, nameLower, symbolLower);
        if (score > best) best = score;
      }
      return { chain, score: best };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.chain.key.localeCompare(b.chain.key));

  const limit = topN != null && Number.isFinite(topN) ? Math.max(1, Math.floor(topN)) : null;
  const rankedChains = scored.map((entry) => entry.chain);
  return limit == null ? rankedChains : rankedChains.slice(0, limit);
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

function fuzzyScore(filter: string, key: string, name: string, symbol: string): number {
  if (filter === key) return 100;
  if (filter === name) return 95;
  if (filter === symbol) return 90;

  if (key.startsWith(filter)) return 80;
  if (name.startsWith(filter)) return 75;
  if (symbol.startsWith(filter)) return 70;

  if (key.includes(filter)) return 60;
  if (name.includes(filter)) return 55;
  if (symbol.includes(filter)) return 50;

  /**  Loose fuzzy: all query chars appear in order in key or name (e.g. "arb" -> "arbitrum"). */
  if (isSubsequence(filter, key)) return 30;
  if (isSubsequence(filter, name)) return 25;

  return 0;
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (const char of haystack) {
    if (char === needle[i]) {
      i += 1;
      if (i === needle.length) return true;
    }
  }
  return false;
}