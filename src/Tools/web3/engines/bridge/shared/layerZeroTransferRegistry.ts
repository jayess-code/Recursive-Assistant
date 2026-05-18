import { Address, getAddress } from "viem";
import { resolveChainKey } from "../../../clients/viem/viemChains";

const TRANSFER_TOKENS_URL = "https://transfer.layerzero-api.com/v1/tokens";
const TRANSFER_METADATA_URL = "https://transfer.layerzero-api.com/v1/metadata";
const LAYERZERO_EXPERIMENTAL_OFTS_URL = "https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list";

const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;

export type LayerZeroExecutionSurface = "adapter" | "oft" | "unknown";

export interface LayerZeroTransferRoutingHint {
  chain: string;
  address: Address;
  executionSurface: LayerZeroExecutionSurface;
  symbol?: string;
  decimals?: number;
  source: "transfer_ofts" | "transfer_tokens";
}

type TransferTokenRecord = {
  chainKey?: string;
  address?: string;
  symbol?: string;
  decimals?: number;
  isSupported?: boolean;
};

type OfTDeployment = {
  type?: string;
  localDecimals?: number;
  innerTokenAddress?: string;
};

type OfTVariant = {
  name?: string;
  deployments?: Record<string, OfTDeployment>;
};

type HintCache = Record<string, LayerZeroTransferRoutingHint>;

let hintCache: HintCache | null = null;
let hintCacheLoadedAt = 0;
let hintCachePromise: Promise<HintCache> | null = null;
let tokenHintCache = new Map<string, LayerZeroTransferRoutingHint | null>();
let lastRefreshFailureAt = 0;

function shouldUseFreshCache(): boolean {
  return hintCache !== null && Date.now() - hintCacheLoadedAt < CACHE_TTL_MS;
}

function shouldAttemptRefresh(): boolean {
  return hintCachePromise === null && Date.now() - lastRefreshFailureAt >= FAILURE_RETRY_MS;
}

function normalizeChainKey(chain: string): string {
  return String(resolveChainKey(chain) || chain || "")
    .trim()
    .toLowerCase();
}

function buildHintKey(chain: string, address: Address): string {
  return `${normalizeChainKey(chain)}:${address.toLowerCase()}`;
}

function parseAddress(address: unknown): Address | null {
  if (typeof address !== "string") {
    return null;
  }

  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`LayerZero request failed (${response.status}) for ${url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeExecutionSurface(type: string | undefined): LayerZeroExecutionSurface {
  const normalized = String(type || "").trim().toUpperCase();

  if (normalized.includes("ADAPTER")) {
    return "adapter";
  }

  if (normalized.includes("OFT")) {
    return "oft";
  }

  return "unknown";
}

function upsertHint(
  hints: HintCache,
  hint: LayerZeroTransferRoutingHint,
  preferred: boolean = false
): void {
  const key = buildHintKey(hint.chain, hint.address);
  const existing = hints[key];

  if (!existing) {
    hints[key] = hint;
    return;
  }

  if (preferred) {
    hints[key] = {
      ...existing,
      ...hint,
    };
    return;
  }

  if (existing.executionSurface === "unknown" && hint.executionSurface !== "unknown") {
    hints[key] = {
      ...existing,
      ...hint,
    };
  }
}

function buildHintsFromExperimentalOfts(payload: unknown): HintCache {
  const hints: HintCache = {};
  const bySymbol = payload as Record<string, OfTVariant[]>;

  for (const [symbol, variants] of Object.entries(bySymbol || {})) {
    if (!Array.isArray(variants)) {
      continue;
    }

    for (const variant of variants) {
      const deployments = variant?.deployments;
      if (!deployments || typeof deployments !== "object") {
        continue;
      }

      for (const [chainKey, deployment] of Object.entries(deployments)) {
        const executionSurface = normalizeExecutionSurface(deployment?.type);
        const candidateAddress =
          executionSurface === "adapter"
            ? parseAddress(deployment?.innerTokenAddress)
            : parseAddress((deployment as { address?: string })?.address);

        if (!candidateAddress || executionSurface === "unknown") {
          continue;
        }

        upsertHint(
          hints,
          {
            chain: chainKey,
            address: candidateAddress,
            executionSurface,
            symbol,
            ...(Number.isFinite(Number(deployment?.localDecimals))
              ? { decimals: Number(deployment?.localDecimals) }
              : {}),
            source: "transfer_ofts",
          },
          true
        );
      }
    }
  }

  return hints;
}

function mergeTransferTokenHints(hints: HintCache, payload: unknown): void {
  const records = (payload as { tokens?: TransferTokenRecord[] })?.tokens;
  if (!Array.isArray(records)) {
    return;
  }

  for (const record of records) {
    if (record?.isSupported !== true) {
      continue;
    }

    const address = parseAddress(record.address);
    if (!address) {
      continue;
    }

    upsertHint(hints, {
      chain: String(record.chainKey || "").toLowerCase(),
      address,
      executionSurface: "unknown",
      ...(record.symbol ? { symbol: record.symbol } : {}),
      ...(Number.isFinite(Number(record.decimals)) ? { decimals: Number(record.decimals) } : {}),
      source: "transfer_tokens",
    });
  }
}

async function refreshLayerZeroTransferCache(): Promise<HintCache> {
  if (hintCachePromise) {
    return hintCachePromise;
  }

  hintCachePromise = (async () => {
    const [oftPayload, transferMetadataPayload] = await Promise.all([
      fetchJsonWithTimeout(LAYERZERO_EXPERIMENTAL_OFTS_URL),
      fetchJsonWithTimeout(TRANSFER_METADATA_URL),
    ]);

    const nextHints = buildHintsFromExperimentalOfts(oftPayload);
    mergeTransferTokenHints(nextHints, transferMetadataPayload);

    hintCache = nextHints;
    tokenHintCache = new Map();
    hintCacheLoadedAt = Date.now();
    lastRefreshFailureAt = 0;

    return nextHints;
  })()
    .catch((error) => {
      lastRefreshFailureAt = Date.now();
      if (!hintCache) {
        hintCache = {};
      }
      throw error;
    })
    .finally(() => {
      hintCachePromise = null;
    });

  return hintCachePromise;
}

function refreshLayerZeroTransferCacheInBackground(): void {
  if (!shouldAttemptRefresh()) {
    return;
  }

  void refreshLayerZeroTransferCache().catch(() => undefined);
}

async function getLayerZeroTransferCache(): Promise<HintCache> {
  if (shouldUseFreshCache() && hintCache) {
    return hintCache;
  }

  if (hintCache) {
    refreshLayerZeroTransferCacheInBackground();
    return hintCache;
  }

  if (!shouldAttemptRefresh()) {
    return {};
  }

  try {
    return await refreshLayerZeroTransferCache();
  } catch {
    return hintCache ?? {};
  }
}

async function getHintFromTransferTokens(chain: string, address: Address): Promise<LayerZeroTransferRoutingHint | null> {
  const key = buildHintKey(chain, address);
  if (tokenHintCache.has(key)) {
    return tokenHintCache.get(key) ?? null;
  }

  const url = `${TRANSFER_TOKENS_URL}?transferrableFromChainKey=${encodeURIComponent(
    normalizeChainKey(chain)
  )}&transferrableFromTokenAddress=${encodeURIComponent(address)}`;

  try {
    const payload = await fetchJsonWithTimeout(url);
    const records = (payload as { tokens?: TransferTokenRecord[] })?.tokens;

    if (!Array.isArray(records) || records.length === 0) {
      tokenHintCache.set(key, null);
      return null;
    }

    // Transfer API records destination support and does not expose execution surface directly.
    const match = records.find((record) => record?.isSupported === true) ?? records[0];
    const hint: LayerZeroTransferRoutingHint = {
      chain,
      address,
      executionSurface: "unknown",
      ...(match?.symbol ? { symbol: match.symbol } : {}),
      ...(Number.isFinite(Number(match?.decimals)) ? { decimals: Number(match?.decimals) } : {}),
      source: "transfer_tokens",
    };

    tokenHintCache.set(key, hint);
    return hint;
  } catch {
    tokenHintCache.set(key, null);
    return null;
  }
}

export async function getLayerZeroTransferRoutingHint(
  chain: string,
  address: Address
): Promise<LayerZeroTransferRoutingHint | null> {
  const normalizedAddress = getAddress(address);
  const cache = await getLayerZeroTransferCache();
  const hint = cache[buildHintKey(chain, normalizedAddress)];

  if (hint) {
    return {
      ...hint,
      chain: normalizeChainKey(chain),
      address: normalizedAddress,
    };
  }

  return getHintFromTransferTokens(chain, normalizedAddress);
}

export async function warmLayerZeroTransferMetadataCache(): Promise<void> {
  await getLayerZeroTransferCache();
}

export function __resetLayerZeroTransferMetadataCacheForTests(): void {
  hintCache = null;
  hintCacheLoadedAt = 0;
  hintCachePromise = null;
  tokenHintCache = new Map();
  lastRefreshFailureAt = 0;
}
