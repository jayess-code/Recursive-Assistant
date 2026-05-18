import { resolveChainKey } from "../../../clients/viem/viemChains";

const LAYERZERO_METADATA_URL = "https://metadata.layerzero-api.com/v1/metadata";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;

const FALLBACK_V2_EIDS: Record<string, number> = {
  ethereum: 30101,
  mainnet: 30101,
  arbitrum: 30110,
  polygon: 30109,
  optimism: 30111,
  base: 30184,
  katana: 30375,
};

const FALLBACK_V1_CHAIN_IDS: Record<string, number> = {
  ethereum: 101,
  mainnet: 101,
  arbitrum: 110,
  polygon: 109,
  optimism: 111,
  base: 184,
};

const METADATA_CHAIN_ALIASES: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  mainnet: "ethereum",
};

type LayerZeroDeployment = {
  eid?: number | string;
  version?: number | string;
  endpoint?: { address?: string | null } | null;
  endpointV2?: { address?: string | null } | null;
  endpointV2View?: { address?: string | null } | null;
};

type LayerZeroChainMetadata = {
  environment?: string;
  chainKey?: string;
  chainName?: string;
  chainDetails?: {
    chainKey?: string;
    name?: string;
    shortName?: string;
    mainnetChainName?: string;
  };
  deployments?: LayerZeroDeployment[];
};

export type LayerZeroChainInfo = {
  key: string;
  chainKey?: string;
  chainName?: string;
  chainDetails?: LayerZeroChainMetadata["chainDetails"];
  v1ChainId?: number;
  v2Eid?: number;
  endpointV2?: string;
};

let chainCache: Record<string, LayerZeroChainInfo> | null = null;
let v1ChainIdCache: Record<string, number> | null = null;
let v2EidCache: Record<string, number> | null = null;
let endpointV2Cache: Record<string, string> | null = null;
let eidCacheLoadedAt = 0;
let eidCachePromise: Promise<Record<string, number>> | null = null;
let lastRefreshFailureAt = 0;

function shouldUseFreshCache(): boolean {
  return v2EidCache !== null && Date.now() - eidCacheLoadedAt < CACHE_TTL_MS;
}

function shouldAttemptRefresh(): boolean {
  return eidCachePromise === null && Date.now() - lastRefreshFailureAt >= FAILURE_RETRY_MS;
}

function normalizeMetadataAlias(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return METADATA_CHAIN_ALIASES[normalized] ?? normalized;
}

function normalizeLookupChainKey(chain: string): string {
  const resolved = resolveChainKey(chain);
  return normalizeMetadataAlias(resolved) ?? normalizeMetadataAlias(chain) ?? String(chain || "").trim().toLowerCase();
}


function addAliasWithRank<T>(
  cache: Record<string, T>,
  ranks: Record<string, number>,
  alias: string | null | undefined,
  value: T,
  rank: number
): void {
  const normalized = normalizeMetadataAlias(alias);
  if (!normalized) {
    return;
  }

  const currentRank = ranks[normalized] ?? 0;
  if (currentRank > rank) {
    return;
  }

  cache[normalized] = value;
  ranks[normalized] = rank;

  if (normalized === "ethereum") {
    cache.mainnet = value;
    ranks.mainnet = Math.max(ranks.mainnet ?? 0, rank);
  }
}

function addEidAliasWithRank(
  cache: Record<string, number>,
  ranks: Record<string, number>,
  alias: string | null | undefined,
  eid: number,
  rank: number,
  canonical: Record<string, number>
): void {
  const normalized = normalizeMetadataAlias(alias);
  if (!normalized) {
    return;
  }

  const canonicalEid = canonical[normalized];
  if (canonicalEid && canonicalEid !== eid) {
    return;
  }

  addAliasWithRank(cache, ranks, normalized, eid, rank);
}

function extractEndpointV2Address(deployment: LayerZeroDeployment): string | null {
  return (
    deployment.endpointV2?.address ??
    deployment.endpointV2View?.address ??
    null
  );
}

function parseV2Deployment(metadata: LayerZeroChainMetadata): { eid?: number; endpointV2?: string } | null {
  const deployments = Array.isArray(metadata.deployments) ? metadata.deployments : [];
  const v2Deployment = deployments.find((deployment) => Number(deployment?.version) === 2);
  const fallbackDeployment = deployments.find((deployment) => Boolean(extractEndpointV2Address(deployment)));
  const selected = v2Deployment ?? fallbackDeployment;
  if (!selected) {
    return null;
  }

  const eid = Number(selected.eid ?? 0);
  const endpointV2 = extractEndpointV2Address(selected) ?? undefined;
  const normalizedEid = eid > 0 ? eid : undefined;

  if (!normalizedEid && !endpointV2) {
    return null;
  }

  return {
    ...(normalizedEid ? { eid: normalizedEid } : {}),
    ...(endpointV2 ? { endpointV2 } : {}),
  };
}

function parseV1ChainId(metadata: LayerZeroChainMetadata): number | null {
  const deployments = Array.isArray(metadata.deployments) ? metadata.deployments : [];
  const v1Deployment = deployments.find((deployment) => {
    const version = Number(deployment?.version);
    return Number.isFinite(version) && version <= 1;
  });
  const fallbackDeployment = deployments.find((deployment) => Number(deployment?.eid) > 0);
  const eid = Number(v1Deployment?.eid ?? fallbackDeployment?.eid ?? 0);

  return eid > 0 ? eid : null;
}

function buildLayerZeroMetadataCache(payload: unknown): {
  chainCache: Record<string, LayerZeroChainInfo>;
  v1ChainIdCache: Record<string, number>;
  v2EidCache: Record<string, number>;
  endpointV2Cache: Record<string, string>;
} {
  const metadata = payload as Record<string, LayerZeroChainMetadata>;
  const chainCache: Record<string, LayerZeroChainInfo> = {};
  const v1ChainIdCache: Record<string, number> = { ...FALLBACK_V1_CHAIN_IDS };
  const v2EidCache: Record<string, number> = { ...FALLBACK_V2_EIDS };
  const endpointV2Cache: Record<string, string> = {};
  const chainAliasRank: Record<string, number> = {};
  const v1AliasRank: Record<string, number> = {};
  const v2AliasRank: Record<string, number> = {};
  const endpointAliasRank: Record<string, number> = {};

  for (const [topLevelKey, entry] of Object.entries(metadata || {})) {
    if (entry?.environment && entry.environment !== "mainnet") {
      continue;
    }

    const v2Deployment = parseV2Deployment(entry);
    const v1ChainId = parseV1ChainId(entry);

    const info: LayerZeroChainInfo = {
      key: normalizeMetadataAlias(entry.chainKey) ?? normalizeMetadataAlias(topLevelKey) ?? topLevelKey,
      ...(entry.chainKey ? { chainKey: entry.chainKey } : {}),
      ...(entry.chainName ? { chainName: entry.chainName } : {}),
      ...(entry.chainDetails ? { chainDetails: entry.chainDetails } : {}),
      ...(v1ChainId ? { v1ChainId } : {}),
      ...(v2Deployment?.eid ? { v2Eid: v2Deployment.eid } : {}),
      ...(v2Deployment?.endpointV2 ? { endpointV2: v2Deployment.endpointV2 } : {}),
    };

    addAliasWithRank(chainCache, chainAliasRank, topLevelKey, info, 3);
    addAliasWithRank(chainCache, chainAliasRank, entry.chainKey, info, 3);
    addAliasWithRank(chainCache, chainAliasRank, entry.chainName, info, 2);
    addAliasWithRank(chainCache, chainAliasRank, entry.chainDetails?.chainKey, info, 2);
    addAliasWithRank(chainCache, chainAliasRank, entry.chainDetails?.name, info, 1);
    addAliasWithRank(chainCache, chainAliasRank, entry.chainDetails?.shortName, info, 1);
    addAliasWithRank(chainCache, chainAliasRank, entry.chainDetails?.mainnetChainName, info, 1);

    if (v1ChainId) {
      addEidAliasWithRank(v1ChainIdCache, v1AliasRank, topLevelKey, v1ChainId, 3, FALLBACK_V1_CHAIN_IDS);
      addEidAliasWithRank(v1ChainIdCache, v1AliasRank, entry.chainKey, v1ChainId, 3, FALLBACK_V1_CHAIN_IDS);
      addEidAliasWithRank(v1ChainIdCache, v1AliasRank, entry.chainName, v1ChainId, 2, FALLBACK_V1_CHAIN_IDS);
      addEidAliasWithRank(
        v1ChainIdCache,
        v1AliasRank,
        entry.chainDetails?.chainKey,
        v1ChainId,
        2,
        FALLBACK_V1_CHAIN_IDS
      );
      addEidAliasWithRank(v1ChainIdCache, v1AliasRank, entry.chainDetails?.name, v1ChainId, 1, FALLBACK_V1_CHAIN_IDS);
      addEidAliasWithRank(
        v1ChainIdCache,
        v1AliasRank,
        entry.chainDetails?.shortName,
        v1ChainId,
        1,
        FALLBACK_V1_CHAIN_IDS
      );
      addEidAliasWithRank(
        v1ChainIdCache,
        v1AliasRank,
        entry.chainDetails?.mainnetChainName,
        v1ChainId,
        1,
        FALLBACK_V1_CHAIN_IDS
      );
    }

    if (v2Deployment?.eid) {
      addEidAliasWithRank(v2EidCache, v2AliasRank, topLevelKey, v2Deployment.eid, 3, FALLBACK_V2_EIDS);
      addEidAliasWithRank(v2EidCache, v2AliasRank, entry.chainKey, v2Deployment.eid, 3, FALLBACK_V2_EIDS);
      addEidAliasWithRank(v2EidCache, v2AliasRank, entry.chainName, v2Deployment.eid, 2, FALLBACK_V2_EIDS);
      addEidAliasWithRank(
        v2EidCache,
        v2AliasRank,
        entry.chainDetails?.chainKey,
        v2Deployment.eid,
        2,
        FALLBACK_V2_EIDS
      );
      addEidAliasWithRank(v2EidCache, v2AliasRank, entry.chainDetails?.name, v2Deployment.eid, 1, FALLBACK_V2_EIDS);
      addEidAliasWithRank(
        v2EidCache,
        v2AliasRank,
        entry.chainDetails?.shortName,
        v2Deployment.eid,
        1,
        FALLBACK_V2_EIDS
      );
      addEidAliasWithRank(
        v2EidCache,
        v2AliasRank,
        entry.chainDetails?.mainnetChainName,
        v2Deployment.eid,
        1,
        FALLBACK_V2_EIDS
      );
    }

    if (v2Deployment?.endpointV2) {
      addAliasWithRank(endpointV2Cache, endpointAliasRank, topLevelKey, v2Deployment.endpointV2, 3);
      addAliasWithRank(endpointV2Cache, endpointAliasRank, entry.chainKey, v2Deployment.endpointV2, 3);
      addAliasWithRank(endpointV2Cache, endpointAliasRank, entry.chainName, v2Deployment.endpointV2, 2);
      addAliasWithRank(
        endpointV2Cache,
        endpointAliasRank,
        entry.chainDetails?.chainKey,
        v2Deployment.endpointV2,
        2
      );
      addAliasWithRank(
        endpointV2Cache,
        endpointAliasRank,
        entry.chainDetails?.name,
        v2Deployment.endpointV2,
        1
      );
      addAliasWithRank(
        endpointV2Cache,
        endpointAliasRank,
        entry.chainDetails?.shortName,
        v2Deployment.endpointV2,
        1
      );
      addAliasWithRank(
        endpointV2Cache,
        endpointAliasRank,
        entry.chainDetails?.mainnetChainName,
        v2Deployment.endpointV2,
        1
      );
    }
  }

  return { chainCache, v1ChainIdCache, v2EidCache, endpointV2Cache };
}

async function refreshLayerZeroV2EidCache(): Promise<Record<string, number>> {
  if (eidCachePromise) {
    return eidCachePromise;
  }

  eidCachePromise = (async () => {
    const response = await fetch(LAYERZERO_METADATA_URL);
    if (!response.ok) {
      throw new Error(`LayerZero metadata request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const nextCache = buildLayerZeroMetadataCache(payload);
    chainCache = nextCache.chainCache;
    v1ChainIdCache = nextCache.v1ChainIdCache;
    v2EidCache = nextCache.v2EidCache;
    endpointV2Cache = nextCache.endpointV2Cache;
    eidCacheLoadedAt = Date.now();
    lastRefreshFailureAt = 0;
    return nextCache.v2EidCache;
  })()
    .catch((error) => {
      lastRefreshFailureAt = Date.now();

      if (!v2EidCache) {
        chainCache = {};
        v1ChainIdCache = { ...FALLBACK_V1_CHAIN_IDS };
        v2EidCache = { ...FALLBACK_V2_EIDS };
        endpointV2Cache = {};
        eidCacheLoadedAt = 0;
      }

      throw error;
    })
    .finally(() => {
      eidCachePromise = null;
    });

  return eidCachePromise;
}

function refreshLayerZeroV2EidCacheInBackground(): void {
  if (!shouldAttemptRefresh()) {
    return;
  }

  void refreshLayerZeroV2EidCache().catch(() => undefined);
}

async function getLayerZeroV2EidCache(): Promise<Record<string, number>> {
  if (shouldUseFreshCache() && v2EidCache) {
    return v2EidCache;
  }

  if (v2EidCache) {
    refreshLayerZeroV2EidCacheInBackground();
    return v2EidCache;
  }

  if (!shouldAttemptRefresh()) {
    return { ...FALLBACK_V2_EIDS };
  }

  try {
    return await refreshLayerZeroV2EidCache();
  } catch {
    return v2EidCache ?? { ...FALLBACK_V2_EIDS };
  }
}

async function getLayerZeroV1ChainIdCache(): Promise<Record<string, number>> {
  if (shouldUseFreshCache() && v1ChainIdCache) {
    return v1ChainIdCache;
  }

  if (v1ChainIdCache) {
    refreshLayerZeroV2EidCacheInBackground();
    return v1ChainIdCache;
  }

  if (!shouldAttemptRefresh()) {
    return { ...FALLBACK_V1_CHAIN_IDS };
  }

  try {
    await refreshLayerZeroV2EidCache();
    return v1ChainIdCache ?? { ...FALLBACK_V1_CHAIN_IDS };
  } catch {
    return v1ChainIdCache ?? { ...FALLBACK_V1_CHAIN_IDS };
  }
}

async function getLayerZeroV2EndpointCache(): Promise<Record<string, string>> {
  if (shouldUseFreshCache() && endpointV2Cache) {
    return endpointV2Cache;
  }

  if (endpointV2Cache) {
    refreshLayerZeroV2EidCacheInBackground();
    return endpointV2Cache;
  }

  if (!shouldAttemptRefresh()) {
    return {};
  }

  try {
    await refreshLayerZeroV2EidCache();
    return endpointV2Cache ?? {};
  } catch {
    return endpointV2Cache ?? {};
  }
}

async function getLayerZeroChainCache(): Promise<Record<string, LayerZeroChainInfo>> {
  if (shouldUseFreshCache() && chainCache) {
    return chainCache;
  }

  if (chainCache) {
    refreshLayerZeroV2EidCacheInBackground();
    return chainCache;
  }

  if (!shouldAttemptRefresh()) {
    return {};
  }

  try {
    await refreshLayerZeroV2EidCache();
    return chainCache ?? {};
  } catch {
    return chainCache ?? {};
  }
}

export async function getLayerZeroV2EndpointId(chain: string): Promise<number> {
  const cache = await getLayerZeroV2EidCache();
  const normalizedChain = normalizeLookupChainKey(chain);
  const eid = cache[normalizedChain];

  if (!eid) {
    throw new Error(`Missing LayerZero V2 endpoint id for ${chain}`);
  }

  return eid;
}

export async function getLayerZeroV1ChainId(chain: string): Promise<number> {
  const cache = await getLayerZeroV1ChainIdCache();
  const normalizedChain = normalizeLookupChainKey(chain);
  const chainId = cache[normalizedChain];

  if (!chainId) {
    throw new Error(`Missing LayerZero V1 chain id for ${chain}`);
  }

  return chainId;
}

export async function getLayerZeroV2EndpointAddress(chain: string): Promise<string> {
  const cache = await getLayerZeroV2EndpointCache();
  const normalizedChain = normalizeLookupChainKey(chain);
  const endpoint = cache[normalizedChain];

  if (!endpoint) {
    throw new Error(`Missing LayerZero V2 endpoint address for ${chain}`);
  }

  return endpoint;
}

export async function getLayerZeroChainMetadata(chain: string): Promise<LayerZeroChainInfo | null> {
  const cache = await getLayerZeroChainCache();
  const normalizedChain = normalizeLookupChainKey(chain);
  return cache[normalizedChain] ?? null;
}

export async function warmLayerZeroV2MetadataCache(): Promise<void> {
  await getLayerZeroV2EidCache();
}

export function __resetLayerZeroV2MetadataCacheForTests(): void {
  chainCache = null;
  v1ChainIdCache = null;
  v2EidCache = null;
  endpointV2Cache = null;
  eidCacheLoadedAt = 0;
  eidCachePromise = null;
  lastRefreshFailureAt = 0;
}