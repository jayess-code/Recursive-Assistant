import { getAddress } from "viem";
import { listRouterRegistryEntries } from "../../../engines/swap/discovery/routerRegistry";
import { upsertDynamicRouterCandidate } from "../../../engines/swap/discovery/dynamicRouterCandidates";
import { DetectionConfidence, SwapExecutionFamily } from "../../../engines/swap/core/SwapTypes";
import { getViemPublicClient } from "../../../clients/viem/getViemPublicClient";
import { resolveChainKey } from "../../../clients/viem/viemChains";
import {
  DexPair,
  fetchDexPairsByTokenAddress,
  fetchDexSearchPairs,
  normalizeDexChain,
  parseDexNullableNumber,
} from "../../../services/DexScreener/dexScreenerClient";
import { DexToolsHint, fetchDexToolsHints } from "../../../services/DEXTools/dexToolsClient";
import { ToolHandlerContext } from "../../types/handler-types";

export interface GetDexInfoArgs {
  dexId: string | null;
  chain: string | null;
  tokenAddress: string | null;
  pairAddress: string | null;
  routerAddress: string | null;
  includeOnchainVerification: boolean | null;
  includeSecondaryHints: boolean | null;
  includeRouterCandidates: boolean | null;
  includeFactoryHints: boolean | null;
  limit: number | null;
}

export interface DexRouterCandidateResult {
  chain: string;
  routerAddress: string;
  familyHint: SwapExecutionFamily;
  quoterAddress: string | null;
  label: string;
  source: "manual" | "registry_fallback" | "dextools_hint";
  confidence: DetectionConfidence;
  verifiedOnchain: boolean;
}

export interface DexInfoResult {
  dexId: string | null;
  chain: string | null;
  tokenAddress: string | null;
  pairAddress: string | null;
  familyHint: SwapExecutionFamily;
  routerCandidates: DexRouterCandidateResult[];
  factoryHints: string[];
  sources: string[];
  notes: string[];
}

function inferFamilyFromDexId(dexId: string | null | undefined): SwapExecutionFamily {
  if (!dexId) {
    return "unknown";
  }

  const normalized = dexId.toLowerCase();

  if (normalized.includes("algebra") || normalized.includes("quickswapv3")) {
    return "algebra";
  }

  if (normalized.includes("v3") || normalized.includes("uniswap-v3")) {
    return "uniswap_v3";
  }

  if (normalized.includes("0x")) {
    return "aggregator_0x";
  }

  const v2Hints = ["uniswap", "sushiswap", "pancakeswap", "camelot", "traderjoe", "spookyswap"];
  if (v2Hints.some((hint) => normalized.includes(hint))) {
    return "uniswap_v2";
  }

  return "unknown";
}

function dedupePairs(pairs: DexPair[]): DexPair[] {
  const byKey = new Map<string, DexPair>();

  for (const pair of pairs) {
    const key = `${String(pair.chainId ?? "").toLowerCase()}:${String(pair.pairAddress ?? "").toLowerCase()}:${String(pair.dexId ?? "").toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, pair);
    }
  }

  return [...byKey.values()];
}

async function verifyRouterOnchain(chain: string, routerAddress: string): Promise<boolean> {
  try {
    const client = getViemPublicClient(resolveChainKey(chain));
    const code = await client.getCode({ address: getAddress(routerAddress) });
    return Boolean(code && code !== "0x");
  } catch {
    return false;
  }
}

function buildFactoryHints(pair: DexPair): string[] {
  if (!pair.pairAddress) {
    return [];
  }

  return [pair.pairAddress];
}

function mapDexToolsHintToPair(hint: DexToolsHint): DexPair {
  return {
    ...(hint.chain ? { chainId: hint.chain } : {}),
    ...(hint.dexId ? { dexId: hint.dexId } : {}),
    ...(hint.pairAddress ? { pairAddress: hint.pairAddress } : {}),
    baseToken: {
      ...(hint.tokenAddress ? { address: hint.tokenAddress } : {}),
    },
  };
}

export async function getDexInfo(
  args: GetDexInfoArgs,
  _context?: ToolHandlerContext
){
  try {
    if (!args.tokenAddress && !args.pairAddress && !args.dexId && !args.routerAddress) {
      return {
        success: false,
        error: "get_dex_info requires at least one of tokenAddress, pairAddress, dexId, or routerAddress.",
      };
    }

    const limit = Math.max(1, Math.min(25, Number(args.limit ?? 10)));
    const includeRouterCandidates = args.includeRouterCandidates ?? true;
    const includeOnchainVerification = args.includeOnchainVerification ?? true;
    const includeSecondaryHints = args.includeSecondaryHints ?? true;
    const includeFactoryHints = args.includeFactoryHints ?? true;
    const chainFilter = normalizeDexChain(args.chain);
    const dexIdFilter = args.dexId ? args.dexId.toLowerCase() : null;

    const fromToken = args.tokenAddress ? await fetchDexPairsByTokenAddress(args.tokenAddress) : [];
    const searchQueries = [args.pairAddress, args.dexId].filter((value): value is string => Boolean(value));
    const fromSearch = (
      await Promise.all(searchQueries.map((query) => fetchDexSearchPairs(query)))
    ).flat();
    const fromDexToolsHints = includeSecondaryHints
      ? (await Promise.all(searchQueries.map((query) => fetchDexToolsHints(query, chainFilter)))).flat()
      : [];
    const fromDexToolsPairs = fromDexToolsHints.map(mapDexToolsHintToPair);

    const allPairs = dedupePairs([...fromToken, ...fromSearch, ...fromDexToolsPairs]);

    const filtered = allPairs
      .filter((pair) => {
        const pairChain = String(pair.chainId ?? "").toLowerCase();
        const pairDexId = String(pair.dexId ?? "").toLowerCase();
        const pairAddress = String(pair.pairAddress ?? "").toLowerCase();

        if (chainFilter && pairChain !== chainFilter) return false;
        if (dexIdFilter && pairDexId !== dexIdFilter) return false;
        if (args.pairAddress && pairAddress !== args.pairAddress.toLowerCase()) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (parseDexNullableNumber(b.liquidity?.usd) ?? 0) -
          (parseDexNullableNumber(a.liquidity?.usd) ?? 0)
      )
      .slice(0, limit);

    if (!filtered.length && args.routerAddress) {
      const chain = resolveChainKey(args.chain ?? "ethereum");
      const familyHint = inferFamilyFromDexId(args.dexId);
      const verified = includeOnchainVerification ? await verifyRouterOnchain(chain, args.routerAddress) : false;

      if (includeRouterCandidates && familyHint !== "unknown") {
        upsertDynamicRouterCandidate({
          chain,
          routerAddress: getAddress(args.routerAddress),
          family: familyHint,
          quoterAddress: null,
          label: `Manual router candidate (${args.dexId ?? "unknown dex"})`,
          source: "manual",
          confidence: verified ? "medium" : "low",
          verifiedOnchain: verified,
        });
      }

      return {
        success: true,
        data: JSON.stringify([
          {
            dexId: args.dexId,
            chain,
            tokenAddress: args.tokenAddress,
            pairAddress: args.pairAddress,
            familyHint,
            routerCandidates: includeRouterCandidates
              ? [
                  {
                    chain,
                    routerAddress: getAddress(args.routerAddress),
                    familyHint,
                    quoterAddress: null,
                    label: "Manual router candidate",
                    source: "manual",
                    confidence: verified ? "medium" : "low",
                    verifiedOnchain: verified,
                  },
                ]
              : [],
            factoryHints: [],
            sources: ["manual"],
            notes: verified
              ? ["Router candidate was verified as deployed onchain."]
              : ["Router candidate could not be verified onchain."],
          },
        ]),
      };
    }

    const output: DexInfoResult[] = [];

    for (const pair of filtered) {
    const chain = resolveChainKey(String(pair.chainId ?? "ethereum"));
    const familyHint = inferFamilyFromDexId(pair.dexId);
    const routerCandidates: DexRouterCandidateResult[] = [];
    const notes: string[] = [];

    if (includeRouterCandidates && familyHint !== "unknown") {
      const hintCandidates = fromDexToolsHints.filter((hint) => {
        const hintChain = String(hint.chain ?? "").toLowerCase();
        const pairChain = String(pair.chainId ?? "").toLowerCase();
        const hintDexId = String(hint.dexId ?? "").toLowerCase();
        const pairDexId = String(pair.dexId ?? "").toLowerCase();

        if (!hint.routerAddress) return false;
        if (pairChain && hintChain && pairChain !== hintChain) return false;
        if (pairDexId && hintDexId && pairDexId !== hintDexId) return false;
        return true;
      });

      for (const hintCandidate of hintCandidates) {
        const verified = includeOnchainVerification
          ? await verifyRouterOnchain(chain, hintCandidate.routerAddress as string)
          : false;
        const confidence: DetectionConfidence = verified ? "medium" : "low";

        routerCandidates.push({
          chain,
          routerAddress: hintCandidate.routerAddress as string,
          familyHint,
          quoterAddress: null,
          label: `DEXTools hint (${hintCandidate.dexId ?? "unknown"})`,
          source: "dextools_hint",
          confidence,
          verifiedOnchain: verified,
        });

        upsertDynamicRouterCandidate({
          chain,
          routerAddress: getAddress(hintCandidate.routerAddress as string),
          family: familyHint,
          quoterAddress: null,
          label: `DEXTools hint (${hintCandidate.dexId ?? "unknown"})`,
          source: "dextools",
          confidence,
          verifiedOnchain: verified,
        });
      }

      const registryCandidates = listRouterRegistryEntries(chain).filter((entry) => entry.family === familyHint);

      for (const candidate of registryCandidates) {
        const verified = includeOnchainVerification
          ? await verifyRouterOnchain(chain, candidate.routerAddress)
          : false;
        const confidence: DetectionConfidence = verified ? "high" : "medium";

        routerCandidates.push({
          chain,
          routerAddress: candidate.routerAddress,
          familyHint,
          quoterAddress: candidate.quoterAddress ?? null,
          label: candidate.label,
          source: "registry_fallback",
          confidence,
          verifiedOnchain: verified,
        });

        upsertDynamicRouterCandidate({
          chain,
          routerAddress: candidate.routerAddress,
          family: candidate.family,
          quoterAddress: candidate.quoterAddress ?? null,
          label: candidate.label,
          source: "registry_fallback",
          confidence,
          verifiedOnchain: verified,
        });
      }

      if (!routerCandidates.length) {
        notes.push("No router candidates found from current registry fallback for inferred family.");
      }

      if (registryCandidates[0]?.label) {
        notes.push(`Registry anchor available: ${registryCandidates[0].label}.`);
      }
    }

      output.push({
      dexId: pair.dexId ?? null,
      chain,
      tokenAddress: pair.baseToken?.address ?? null,
      pairAddress: pair.pairAddress ?? null,
      familyHint,
      routerCandidates,
      factoryHints: includeFactoryHints ? buildFactoryHints(pair) : [],
      sources: [
        "dexscreener",
        ...(fromDexToolsHints.length ? ["dextools"] : []),
        ...(routerCandidates.some((candidate) => candidate.source === "registry_fallback")
          ? ["registry_fallback"]
          : []),
      ],
      notes,
      });
    }

    return {
      success: true,
      data: JSON.stringify(output),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get dex info: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
