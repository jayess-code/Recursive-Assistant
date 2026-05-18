import type { Address } from "../../../clients/viem/viem-types";
import type { DexPair } from "../../../services/DexScreener/dexScreenerClient";
import { parseDexNullableNumber } from "../../../services/DexScreener/dexScreenerClient";
import type { SearchTokenMatchMode, SearchTokenQuery } from "./searchToken";

export type Candidate = {
  key: string;
  chain: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  pairs: DexPair[];
};

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function inferAddressFromQuery(query: SearchTokenQuery): Address | null {
  if (query.address && isAddress(query.address)) {
    return query.address;
  }

  const value = String(query.value ?? "").trim();
  if (isAddress(value)) {
    return value;
  }

  return null;
}

function normalizeTerm(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export function pairChain(entry: DexPair): string {
  return String(entry.chainId ?? "").toLowerCase();
}

export function comparePairPriority(a: DexPair, b: DexPair): number {
  const aLiquidity = parseDexNullableNumber(a.liquidity?.usd) ?? 0;
  const bLiquidity = parseDexNullableNumber(b.liquidity?.usd) ?? 0;
  if (bLiquidity !== aLiquidity) {
    return bLiquidity - aLiquidity;
  }

  const aVolume = parseDexNullableNumber(a.volume?.h24) ?? 0;
  const bVolume = parseDexNullableNumber(b.volume?.h24) ?? 0;
  if (bVolume !== aVolume) {
    return bVolume - aVolume;
  }

  const aMcap = parseDexNullableNumber(a.marketCap) ?? 0;
  const bMcap = parseDexNullableNumber(b.marketCap) ?? 0;
  return bMcap - aMcap;
}

export function selectBestPair(pairs: DexPair[]): DexPair | undefined {
  return [...pairs].sort(comparePairPriority)[0];
}

export function dedupePairs(pairs: DexPair[]): DexPair[] {
  const seen = new Set<string>();
  const deduped: DexPair[] = [];

  for (const pair of pairs) {
    const key = `${pairChain(pair)}:${String(pair.pairAddress ?? "")}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(pair);
  }

  return deduped;
}

function addCandidateFromToken(
  map: Map<string, Candidate>,
  pair: DexPair,
  chain: string,
  tokenAddress: string,
  tokenName: string | undefined,
  tokenSymbol: string | undefined,
): void {
  const key = `${chain}:${tokenAddress}`;
  const existing = map.get(key);
  if (existing) {
    if (!existing.pairs.includes(pair)) {
      existing.pairs.push(pair);
    }
    if (!existing.tokenName && tokenName) {
      existing.tokenName = tokenName;
    }
    if (!existing.tokenSymbol && tokenSymbol) {
      existing.tokenSymbol = tokenSymbol;
    }
    return;
  }

  map.set(key, {
    key,
    chain,
    tokenAddress,
    ...(tokenName ? { tokenName } : {}),
    ...(tokenSymbol ? { tokenSymbol } : {}),
    pairs: [pair],
  });
}

export function accumulateCandidates(pairs: DexPair[]): Candidate[] {
  const map = new Map<string, Candidate>();

  for (const pair of pairs) {
    const chain = pairChain(pair);
    if (!chain) continue;

    // Index base token
    const baseAddress = String(pair.baseToken?.address ?? "").toLowerCase();
    if (baseAddress) {
      addCandidateFromToken(
        map, pair, chain, baseAddress,
        pair.baseToken?.name,
        pair.baseToken?.symbol,
      );
    }

    // Also index quote token so stablecoins / denominator tokens (e.g. USDT0, USDC)
    // are discoverable when they only appear as the quote side of pairs.
    const quoteAddress = String(pair.quoteToken?.address ?? "").toLowerCase();
    if (quoteAddress) {
      addCandidateFromToken(
        map, pair, chain, quoteAddress,
        pair.quoteToken?.name,
        pair.quoteToken?.symbol,
      );
    }
  }

  return Array.from(map.values());
}

export function scoreCandidate(
  candidate: Candidate,
  query: SearchTokenQuery,
  mode: SearchTokenMatchMode
): { score: number; matchedBy: "address" | "symbol" | "name" | "fuzzy" } {
  const queryAddress = inferAddressFromQuery(query)?.toLowerCase() ?? "";
  const symbolInput = normalizeTerm(query.symbol || query.value);
  const nameInput = normalizeTerm(query.name || query.value);
  const tokenSymbol = normalizeTerm(candidate.tokenSymbol);
  const tokenName = normalizeTerm(candidate.tokenName);

  if (queryAddress && candidate.tokenAddress === queryAddress) {
    return { score: 1_000_000, matchedBy: "address" };
  }

  if (symbolInput && tokenSymbol && symbolInput === tokenSymbol) {
    return { score: 800_000, matchedBy: "symbol" };
  }

  if (nameInput && tokenName && nameInput === tokenName) {
    return { score: 700_000, matchedBy: "name" };
  }

  if (mode === "exact") {
    return { score: -1, matchedBy: "fuzzy" };
  }

  const symbolStarts = symbolInput && tokenSymbol.startsWith(symbolInput) ? 200_000 : 0;
  const nameStarts = nameInput && tokenName.startsWith(nameInput) ? 150_000 : 0;
  const symbolContains = symbolInput && tokenSymbol.includes(symbolInput) ? 80_000 : 0;
  const nameContains = nameInput && tokenName.includes(nameInput) ? 50_000 : 0;

  const topPair = selectBestPair(candidate.pairs);
  const liquidityScore = Math.min(parseDexNullableNumber(topPair?.liquidity?.usd) ?? 0, 10_000_000) / 10;
  const marketCapScore = Math.min(parseDexNullableNumber(topPair?.marketCap) ?? 0, 1_000_000_000) / 5_000;
  const volumeScore = Math.min(parseDexNullableNumber(topPair?.volume?.h24) ?? 0, 10_000_000) / 20;

  const baseScore = symbolStarts + nameStarts + symbolContains + nameContains;
  const confidenceScore = baseScore + liquidityScore + marketCapScore + volumeScore;

  return {
    score: confidenceScore,
    matchedBy: baseScore > 0 ? (symbolStarts || symbolContains ? "symbol" : "name") : "fuzzy",
  };
}
