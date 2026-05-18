import { Address, getAddress } from "viem";
import { resolveChainKey } from "../../../../../clients/viem/viemChains";

const TRANSFER_METADATA_URL = "https://transfer.layerzero-api.com/v1/metadata";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;

const STARGATE_V1_ROUTERS: Record<string, Address> = {
  arbitrum: getAddress("0x53bf833a5d6c4dda888f69c22c88c9f356a41614"),
  optimism: getAddress("0xb0d502e938ed5f4df2e681fe6e419ff29631d62b"),
  base: getAddress("0x45a01e4e04f14f7a4a6702c74187c5f6222033cd"),
  polygon: getAddress("0x45a01e4e04f14f7a4a6702c74187c5f6222033cd"),
  ethereum: getAddress("0x8731d54e9d02c286767d56ac03e8037c07e01e98"),
};

type TransferMetadataPayload = Record<
  string,
  {
    deployments?: {
      transferDelegate?: {
        address?: string;
      };
    };
  }
>;

let routerCache: Record<string, Address> | null = null;
let routerCacheLoadedAt = 0;
let routerCachePromise: Promise<Record<string, Address>> | null = null;
let lastRefreshFailureAt = 0;

function shouldUseFreshCache(): boolean {
  return routerCache !== null && Date.now() - routerCacheLoadedAt < CACHE_TTL_MS;
}

function shouldAttemptRefresh(): boolean {
  return routerCachePromise === null && Date.now() - lastRefreshFailureAt >= FAILURE_RETRY_MS;
}

function normalizeChain(chain: string): string {
  return String(resolveChainKey(chain) || chain || "")
    .trim()
    .toLowerCase();
}

function addAlias(cache: Record<string, Address>, chain: string, address: Address): void {
  const normalized = normalizeChain(chain);
  if (!normalized) {
    return;
  }

  cache[normalized] = address;
  if (normalized === "ethereum") {
    cache.mainnet = address;
  }
}

async function refreshStargateRouterCache(): Promise<Record<string, Address>> {
  if (routerCachePromise) {
    return routerCachePromise;
  }

  routerCachePromise = (async () => {
    const response = await fetch(TRANSFER_METADATA_URL);
    if (!response.ok) {
      throw new Error(`LayerZero transfer metadata request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as TransferMetadataPayload;
    const nextCache: Record<string, Address> = {};

    for (const [chainKey, entry] of Object.entries(payload || {})) {
      const address = entry?.deployments?.transferDelegate?.address;
      if (!address) {
        continue;
      }

      try {
        const normalizedAddress = getAddress(address);
        addAlias(nextCache, chainKey, normalizedAddress);
      } catch {
        continue;
      }
    }

    routerCache = nextCache;
    routerCacheLoadedAt = Date.now();
    lastRefreshFailureAt = 0;
    return nextCache;
  })()
    .catch((error) => {
      lastRefreshFailureAt = Date.now();
      if (!routerCache) {
        routerCache = {};
      }
      throw error;
    })
    .finally(() => {
      routerCachePromise = null;
    });

  return routerCachePromise;
}

function refreshStargateRouterCacheInBackground(): void {
  if (!shouldAttemptRefresh()) {
    return;
  }

  void refreshStargateRouterCache().catch(() => undefined);
}

async function getStargateRouterCache(): Promise<Record<string, Address>> {
  if (shouldUseFreshCache() && routerCache) {
    return routerCache;
  }

  if (routerCache) {
    refreshStargateRouterCacheInBackground();
    return routerCache;
  }

  if (!shouldAttemptRefresh()) {
    return {};
  }

  try {
    return await refreshStargateRouterCache();
  } catch {
    return routerCache ?? {};
  }
}

export async function listStargateRouterChains(): Promise<string[]> {
  const cache = await getStargateRouterCache();
  return Object.keys(cache);
}

export async function getStargateRouterForChain(chain: string): Promise<Address | null> {
  const cache = await getStargateRouterCache();
  const normalizedChain = normalizeChain(chain);
  return cache[normalizedChain] ?? null;
}

export function listStargateV1RouterChains(): string[] {
  return Object.keys(STARGATE_V1_ROUTERS);
}

export function getStargateV1RouterForChain(chain: string): Address | null {
  const normalizedChain = normalizeChain(chain);
  return STARGATE_V1_ROUTERS[normalizedChain] ?? null;
}

export async function warmStargateRouterCache(): Promise<void> {
  await getStargateRouterCache();
}

export function __resetStargateRouterCacheForTests(): void {
  routerCache = null;
  routerCacheLoadedAt = 0;
  routerCachePromise = null;
  lastRefreshFailureAt = 0;
}
