import {
  fetchCoinMarketCapJson,
  getCoinMarketCapApiKey,
  type CoinMarketCapContext,
} from "./cmcClient";

type CmcMapItem = {
  id?: number;
  name?: string;
  symbol?: string;
  slug?: string;
  rank?: number;
  is_active?: number;
};

type CmcMapResponse = {
  data?: CmcMapItem[];
};

type CmcInfoItem = {
  id?: number;
  name?: string;
  symbol?: string;
  slug?: string;
  status?: string;
  description?: string;
  logo?: string;
  tags?: string[];
  date_added?: string;
  platform?: {
    id?: number;
    name?: string;
    symbol?: string;
    slug?: string;
    token_address?: string;
  } | null;
  urls?: {
    website?: string[];
    twitter?: string[];
    source_code?: string[];
    technical_doc?: string[];
    explorer?: string[];
    reddit?: string[];
    chat?: string[];
  };
};

type CmcInfoResponse = {
  data?: Record<string, CmcInfoItem>;
};

type CmcQuoteItem = {
  id?: number;
  name?: string;
  symbol?: string;
  slug?: string;
  cmc_rank?: number;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number;
  quote?: {
    USD?: {
      price?: number;
      market_cap?: number;
      volume_24h?: number;
      percent_change_24h?: number;
      last_updated?: string;
      market_cap_dominance?: number;
      fully_diluted_market_cap?: number;
    };
  };
};

type CmcQuoteResponse = {
  data?: Record<string, CmcQuoteItem>;
};

export type CoinMarketCapTokenData = {
  identity: {
    id: number;
    name?: string;
    symbol?: string;
    slug?: string;
    rank?: number | null;
  };
  metadata: {
    category?: string | null;
    tags: string[];
    description?: string | null;
    dateLaunched?: string | null;
    links: {
      website: string[];
      twitter: string[];
      github: string[];
      docs: string[];
      explorers: string[];
    };
    platform?: {
      name?: string;
      symbol?: string;
      slug?: string;
      tokenAddress?: string;
    } | null;
    logo?: string | null;
  };
  market: {
    priceUsd?: number | null;
    marketCap?: number | null;
    fdv?: number | null;
    volume24h?: number | null;
    percentChange24h?: number | null;
    marketCapDominance?: number | null;
    circulatingSupply?: number | null;
    totalSupply?: number | null;
    maxSupply?: number | null;
    rank?: number | null;
    lastUpdated?: string | null;
  };
  match: {
    confidence: "high" | "medium" | "low";
    matchedBy: "symbol" | "name" | "symbol+name" | "address";
    /**
     * True when multiple active CMC entries share the same symbol.
     * The best candidate by rank is selected, but consumers should treat
     * the result with caution and prefer address-based disambiguation.
     */
    identityAmbiguous: boolean;
    /** Total number of CMC map candidates found for this symbol. */
    candidateCount: number;
  };
  attribution: {
    provider: "coinmarketcap";
    url: "https://coinmarketcap.com/";
  };
};

type MaybeCached<T> = {
  expiresAt: number;
  value: T;
};

const MAP_TTL_MS = 10 * 60 * 1000;
const INFO_TTL_MS = 30 * 60 * 1000;
const QUOTE_TTL_MS = 60 * 1000;

const mapCache = new Map<string, MaybeCached<CmcMapItem[]>>();
const infoCache = new Map<number, MaybeCached<CmcInfoItem | null>>();
const quoteCache = new Map<number, MaybeCached<CmcQuoteItem | null>>();

function nowMs(): number {
  return Date.now();
}

function fromCache<T>(cache: Map<any, MaybeCached<T>>, key: any): T | null {
  const hit = cache.get(key);
  if (!hit) {
    return null;
  }

  if (hit.expiresAt < nowMs()) {
    cache.delete(key);
    return null;
  }

  return hit.value;
}

function toCache<T>(cache: Map<any, MaybeCached<T>>, key: any, value: T, ttlMs: number): void {
  cache.set(key, {
    value,
    expiresAt: nowMs() + ttlMs,
  });
}

async function getMapBySymbol(symbol: string, apiKey: string): Promise<CmcMapItem[]> {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) {
    return [];
  }

  const cached = fromCache(mapCache, normalized);
  if (cached) {
    return cached;
  }

  const payload = await fetchCoinMarketCapJson<CmcMapResponse>({
    apiKey,
    path: "/v1/cryptocurrency/map",
    params: {
      symbol: normalized,
      listing_status: "active,inactive,untracked",
    },
  });

  const data = payload.data ?? [];
  toCache(mapCache, normalized, data, MAP_TTL_MS);
  return data;
}

async function getInfoById(id: number, apiKey: string): Promise<CmcInfoItem | null> {
  const cached = fromCache(infoCache, id);
  if (cached !== null) {
    return cached;
  }

  const payload = await fetchCoinMarketCapJson<CmcInfoResponse>({
    apiKey,
    path: "/v2/cryptocurrency/info",
    params: {
      id: String(id),
      aux: "urls,tags,logo,description,date_added,platform,status",
    },
  });

  const info = payload.data?.[String(id)] ?? null;
  toCache(infoCache, id, info, INFO_TTL_MS);
  return info;
}

async function getQuoteById(id: number, apiKey: string): Promise<CmcQuoteItem | null> {
  const cached = fromCache(quoteCache, id);
  if (cached !== null) {
    return cached;
  }

  const payload = await fetchCoinMarketCapJson<CmcQuoteResponse>({
    apiKey,
    path: "/v2/cryptocurrency/quotes/latest",
    params: {
      id: String(id),
      convert: "USD",
    },
  });

  const quote = payload.data?.[String(id)] ?? null;
  toCache(quoteCache, id, quote, QUOTE_TTL_MS);
  return quote;
}

function normalize(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function selectBestMapCandidate(
  candidates: CmcMapItem[],
  args: { symbol?: string | null; name?: string | null; address?: string | null }
): CmcMapItem | null {
  if (!candidates.length) {
    return null;
  }

  const symbolInput = normalize(args.symbol);
  const nameInput = normalize(args.name);

  const scored = candidates.map((candidate) => {
    let score = 0;
    const candidateSymbol = normalize(candidate.symbol);
    const candidateName = normalize(candidate.name);

    if (symbolInput && candidateSymbol === symbolInput) {
      score += 1000;
    }
    if (nameInput && candidateName === nameInput) {
      score += 800;
    }

    // Prefer active and higher-ranked canonical assets.
    if (candidate.is_active === 1) {
      score += 100;
    }

    if (typeof candidate.rank === "number") {
      score += Math.max(0, 100 - Math.min(100, candidate.rank));
    }

    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.candidate ?? null;
}

function buildMatchMeta(input: {
  symbol?: string | null;
  name?: string | null;
  address?: string | null;
  info?: CmcInfoItem | null;
  quote?: CmcQuoteItem | null;
  candidateCount: number;
}): CoinMarketCapTokenData["match"] {
  const symbolMatches = normalize(input.symbol) && normalize(input.symbol) === normalize(input.quote?.symbol ?? input.info?.symbol);
  const nameMatches = normalize(input.name) && normalize(input.name) === normalize(input.quote?.name ?? input.info?.name);

  const hasAddressInput = input.address && isAddress(input.address);
  const platformTokenAddress = normalize(input.info?.platform?.token_address ?? null);
  const addressMatches = hasAddressInput && platformTokenAddress && normalize(input.address) === platformTokenAddress;

  // Multiple active entries with the same symbol indicate an ambiguous identity.
  // Address match resolves ambiguity; otherwise flag it.
  const identityAmbiguous = input.candidateCount > 1 && !addressMatches;

  if (addressMatches) {
    return { confidence: "high", matchedBy: "address", identityAmbiguous: false, candidateCount: input.candidateCount };
  }

  if (symbolMatches && nameMatches) {
    return { confidence: "high", matchedBy: "symbol+name", identityAmbiguous, candidateCount: input.candidateCount };
  }

  if (symbolMatches) {
    return { confidence: "medium", matchedBy: "symbol", identityAmbiguous, candidateCount: input.candidateCount };
  }

  if (nameMatches) {
    return { confidence: "low", matchedBy: "name", identityAmbiguous, candidateCount: input.candidateCount };
  }

  return { confidence: "low", matchedBy: "symbol", identityAmbiguous, candidateCount: input.candidateCount };
}

export async function fetchCoinMarketCapTokenData(args: {
  symbol?: string | null;
  name?: string | null;
  address?: string | null;
  context?: CoinMarketCapContext;
}): Promise<{ data: CoinMarketCapTokenData | null; warning?: string }> {
  const apiKey = await getCoinMarketCapApiKey(args.context);
  if (!apiKey) {
    return {
      data: null,
      warning: "CoinMarketCap API key was not found (expected COINMARKETCAP_API_KEY). Returning Dex-only result.",
    };
  }

  const symbol = normalize(args.symbol);
  if (!symbol) {
    return {
      data: null,
      warning: "CoinMarketCap enrichment skipped because no token symbol was available.",
    };
  }

  try {
    const mapCandidates = await getMapBySymbol(symbol, apiKey);
    const selected = selectBestMapCandidate(mapCandidates, {
      symbol: args.symbol ?? null,
      name: args.name ?? null,
      address: args.address ?? null,
    });

    if (!selected?.id) {
      return { data: null };
    }

    const [info, quote] = await Promise.all([getInfoById(selected.id, apiKey), getQuoteById(selected.id, apiKey)]);
    if (!quote && !info) {
      return { data: null };
    }

    const quoteUsd = quote?.quote?.USD;

    const data: CoinMarketCapTokenData = {
      identity: {
        id: selected.id,
        ...(quote?.name ?? info?.name ?? selected.name
          ? { name: quote?.name ?? info?.name ?? selected.name }
          : {}),
        ...(quote?.symbol ?? info?.symbol ?? selected.symbol
          ? { symbol: quote?.symbol ?? info?.symbol ?? selected.symbol }
          : {}),
        ...(quote?.slug ?? info?.slug ?? selected.slug
          ? { slug: quote?.slug ?? info?.slug ?? selected.slug }
          : {}),
        rank: quote?.cmc_rank ?? selected.rank ?? null,
      },
      metadata: {
        category: info?.status ?? null,
        tags: info?.tags ?? [],
        description: info?.description ?? null,
        dateLaunched: info?.date_added ?? null,
        links: {
          website: info?.urls?.website ?? [],
          twitter: info?.urls?.twitter ?? [],
          github: info?.urls?.source_code ?? [],
          docs: info?.urls?.technical_doc ?? [],
          explorers: info?.urls?.explorer ?? [],
        },
        platform: info?.platform
          ? {
              ...(info.platform.name ? { name: info.platform.name } : {}),
              ...(info.platform.symbol ? { symbol: info.platform.symbol } : {}),
              ...(info.platform.slug ? { slug: info.platform.slug } : {}),
              ...(info.platform.token_address ? { tokenAddress: info.platform.token_address } : {}),
            }
          : null,
        logo: info?.logo ?? null,
      },
      market: {
        priceUsd: quoteUsd?.price ?? null,
        marketCap: quoteUsd?.market_cap ?? null,
        fdv: quoteUsd?.fully_diluted_market_cap ?? null,
        volume24h: quoteUsd?.volume_24h ?? null,
        percentChange24h: quoteUsd?.percent_change_24h ?? null,
        marketCapDominance: quoteUsd?.market_cap_dominance ?? null,
        circulatingSupply: quote?.circulating_supply ?? null,
        totalSupply: quote?.total_supply ?? null,
        maxSupply: quote?.max_supply ?? null,
        rank: quote?.cmc_rank ?? selected.rank ?? null,
        lastUpdated: quoteUsd?.last_updated ?? null,
      },
      match: buildMatchMeta({
        symbol: args.symbol ?? null,
        name: args.name ?? null,
        address: args.address ?? null,
        info,
        quote,
        candidateCount: mapCandidates.filter((c) => c.is_active !== 0).length,
      }),
      attribution: {
        provider: "coinmarketcap",
        url: "https://coinmarketcap.com/",
      },
    };

    return { data };
  } catch (error) {
    return {
      data: null,
      warning: `CoinMarketCap enrichment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
