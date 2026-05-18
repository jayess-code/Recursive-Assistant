import { Address, getAddress, zeroAddress, PublicClient } from "viem";
import { StargateIntrospector } from "./runtime/StargateIntrospector";
import { getStargateV1RouterForChain } from "./discovery/stargateRouters";
import { resolveChainKey } from "../../../../clients/viem/viemChains";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";

/* ---------------------------------- TYPES --------------------------------- */

export interface PoolInfo {
  poolId: number;
  token: Address;
  decimals: number;
}

export interface PoolGraph {
  chain: string;
  resolvedChain: string;

  router: Address;
  factory: Address;

  pools: PoolInfo[];

  tokenToPoolId: Record<string, number>;
  poolIdToToken: Record<number, Address>;
}

export type PoolGraphBuildStatus = "unsupported" | "no-router" | "v2-only" | "success";

export interface PoolGraphBuildResult {
  status: PoolGraphBuildStatus;
  graph?: PoolGraph;
  reason?: string;
  router?: Address;
  factory?: Address;
}

export interface StargatePoolGraphBuilderOptions {
  verbose?: boolean;
  logger?: (message: string) => void;
}

/* ---------------------------------- ABIs ---------------------------------- */

const FACTORY_ABI = [
  {
    name: "allPoolsLength",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const POOL_ABI = [
  {
    name: "token",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

/* -------------------------------- BUILDER --------------------------------- */

export class StargatePoolGraphBuilder {
  private static cache = new Map<string, PoolGraphBuildResult>();

  /**
   * Build full pool graph for a chain using ONLY on-chain data
   */
  static async build(
    chain: string,
    options: StargatePoolGraphBuilderOptions = {}
  ): Promise<PoolGraphBuildResult> {
    const resolvedChain = resolveChainKey(chain);
    const cached = this.cache.get(resolvedChain);
    if (cached) {
      this.log(options, `[${chain}] using cached pool graph result (${cached.status}).`);
      return cached;
    }

    const v1Router = getStargateV1RouterForChain(resolvedChain);
    if (!v1Router) {
      const result: PoolGraphBuildResult = {
        status: "no-router",
        reason: `No configured Stargate V1 router found on ${resolvedChain}.`,
      };
      this.cache.set(resolvedChain, result);
      return result;
    }

    const introspection = await StargateIntrospector.probeChain(chain, {
      ...options,
      routerOverride: v1Router,
    });

    if (!introspection) {
      const result: PoolGraphBuildResult = {
        status: "no-router",
        reason: `No valid Stargate router found on ${chain}.`,
      };
      this.cache.set(resolvedChain, result);
      return result;
    }

    if (introspection.type !== "stargate_v1") {
      const result: PoolGraphBuildResult = {
        status: "v2-only",
        reason: `Router ${introspection.router} is ${introspection.type} and does not expose a V1 pool graph.`,
        router: introspection.router,
      };
      this.cache.set(resolvedChain, result);
      return result;
    }

    const client = getViemPublicClient(resolvedChain);

    if (!introspection.factory) {
      const result: PoolGraphBuildResult = {
        status: "unsupported",
        reason: `Router ${introspection.router} did not expose a factory address for V1 graph construction.`,
        router: introspection.router,
      };
      this.cache.set(resolvedChain, result);
      return result;
    }

    const factory = introspection.factory;
    const router = introspection.router;

    const poolCount = await this.getPoolCount(client, factory);
    this.log(options, `[${chain}] building V1 pool graph from router ${router} and factory ${factory} (${poolCount} pools).`);

    const pools: PoolInfo[] = [];
    const tokenToPoolId: Record<string, number> = {};
    const poolIdToToken: Record<number, Address> = {};

    for (let poolId = 0; poolId < poolCount; poolId++) {
      try {
        const poolAddress = await this.getPoolAddress(client, factory, poolId);

        if (!poolAddress || poolAddress === zeroAddress) {
          this.log(options, `[${chain}] poolId=${poolId} is empty or deprecated.`);
          continue;
        }

        const token = await this.getPoolToken(client, poolAddress);
        const decimals = await this.getPoolDecimals(client, poolAddress);

        const normalizedToken = getAddress(token);

        pools.push({
          poolId,
          token: normalizedToken,
          decimals,
        });

        this.log(
          options,
          `[${chain}] poolId=${poolId} pool=${poolAddress} token=${normalizedToken} decimals=${decimals}`
        );

        if (tokenToPoolId[normalizedToken] !== undefined) {
          this.log(
            options,
            `[${chain}] duplicate token detected ${normalizedToken} already mapped to poolId=${tokenToPoolId[normalizedToken]}, new poolId=${poolId}`
          );
        }

        tokenToPoolId[normalizedToken] = poolId;
        poolIdToToken[poolId] = normalizedToken;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(options, `[${chain}] poolId=${poolId} graph probe failed: ${message}`);
        continue;
      }
    }

    const graph: PoolGraph = {
      chain,
      resolvedChain,

      router,
      factory,

      pools,
      tokenToPoolId,
      poolIdToToken,
    };

    const result: PoolGraphBuildResult = {
      status: "success",
      graph,
      router,
      factory,
    };

    this.cache.set(resolvedChain, result);
    return result;
  }

  private static log(options: StargatePoolGraphBuilderOptions, message: string): void {
    if (!options.verbose) {
      return;
    }

    (options.logger ?? console.log)(message);
  }

  /* ----------------------------- FACTORY CALLS ---------------------------- */

  private static async getPoolCount(client: PublicClient, factory: Address): Promise<number> {
    const result = await client.readContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: "allPoolsLength",
    });

    return Number(result);
  }

  private static async getPoolAddress(
    client: PublicClient,
    factory: Address,
    poolId: number
  ): Promise<Address> {
    const result = await client.readContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: "getPool",
      args: [BigInt(poolId)],
    });

    return getAddress(String(result));
  }

  /* ------------------------------ POOL CALLS ------------------------------ */

  private static async getPoolToken(client: PublicClient, pool: Address): Promise<Address> {
    const token = await client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "token",
    });

    return getAddress(String(token));
  }

  private static async getPoolDecimals(client: PublicClient, pool: Address): Promise<number> {
    const decimals = await client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "decimals",
    });

    return Number(decimals);
  }
}
