import { getAddress } from "viem";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveChainKey } from "../../../clients/viem/viemChains";
import { Address, ChainKey } from "../../../clients/viem/viem-types";
import { DetectionConfidence, SwapExecutionFamily } from "../core/SwapTypes";

export interface DynamicRouterCandidate {
  chain: ChainKey;
  routerAddress: Address;
  family: SwapExecutionFamily;
  quoterAddress?: Address | null;
  label: string;
  source: string;
  confidence: DetectionConfidence;
  verifiedOnchain: boolean;
  updatedAt: number;
}

const cache = new Map<string, DynamicRouterCandidate>();
let loadedFromDisk = false;
let persistencePath = process.env.SWAP_DYNAMIC_CANDIDATES_PATH ??
  join(process.cwd(), ".cache", "swap", "dynamic-router-candidates.json");

function cacheKey(chain: ChainKey, routerAddress: Address): string {
  return `${resolveChainKey(chain)}:${routerAddress.toLowerCase()}`;
}

function ensureLoadedFromDisk(): void {
  if (loadedFromDisk) {
    return;
  }

  loadedFromDisk = true;

  try {
    if (!existsSync(persistencePath)) {
      return;
    }

    const raw = readFileSync(persistencePath, "utf-8");
    const parsed = JSON.parse(raw) as DynamicRouterCandidate[];

    if (!Array.isArray(parsed)) {
      return;
    }

    for (const entry of parsed) {
      try {
        const normalizedChain = resolveChainKey(entry.chain);
        const normalizedRouter = getAddress(entry.routerAddress);
        const normalizedQuoter = entry.quoterAddress ? getAddress(entry.quoterAddress) : null;

        const normalized: DynamicRouterCandidate = {
          chain: normalizedChain,
          routerAddress: normalizedRouter,
          family: entry.family,
          quoterAddress: normalizedQuoter,
          label: entry.label,
          source: entry.source,
          confidence: entry.confidence,
          verifiedOnchain: entry.verifiedOnchain === true,
          updatedAt: Number(entry.updatedAt || Date.now()),
        };

        cache.set(cacheKey(normalized.chain, normalized.routerAddress), normalized);
      } catch {
        continue;
      }
    }
  } catch {
    // Best-effort cache hydration; corrupted persistence should not break runtime.
  }
}

function persistCacheToDisk(): void {
  try {
    mkdirSync(dirname(persistencePath), { recursive: true });
    writeFileSync(persistencePath, JSON.stringify([...cache.values()], null, 2), "utf-8");
  } catch {
    // Best-effort persistence; detection should continue in-memory if write fails.
  }
}

export function upsertDynamicRouterCandidate(
  candidate: Omit<DynamicRouterCandidate, "updatedAt" | "routerAddress" | "chain"> & {
    chain: ChainKey;
    routerAddress: Address;
  }
): DynamicRouterCandidate {
  ensureLoadedFromDisk();

  const normalizedChain = resolveChainKey(candidate.chain);
  const normalizedRouter = getAddress(candidate.routerAddress);

  const normalized: DynamicRouterCandidate = {
    ...candidate,
    chain: normalizedChain,
    routerAddress: normalizedRouter,
    quoterAddress: candidate.quoterAddress ? getAddress(candidate.quoterAddress) : null,
    updatedAt: Date.now(),
  };

  cache.set(cacheKey(normalized.chain, normalized.routerAddress), normalized);
  persistCacheToDisk();
  return normalized;
}

export function findDynamicRouterCandidate(chain: ChainKey, routerAddress: Address): DynamicRouterCandidate | null {
  ensureLoadedFromDisk();

  const normalizedChain = resolveChainKey(chain);
  const normalizedRouter = getAddress(routerAddress);
  return cache.get(cacheKey(normalizedChain, normalizedRouter)) ?? null;
}

export function listDynamicRouterCandidates(chain?: ChainKey): DynamicRouterCandidate[] {
  ensureLoadedFromDisk();

  if (!chain) {
    return [...cache.values()];
  }

  const normalizedChain = resolveChainKey(chain);
  return [...cache.values()].filter((entry) => resolveChainKey(entry.chain) === normalizedChain);
}

export function clearDynamicRouterCandidates(): void {
  ensureLoadedFromDisk();
  cache.clear();
  persistCacheToDisk();
}

export function __setDynamicRouterCandidatesPersistencePathForTests(path: string): void {
  persistencePath = path;
  loadedFromDisk = false;
  cache.clear();
}

export function __resetDynamicRouterCandidatesStateForTests(): void {
  loadedFromDisk = false;
  cache.clear();
}
