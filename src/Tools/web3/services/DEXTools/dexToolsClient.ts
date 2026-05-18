import { normalizeDexChain } from "../DexScreener/dexScreenerClient";

export interface DexToolsHint {
  chain: string | null;
  dexId: string | null;
  pairAddress: string | null;
  routerAddress: string | null;
  tokenAddress: string | null;
  source: "dextools";
}

type DexToolsPayload = Record<string, unknown>;

function toArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  return [];
}

function normalizeAddress(value: unknown): string | null {
  const text = typeof value === "string" ? value : null;
  if (!text) {
    return null;
  }

  return /^0x[a-fA-F0-9]{40}$/.test(text) ? text : null;
}

function pickFirstString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeHint(item: Record<string, unknown>): DexToolsHint {
  const chainRaw = pickFirstString(item, ["chain", "chainId", "network", "networkId"]);
  const chain = normalizeDexChain(chainRaw) ?? (chainRaw ? chainRaw.toLowerCase() : null);

  return {
    chain,
    dexId: pickFirstString(item, ["dexId", "dex", "exchange", "exchangeId"]),
    pairAddress: normalizeAddress(item.pairAddress ?? item.poolAddress ?? item.pair ?? null),
    routerAddress: normalizeAddress(item.routerAddress ?? item.router ?? item.exchangeRouter ?? null),
    tokenAddress: normalizeAddress(item.tokenAddress ?? item.baseTokenAddress ?? item.baseToken ?? null),
    source: "dextools",
  };
}

function extractCandidateArrays(payload: DexToolsPayload): Record<string, unknown>[][] {
  const buckets: Record<string, unknown>[][] = [];

  buckets.push(toArray(payload.data));
  buckets.push(toArray(payload.results));
  buckets.push(toArray(payload.pairs));
  buckets.push(toArray(payload.items));

  if (payload.data && typeof payload.data === "object") {
    const nested = payload.data as Record<string, unknown>;
    buckets.push(toArray(nested.results));
    buckets.push(toArray(nested.pairs));
    buckets.push(toArray(nested.items));
  }

  return buckets;
}

function buildDexToolsUrl(baseUrl: string, query: string, chain?: string | null): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  const encodedQuery = encodeURIComponent(query);
  const chainPart = chain ? `&chain=${encodeURIComponent(chain)}` : "";
  return `${baseUrl}${separator}query=${encodedQuery}${chainPart}`;
}

export async function fetchDexToolsHints(query: string, chain?: string | null): Promise<DexToolsHint[]> {
  const baseUrl = process.env.DEXTOOLS_API_URL;
  if (!baseUrl || !query.trim()) {
    return [];
  }

  const headers: Record<string, string> = {};
  if (process.env.DEXTOOLS_API_KEY) {
    headers["x-api-key"] = process.env.DEXTOOLS_API_KEY;
  }

  try {
    const response = await fetch(buildDexToolsUrl(baseUrl, query, chain), { headers });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as DexToolsPayload;
    const arrays = extractCandidateArrays(payload);
    const hints = arrays
      .flat()
      .map(normalizeHint)
      .filter((hint) => hint.dexId || hint.pairAddress || hint.routerAddress || hint.tokenAddress);

    const deduped = new Map<string, DexToolsHint>();
    for (const hint of hints) {
      const key = `${hint.chain ?? ""}:${hint.dexId ?? ""}:${hint.pairAddress ?? ""}:${hint.routerAddress ?? ""}`;
      deduped.set(key, hint);
    }

    return [...deduped.values()];
  } catch {
    return [];
  }
}
