import type { Address, ChainKey } from "../../../clients/viem/viem-types";
import type { ToolHandlerContext } from "../../types/handler-types";
import {
  DexPair,
  fetchDexPairsByTokenAddress,
  fetchDexSearchPairs,
  normalizeDexChain,
  parseDexNullableNumber,
} from "../../../services/DexScreener/dexScreenerClient";
import {
  accumulateCandidates,
  comparePairPriority,
  dedupePairs,
  pairChain,
  scoreCandidate,
} from "./searchTokenRanking";
import { applyDecisionGradeIntelligence } from "./searchTokenIntelligence";
import { projectFields } from "../../types/projectFields";
import {
  CoinMarketCapTokenData,
  fetchCoinMarketCapTokenData,
} from "../../../services/CoinMarketCap/fetchCoinMarketCapTokenData";
import type {
  NumericRange as SharedNumericRange,
  PairOptions as SharedPairOptions,
  PairSortDirection as SharedSortDirection,
  PairSortField as SharedSortField,
  PairSortOptions as SharedSortOptions,
  PairVolumeWindow as SharedVolumeWindow,
  VolumeRange as SharedVolumeRange,
} from "../shared/pairOptionsSchema";

export const SEARCH_TOKEN_MATCH_MODES = ["smart", "exact", "fuzzy"] as const;
export type SearchTokenMatchMode = (typeof SEARCH_TOKEN_MATCH_MODES)[number];

export const SEARCH_TOKEN_FIELDS = [
  "query",
  "token",
  "metrics",
  "price",
  "liquidity",
  "volume",
  "identity",
  "classification",
  "risk",
  "marketStructure",
  "alerts",
  "provenance",
  "marketPairs",
  "cmc",
  "matchedBy",
  "score",
  "sources",
  "warnings",
  "description",
  "labels",
] as const;
export type SearchTokenField = (typeof SEARCH_TOKEN_FIELDS)[number];
export const SEARCH_TOKEN_RESPONSE_MODES = ["compact", "full"] as const;
export type SearchTokenResponseMode = (typeof SEARCH_TOKEN_RESPONSE_MODES)[number];
const DEFAULT_COMPACT_FIELDS: readonly SearchTokenField[] = [
  "token",
  "price",
  "metrics",
  "matchedBy",
  "score",
  "warnings",
];

export interface SearchTokenQuery {
  value?: string | null;
  name?: string | null;
  symbol?: string | null;
  address?: Address | null;
  chain?: ChainKey | null;
}

export interface SearchTokenArgs {
  queries: SearchTokenQuery[];
  fields?: SearchTokenField[] | null;
  limit?: number | null;
  pairLimit?: number | null;
  matchMode?: SearchTokenMatchMode | null;
  responseMode?: SearchTokenResponseMode | null;
  includePairs?: boolean | null;
  includeMetrics?: boolean | null;
  includeCmc?: boolean | null;
  pairOptions?: SearchTokenPairOptions | null;
}

export type SearchTokenNumericRange = SharedNumericRange;
export type SearchTokenVolumeWindow = SharedVolumeWindow;
export type SearchTokenVolumeRange = SharedVolumeRange;
export type SearchTokenSortField = SharedSortField;
export type SearchTokenSortDirection = SharedSortDirection;
export type SearchTokenSortOptions = SharedSortOptions;
export type SearchTokenPairOptions = SharedPairOptions;

export type SearchTokenMetrics = {
  priceUsd?: number | null;
  priceNative?: number | null;
  marketCap?: number | null;
  fdv?: number | null;
  liquidityUsd?: number | null;
  volume24h?: number | null;
  priceChange24h?: number | null;
};

export type SearchTokenPair = {
  chain: string;
  pairAddress?: string;
  dexId?: string;
  quoteSymbol?: string;
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  volume24h?: number | null;
};

export type SearchTokenPrice = {
  valueUsd?: number | null;
  source: "cmc" | "dex" | "aggregated";
  confidence?: number | null;
  deviation?: number | null;
};

export type SearchTokenLiquidity = {
  totalUsd?: number | null;
  topPairUsd?: number | null;
  concentration?: number | null;
  isFragmented?: boolean | null;
};

export type SearchTokenVolume = {
  total24h?: number | null;
  dex24h?: number | null;
  cex24h?: number | null;
  washTradingRisk?: number | null;
};

export type SearchTokenIdentityRepresentation = {
  chain: string;
  address: string;
};

export type SearchTokenIdentity = {
  canonicalId?: number | null;
  representations?: SearchTokenIdentityRepresentation[];
};

export type SearchTokenClassification = {
  sector?: string | null;
  subSector?: string | null;
  tags?: string[];
};

export type SearchTokenRiskSignals = {
  isVerified?: boolean | null;
  isScam?: boolean | null;
  isProxy?: boolean | null;
  hasRenouncedOwnership?: boolean | null;
  hasMintFunction?: boolean | null;
  hasBlacklistFunction?: boolean | null;
};

export type SearchTokenMarketStructure = {
  isNew?: boolean | null;
  isMicroCap?: boolean | null;
  isHighVolatility?: boolean | null;
  trend?: "up" | "down" | "sideways" | null;
};

export type SearchTokenAlert = {
  type:
    | "low_liquidity"
    | "fragmented_liquidity"
    | "price_mismatch"
    | "identity_ambiguous"
    | "missing_cmc"
    | "wash_trading_risk"
    | "unverified_contract";
  severity: "low" | "medium" | "high";
  message: string;
};

export type SearchTokenFieldProvenance = "cmc" | "dex" | "aggregated" | "derived";

export type SearchTokenProvenance = {
  price?: SearchTokenFieldProvenance;
  marketCap?: SearchTokenFieldProvenance;
  liquidity?: SearchTokenFieldProvenance;
  volume?: SearchTokenFieldProvenance;
  classification?: SearchTokenFieldProvenance;
  identity?: SearchTokenFieldProvenance;
  risk?: SearchTokenFieldProvenance;
};

export type SearchTokenResult = {
  query: SearchTokenQuery;
  token: {
    chain: string;
    address: string;
    name?: string;
    symbol?: string;
  };
  metrics?: SearchTokenMetrics;
  price?: SearchTokenPrice;
  liquidity?: SearchTokenLiquidity;
  volume?: SearchTokenVolume;
  identity?: SearchTokenIdentity;
  classification?: SearchTokenClassification;
  risk?: SearchTokenRiskSignals;
  marketStructure?: SearchTokenMarketStructure;
  alerts?: SearchTokenAlert[];
  provenance?: SearchTokenProvenance;
  marketPairs?: SearchTokenPair[];
  cmc?: CoinMarketCapTokenData;
  matchedBy: "address" | "symbol" | "name" | "fuzzy";
  score: number;
  // Legacy compatibility summary. Prefer provenance for new consumers.
  sources: string[];
  // Legacy compatibility surface. Prefer structured alerts for new consumers.
  warnings?: string[];
};

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function buildSearchTerms(query: SearchTokenQuery): string[] {
  const terms = [query.value, query.name, query.symbol].map((value) => String(value ?? "").trim()).filter(Boolean);
  return Array.from(new Set(terms));
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

function pairToMarketPair(pair: DexPair): SearchTokenPair {
  return {
    chain: pairChain(pair),
    ...(pair.pairAddress ? { pairAddress: pair.pairAddress } : {}),
    ...(pair.dexId ? { dexId: pair.dexId } : {}),
    ...(pair.quoteToken?.symbol ? { quoteSymbol: pair.quoteToken.symbol } : {}),
    priceUsd: parseDexNullableNumber(pair.priceUsd),
    liquidityUsd: parseDexNullableNumber(pair.liquidity?.usd),
    volume24h: parseDexNullableNumber(pair.volume?.h24),
    ...(pair.labels ? { labels: pair.labels } : {}),    
  };
}

function inRange(value: number, range?: SearchTokenNumericRange | null): boolean {
  if (!range) {
    return true;
  }

  if (typeof range.min === "number" && value < range.min) {
    return false;
  }

  if (typeof range.max === "number" && value > range.max) {
    return false;
  }

  return true;
}

function resolveVolumeWindow(volume?: SearchTokenVolumeRange | null): SearchTokenVolumeWindow {
  if (!volume?.window) {
    return "h24";
  }

  return volume.window;
}

function getVolumeByWindow(pair: DexPair, window: SearchTokenVolumeWindow): number {
  if (window === "h1") {
    return parseDexNullableNumber(pair.volume?.h1) ?? 0;
  }

  if (window === "h6") {
    return parseDexNullableNumber(pair.volume?.h6) ?? 0;
  }

  if (window === "m5") {
    return parseDexNullableNumber(pair.volume?.m5) ?? 0;
  }

  return parseDexNullableNumber(pair.volume?.h24) ?? 0;
}

function getSortValue(pair: DexPair, field: SearchTokenSortField, volumeWindow: SearchTokenVolumeWindow): number {
  if (field === "liquidityUsd") {
    return parseDexNullableNumber(pair.liquidity?.usd) ?? 0;
  }

  if (field === "marketCap") {
    return parseDexNullableNumber(pair.marketCap) ?? 0;
  }

  if (field === "fdv") {
    return parseDexNullableNumber(pair.fdv) ?? 0;
  }

  if (field === "volume24h") {
    return getVolumeByWindow(pair, volumeWindow);
  }

  if (field === "priceUsd") {
    return parseDexNullableNumber(pair.priceUsd) ?? 0;
  }

  return parseDexNullableNumber(pair.priceChange?.h24) ?? 0;
}

function applyPairOptionsToPairs(pairs: DexPair[], pairOptions?: SearchTokenPairOptions | null): DexPair[] {
  if (!pairOptions) {
    return [...pairs].sort(comparePairPriority);
  }

  const volumeWindow = resolveVolumeWindow(pairOptions.volume);
  const sortField = pairOptions.sort?.field ?? "liquidityUsd";
  const sortDirection = pairOptions.sort?.direction ?? "high";

  const filtered = pairs.filter((pair) => {
    const liq = parseDexNullableNumber(pair.liquidity?.usd) ?? 0;
    const mc = parseDexNullableNumber(pair.marketCap) ?? 0;
    const fdv = parseDexNullableNumber(pair.fdv) ?? 0;
    const volumeValue = getVolumeByWindow(pair, volumeWindow);

    return (
      inRange(liq, pairOptions.liquidity) &&
      inRange(mc, pairOptions.marketCap) &&
      inRange(fdv, pairOptions.fdv) &&
      inRange(volumeValue, pairOptions.volume)
    );
  });

  return [...filtered].sort((a, b) => {
    const aValue = getSortValue(a, sortField, volumeWindow);
    const bValue = getSortValue(b, sortField, volumeWindow);

    return sortDirection === "low" ? aValue - bValue : bValue - aValue;
  });
}

function buildMetrics(topPair?: DexPair): SearchTokenMetrics {
  return {
    priceUsd: parseDexNullableNumber(topPair?.priceUsd),
    priceNative: parseDexNullableNumber(topPair?.priceNative),
    marketCap: parseDexNullableNumber(topPair?.marketCap),
    fdv: parseDexNullableNumber(topPair?.fdv),
    liquidityUsd: parseDexNullableNumber(topPair?.liquidity?.usd),
    volume24h: parseDexNullableNumber(topPair?.volume?.h24),
    priceChange24h: parseDexNullableNumber(topPair?.priceChange?.h24),
  };
}

async function collectPairsForQuery(query: SearchTokenQuery): Promise<DexPair[]> {
  const requests: Array<Promise<DexPair[]>> = [];
  const address = inferAddressFromQuery(query);
  const terms = buildSearchTerms(query);

  if (address) {
    requests.push(fetchDexPairsByTokenAddress(address));
  }

  for (const term of terms) {
    requests.push(fetchDexSearchPairs(term));
  }

  if (!requests.length) {
    return [];
  }

  const responses = await Promise.all(requests);
  return dedupePairs(responses.flat());
}

export async function searchToken(
  args: SearchTokenArgs,
  context?: ToolHandlerContext
){
  try {
    if (!Array.isArray(args.queries) || args.queries.length === 0) {
      return {
        success: false,
        error: "search_token requires at least one query item. Provide at least one query object.",
      };
    }

    const limit = Math.max(1, Math.min(25, Number(args.limit ?? 5)));
    const pairLimit = Math.max(1, Math.min(10, Number(args.pairLimit ?? 3)));
    const includePairs = args.includePairs ?? true;
    const includeMetrics = args.includeMetrics ?? true;
    const includeCmc = args.includeCmc ?? true;
    const pairOptions = args.pairOptions ?? null;
    const matchMode: SearchTokenMatchMode = SEARCH_TOKEN_MATCH_MODES.includes(
      (args.matchMode ?? "smart") as SearchTokenMatchMode
    )
      ? (args.matchMode ?? "smart") as SearchTokenMatchMode
      : "smart";
    const responseMode: SearchTokenResponseMode = SEARCH_TOKEN_RESPONSE_MODES.includes(
      (args.responseMode ?? "compact") as SearchTokenResponseMode
    )
      ? (args.responseMode ?? "compact") as SearchTokenResponseMode
      : "compact";
    const requestedFields =
      responseMode === "full"
        ? args.fields?.length
          ? args.fields
          : null
        : args.fields?.length
          ? args.fields
          : DEFAULT_COMPACT_FIELDS;

    const queryResults = await Promise.all(
      args.queries.map(async (query) => {
        const chainFilter = normalizeDexChain(query.chain);
        const pairs = await collectPairsForQuery(query);
        const filteredPairs = chainFilter ? pairs.filter((pair) => pairChain(pair) === chainFilter) : pairs;
        // Do NOT fall back to cross-chain when a chain filter is specified.
        // Returning data from the wrong chain silently misleads the agent.
        const effectivePairs = filteredPairs;
        const candidates = accumulateCandidates(effectivePairs);

        const scoredCandidates = candidates.map((candidate) => {
          const { score, matchedBy } = scoreCandidate(candidate, query, matchMode);
          const outputPairs = applyPairOptionsToPairs(candidate.pairs, pairOptions);
          const topPair = outputPairs[0];

          const result = applyDecisionGradeIntelligence({
            result: {
              query,
              token: {
                chain: candidate.chain,
                address: candidate.tokenAddress,
                ...(candidate.tokenName ? { name: candidate.tokenName } : {}),
                ...(candidate.tokenSymbol ? { symbol: candidate.tokenSymbol } : {}),
              },
              matchedBy,
              score,
              sources: ["dexscreener"],
              ...(includeMetrics ? { metrics: buildMetrics(topPair) } : {}),
              ...(includePairs
                ? {
                    marketPairs: outputPairs.slice(0, pairLimit).map(pairToMarketPair),
                  }
                : {}),
            },
            pairs: outputPairs,
            ...(topPair ? { topPair } : {}),
          });

          return result;
        });

        const exactModeFilteredCount =
          matchMode === "exact" ? scoredCandidates.filter((r) => r.score === -1).length : 0;

        const rankedBase = scoredCandidates
          .filter((result) => result.score >= 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        // CMC enrichment runs only on the top-ranked result per query.
        // Enriching every candidate would fan out to (limit x 3) CMC API calls
        // simultaneously, exhausting free-tier rate limits. CMC data is for
        // canonical identity confirmation on the best match.
        const rankedWithCmc = await Promise.all(
          rankedBase.map(async (result, index) => {
            if (!includeCmc || index !== 0) {
              return result;
            }

            const cmc = await fetchCoinMarketCapTokenData({
              symbol: result.token.symbol ?? null,
              name: result.token.name ?? null,
              address: query.address ?? query.value ?? null,
              ...(context ? { context } : {}),
            });

            if (!cmc.data && !cmc.warning) {
              return result;
            }

            const matchedCandidate = candidates.find(
              (candidate) => candidate.chain === result.token.chain && candidate.tokenAddress === result.token.address
            );
            const topPairForCmc = matchedCandidate?.pairs.sort(comparePairPriority)[0];

            return applyDecisionGradeIntelligence({
              result: {
                ...result,
                ...(cmc.data ? { cmc: cmc.data } : {}),
              },
              pairs: matchedCandidate?.pairs ?? [],
              ...(topPairForCmc ? { topPair: topPairForCmc } : {}),
              ...(cmc.data ? { cmc: cmc.data } : {}),
              ...(cmc.warning ? { cmcWarning: cmc.warning } : {}),
            });
          })
        );

        const ranked = rankedWithCmc.map(
          (result) => projectFields(result, requestedFields) as Partial<SearchTokenResult>
        );

        const queryWarnings = rankedWithCmc.flatMap((result) => result.warnings ?? []);

        if (exactModeFilteredCount > 0 && rankedBase.length === 0) {
          queryWarnings.push(
            `matchMode 'exact' filtered out ${exactModeFilteredCount} candidate(s) because none matched the query symbol/name exactly. Retry with matchMode 'smart' to get ranked results.`
          );
        }

        return {
          input: query,
          chainFilter: chainFilter ?? null,
          chainFilterApplied: Boolean(chainFilter && filteredPairs.length > 0),
          fallbackReason: null,
          resultCount: ranked.length,
          warnings: Array.from(new Set(queryWarnings)),
          results: ranked,
        };
      })
    );

    return {
      success: true,
      data: JSON.stringify({
        provider: includeCmc ? "dexscreener+coinmarketcap" : "dexscreener",
        mode: matchMode,
        responseMode,
        projectedFields: requestedFields ?? "all",
        includeMetrics,
        includePairs,
        includeCmc,
        sources: includeCmc ? ["dexscreener", "coinmarketcap"] : ["dexscreener"],
        timestamp: new Date().toISOString(),
        queries: queryResults,
      }, null, 2),
    };
  } catch (error) {
    return {
      success: false,
      error: `search_token failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
