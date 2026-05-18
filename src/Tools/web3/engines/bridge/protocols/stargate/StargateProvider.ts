
import { listStargateRouterChains } from "./discovery/stargateRouters";
import { PoolGraph, StargatePoolGraphBuilder } from "./StargatePoolGraphBuilder";
import { BridgeProvider } from "../../core/providers/BridgeProvider";
import {
  BridgeAssetArgs,
  BridgeCapabilityDiscoveryArgs,
  BridgeDiscoveredRouteCandidate,
  BridgeDiscoveredToken,
  BridgeExecutionResult,
  BridgeProviderCapabilities,
  BridgeSimulationResult,
} from "../../core/BridgeTypes";
import {
  normalizeArgs,
  normalizeStringSet,
  NormalizedBridgeInput,
  resolveV1SourceTokenAddress,
} from "./shared/StargateNormalizer";
import {
  StargateRouteSupportAssessment,
  assessUnifiedRouteSupport,
  buildAssessmentCacheKey,
} from "./assessment/StargateAssessment";
import { buildPlan } from "./planning/StargatePlanBuilder";
import { StargateCrossChainMatcher } from "./matcher/StargateCrossChainMatcher";
import { viemChains } from "../../../../clients/viem/viemChains";
import { TokenIdentityResolver } from "../../identity/TokenIdentityResolver";
import { ChainKey } from "../../../../clients/viem/viem-types";
import { writeContractTool } from "../../../../tools/general/contracts/writeContract/writeContractTool";
import { createViemWalletClient } from "../../../../clients/viem/createViemWalletClient";

interface BridgeExecutionStep {
  tool: string;
  args: any;
  type: string;
}

export class StargateProvider implements BridgeProvider {
  readonly id = "stargate";

  private readonly supportAssessmentCache = new Map<string, Promise<StargateRouteSupportAssessment>>();

  async discoverCapabilities(args: BridgeCapabilityDiscoveryArgs): Promise<BridgeProviderCapabilities> {
    const fromChainsFilter = normalizeStringSet(args.fromChains);
    const toChainsFilter = normalizeStringSet(args.toChains);
    const symbolsFilter = normalizeStringSet(args.symbols, true);
    const warnings: string[] = [];

    const chains: BridgeProviderCapabilities["chains"] = [];
    const routerChains = await listStargateRouterChains();
    for (const chainKey of routerChains) {
      const normalizedChainKey = String(chainKey).toLowerCase();
      const matchesFilter =
        (fromChainsFilter.size === 0 && toChainsFilter.size === 0) ||
        fromChainsFilter.has(normalizedChainKey) ||
        toChainsFilter.has(normalizedChainKey);
      if (!matchesFilter) {
        continue;
      }

      const viemChain = viemChains[chainKey as keyof typeof viemChains];
      if (args.includeOnlyViemChains && !viemChain) {
        continue;
      }

      chains.push({
        chainKey,
        chainType: "EVM",
        chainId: viemChain?.id ?? null,
        name: viemChain?.name ?? chainKey,
        shortName: (viemChain as { shortName?: string } | undefined)?.shortName ?? null,
        nativeSymbol: viemChain?.nativeCurrency?.symbol ?? null,
        nativeDecimals: viemChain?.nativeCurrency?.decimals ?? null,
        isViemSupported: Boolean(viemChain),
        metadata: {
          discoverySource: "layerzero_transfer_metadata",
        },
      });
    }

    const activeChainSet = new Set(chains.map((chain) => chain.chainKey));
    const tokensByKey = new Map<string, BridgeDiscoveredToken>();
    const routeCandidates: BridgeDiscoveredRouteCandidate[] = [];
    const routeCandidateKeys = new Set<string>();
    const supportedTokenKeys = new Set<string>();

    const v1Graphs = (
      await Promise.all([...activeChainSet].map((chainKey) => StargatePoolGraphBuilder.build(chainKey as ChainKey)))
    )
      .filter((result): result is { status: "success"; graph: PoolGraph } => result.status === "success" && Boolean(result.graph))
      .map((result) => result.graph);

    for (const graph of v1Graphs) {
      for (const pool of graph.pools) {
        const identity = TokenIdentityResolver.resolveIdentity({
          chain: graph.resolvedChain as ChainKey,
          address: pool.token,
          decimals: pool.decimals,
        });
        const tokenKey = `${graph.resolvedChain}:${pool.token.toLowerCase()}`;
        if (!tokensByKey.has(tokenKey)) {
          tokensByKey.set(tokenKey, {
            chainKey: graph.resolvedChain,
            address: pool.token,
            symbol: identity.symbol,
            name: identity.name,
            decimals: identity.decimals ?? pool.decimals,
            isSupported: false,
            isViemSupported: Boolean(viemChains[graph.resolvedChain as ChainKey]),
            priceUsd: null,
            canonicalId: identity.canonicalId,
            canonicalSource: identity.canonicalSource,
            metadata: {
              discoveryStatus: "pool_graph_only",
              strategy: "v1_pool_graph",
              poolId: pool.poolId,
              routerAddress: graph.router,
              factoryAddress: graph.factory,
            },
          });
        }
      }
    }

    outerV1From: for (const fromGraph of v1Graphs) {
      for (const toGraph of v1Graphs) {
        if (routeCandidates.length >= args.maxRoutes) {
          break outerV1From;
        }
        if (fromGraph.resolvedChain === toGraph.resolvedChain) {
          continue;
        }
        if (fromChainsFilter.size > 0 && !fromChainsFilter.has(String(fromGraph.resolvedChain).toLowerCase())) {
          continue;
        }
        if (toChainsFilter.size > 0 && !toChainsFilter.has(String(toGraph.resolvedChain).toLowerCase())) {
          continue;
        }

        for (const sourcePool of fromGraph.pools) {
          if (routeCandidates.length >= args.maxRoutes) {
            break outerV1From;
          }

          const destinationTokenAddress = toGraph.poolIdToToken[sourcePool.poolId];
          if (!destinationTokenAddress) {
            continue;
          }

          const sourceIdentity = TokenIdentityResolver.resolveIdentity({
            chain: fromGraph.resolvedChain as ChainKey,
            address: sourcePool.token,
            decimals: sourcePool.decimals,
          });
          const destinationPool = toGraph.pools.find((pool) => pool.poolId === sourcePool.poolId) ?? null;
          const destinationIdentity = TokenIdentityResolver.resolveIdentity({
            chain: toGraph.resolvedChain as ChainKey,
            address: destinationTokenAddress,
            decimals: destinationPool?.decimals ?? null,
          });

          const symbol = sourceIdentity.symbol ?? destinationIdentity.symbol;
          if (symbolsFilter.size > 0 && (!symbol || !symbolsFilter.has(symbol.toUpperCase()))) {
            continue;
          }

          const routeKey = `${fromGraph.resolvedChain}:${toGraph.resolvedChain}:${sourcePool.poolId}:${sourcePool.token.toLowerCase()}:${destinationTokenAddress.toLowerCase()}:v1`;
          if (routeCandidateKeys.has(routeKey)) {
            continue;
          }
          routeCandidateKeys.add(routeKey);

          routeCandidates.push({
            provider: this.id,
            fromChain: fromGraph.resolvedChain,
            toChain: toGraph.resolvedChain,
            canonicalId: sourceIdentity.canonicalId,
            symbol,
            name: sourceIdentity.name ?? destinationIdentity.name,
            fromTokenAddress: sourcePool.token,
            toTokenAddress: destinationTokenAddress,
            fromChainViemSupported: Boolean(viemChains[fromGraph.resolvedChain as ChainKey]),
            toChainViemSupported: Boolean(viemChains[toGraph.resolvedChain as ChainKey]),
            metadata: {
              routeKind: "pool_graph_v1",
              srcPoolId: sourcePool.poolId,
              dstPoolId: sourcePool.poolId,
              routerAddress: fromGraph.router,
              sourceFactoryAddress: fromGraph.factory,
              destinationFactoryAddress: toGraph.factory,
              sourceTokenDecimals: sourcePool.decimals,
              destinationTokenDecimals: destinationPool?.decimals ?? null,
              strategy: "v1_pool_graph",
              routeTypes: ["STARGATE_V1_POOL_GRAPH"],
            },
          });

          supportedTokenKeys.add(`${fromGraph.resolvedChain}:${sourcePool.token.toLowerCase()}`);
          supportedTokenKeys.add(`${toGraph.resolvedChain}:${destinationTokenAddress.toLowerCase()}`);
        }
      }
    }

    const tokens = [...tokensByKey.values()]
      .map((token) => {
        const tokenKey = `${token.chainKey}:${token.address.toLowerCase()}`;
        const isSupported = supportedTokenKeys.has(tokenKey);
        return {
          ...token,
          isSupported,
          metadata: {
            ...token.metadata,
            discoveryStatus: isSupported ? "supported" : "known_not_executable",
          },
        };
      })
      .filter((token) => (args.includeUnsupportedTokens ? true : token.isSupported));

    if (chains.length === 0) {
      warnings.push("No Stargate chains matched the selected filters.");
    }
    if (tokens.length === 0) {
      warnings.push("No executable Stargate tokens were found for the selected filters.");
    }
    if (routeCandidates.length >= args.maxRoutes) {
      warnings.push(`Stargate route candidates were truncated at maxRoutes=${args.maxRoutes}.`);
    }

    return {
      provider: this.id,
      chains,
      tokens,
      routeCandidates,
      warnings,
    };
  }


  async assessRouteSupport(args: BridgeAssetArgs): Promise<StargateRouteSupportAssessment> {
    const normalized: NormalizedBridgeInput = normalizeArgs(args);

    const cacheKey = buildAssessmentCacheKey(normalized);
    const cached = this.supportAssessmentCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const assessmentPromise = (async () => {
      try {
        const unifiedAssessment = await assessUnifiedRouteSupport(normalized, args.routeStrategy);
        if (unifiedAssessment) {
          return unifiedAssessment;
        }

        let fallbackFamily: string | null = null;
        let fallbackExecutionMode: string | null = null;
        let fallbackExecutionTarget: string | null = null;
        const sourceTokenAddress = normalized.srcTokenAddress ?? resolveV1SourceTokenAddress(normalized);
        if (sourceTokenAddress) {
          const fallbackMatch = await StargateCrossChainMatcher.match({
            fromChain: normalized.fromChain,
            toChain: normalized.toChain,
            tokenAddress: sourceTokenAddress,
            recipient: normalized.recipient,
            amount: BigInt(normalized.amount),
            slippageBps: normalized.slippageBps,
            routeStrategy: args.routeStrategy ?? "auto",
          }).catch(() => null);

          if (fallbackMatch) {
            fallbackFamily = fallbackMatch.mechanism ?? null;
            fallbackExecutionMode = fallbackMatch.executionMode ?? null;
            fallbackExecutionTarget =
              fallbackMatch.executionHints?.executionTarget != null
                ? String(fallbackMatch.executionHints.executionTarget)
                : null;
          }
        }

        return {
          status: "known_not_executable" as const,
          reason: `No executable Stargate V1 or V2 route found for ${normalized.token} ${normalized.fromChain}->${normalized.toChain}.`,
          details: {
            fromChain: normalized.fromChain,
            toChain: normalized.toChain,
            token: normalized.token,
            requestedStrategy: args.routeStrategy ?? "auto",
            ...(sourceTokenAddress ? { sourceTokenAddress } : {}),
            ...(fallbackFamily ? { detectedFamily: fallbackFamily } : {}),
            ...(fallbackExecutionMode ? { detectedExecutionMode: fallbackExecutionMode } : {}),
            ...(fallbackExecutionTarget ? { detectedExecutionTarget: fallbackExecutionTarget } : {}),
          },
        };
      } catch (error) {
        return {
          status: "unsupported" as const,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    })();

    this.supportAssessmentCache.set(cacheKey, assessmentPromise);
    return assessmentPromise;
  }

  async match(args: BridgeAssetArgs): Promise<BridgeAssetArgs | null> {
    const assessment = await this.assessRouteSupport(args);
    return assessment.status === "supported" ? assessment.matchedArgs : null;
  }

  async simulate(args: BridgeAssetArgs): Promise<BridgeSimulationResult> {
    const assessment = await this.assessRouteSupport(args);
    if (assessment.status !== "supported") {
      throw new Error(assessment.reason);
    }
    const plan = await buildPlan(assessment, assessment.matchedArgs);
    return {
      simulated: true,
      canExecute: true,
      dryRun: true,
      plan,
    };
  }

  async execute(args: BridgeAssetArgs): Promise<BridgeExecutionResult> {
    const assessment = await this.assessRouteSupport(args);
    if (assessment.status !== "supported") {
      throw new Error(assessment.reason);
    }
    const plan = await buildPlan(assessment, assessment.matchedArgs);
    const dryRun = Boolean(args.dryRun ?? true);

    if (dryRun) {
      return {
        simulated: true,
        executed: false,
        dryRun: true,
        plan,
        txHashes: [],
      };
    }

    const txHashes: string[] = [];
    const steps: BridgeExecutionStep[] = plan.steps as BridgeExecutionStep[];
    for (const step of steps) {
      if (step.tool === "write_contract") {
        const writeResult = await writeContractTool.tool.handler(
          {
            ...step.args,
            dryRun: false,
          },
          {} as any
        );

        const success = Boolean((writeResult as any)?.success === true);
        const hash = (writeResult as any)?.hash as string | null;
        if (!success || !hash) {
          const message = (writeResult as any)?.message ?? "Unknown write_contract execution error";
          throw new Error(`Bridge step '${step.type}' failed: ${message}`);
        }

        txHashes.push(hash);
        continue;
      }

      if (step.tool === "send_transaction") {
        const walletClient = createViemWalletClient(step.args.chain);
        const hash = await walletClient.sendTransaction({
          chain: walletClient.chain,
          to: step.args.to,
          data: step.args.data ?? undefined,
          value: step.args.value ? BigInt(step.args.value) : undefined,
        });

        txHashes.push(hash);
        continue;
      }

      throw new Error(`Stargate provider does not support executing step tool '${step.tool}'.`);
    }

    return {
      simulated: false,
      executed: true,
      dryRun,
      plan,
      txHashes,
    };
  }
}
    