import { Address, getAddress, zeroAddress, PublicClient } from "viem";
import { getStargateRouterForChain, listStargateRouterChains } from "../discovery/stargateRouters";
import { resolveChainKey, viemChains } from "../../../../../clients/viem/viemChains";
import { getViemPublicClient } from "../../../../../clients/viem/getViemPublicClient";


/* ---------------------------------- TYPES --------------------------------- */

export type RouterType = "stargate_v1" | "stargate_v2";

export interface RouterCandidateResult {
  chain: string;
  resolvedChain: string;
  chainName: string;

  router: Address;
  type: RouterType;

  factory?: Address;
  poolCount?: number;

  executionConfidence: "high" | "medium" | "low";
}

export interface StargateIntrospectionOptions {
  verbose?: boolean;
  logger?: (message: string) => void;
  routerOverride?: Address;
}

/* --------------------------------- ABIS ---------------------------------- */

const ROUTER_V1_ABI = [
  {
    name: "factory",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const FACTORY_ABI = [
  {
    name: "allPoolsLength",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ROUTER_V2_ABI = [
  {
    name: "quoteSend",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "_sendParam",
        type: "tuple",
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
      },
      { name: "_payInLzToken", type: "bool" },
    ],
    outputs: [
      {
        name: "fee",
        type: "tuple",
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/* -------------------------------- CORE API -------------------------------- */

export class StargateIntrospector {
    /**
     * Probe a specific address (token or router) for Stargate V2 compatibility.
     * Returns true if the address supports quoteSend (V2 interface).
     */
    static async probeAddressForV2(
      client: PublicClient,
      address: Address,
      options: StargateIntrospectionOptions = {}
    ): Promise<boolean> {
      const quoteSendProbeArgs = [
        {
          dstEid: 1,
          to: `0x${"00".repeat(32)}` as `0x${string}`,
          amountLD: 1n,
          minAmountLD: 0n,
          extraOptions: "0x" as `0x${string}`,
          composeMsg: "0x" as `0x${string}`,
          oftCmd: "0x" as `0x${string}`,
        },
        false,
      ] as const;
      try {
        await client.readContract({
          address,
          abi: ROUTER_V2_ABI,
          functionName: "quoteSend",
          args: quoteSendProbeArgs,
        });
        return true;
      } catch (error) {
        if (this.isFunctionMissing(error)) {
          this.logFailure(options, address, address, "V2 probe (function missing)", error);
          return false;
        }
        // If reverted but function present, still consider as V2
        this.logFailure(options, address, address, "V2 probe (reverted but function present)", error);
        return true;
      }
    }
  private static getExecutionConfidence(
    type: RouterType,
    context: { poolCount?: number }
  ): "high" | "medium" | "low" {
    if (type === "stargate_v1" && (context.poolCount ?? 0) > 0) {
      return "high";
    }

    if (type === "stargate_v2") {
      return "medium";
    }

    return "low";
  }

  static async listSupportedChains(): Promise<string[]> {
    return [...(await listStargateRouterChains())];
  }

  static async getRouterForChain(chain: string): Promise<Address | null> {
    return getStargateRouterForChain(chain);
  }

  static async discoverAll(chains: string[], options: StargateIntrospectionOptions = {}) {
    const results: RouterCandidateResult[] = [];

    for (const chain of chains) {
      const result = await this.probeChain(chain, options);
      if (result) results.push(result);
    }

    return results;
  }

  static async probeChain(
    chain: string,
    options: StargateIntrospectionOptions = {}
  ): Promise<RouterCandidateResult | null> {
    const resolvedChain = resolveChainKey(chain);
    const chainConfig = viemChains[resolvedChain];

    if (!chainConfig) {
      this.log(options, `Skipping ${chain}: chain is not available in viemChains.`);
      return null;
    }

    const router = options.routerOverride ?? (await this.getRouterForChain(resolvedChain));
    if (!router) {
      this.log(options, `Skipping ${chain}: no configured Stargate router for resolved chain ${resolvedChain}.`);
      return null;
    }

    const client = getViemPublicClient(resolvedChain);
    const code = await client.getCode({ address: router });
    if (!code || code === "0x") {
      this.log(options, `[${chain}] ${router} has no bytecode.`);
      return null;
    }

    const detected = await this.detectRouter(client, router, chain, options);
    if (!detected) {
      return null;
    }

    if (detected.type === "stargate_v1" && (!detected.factory || (detected.poolCount ?? 0) <= 0)) {
      this.log(options, `[${chain}] ${router} failed V1 ownership checks (factory/poolCount).`);
      return null;
    }

    return {
      chain,
      resolvedChain,
      chainName: chainConfig.name,

      router,
      type: detected.type,

      ...(detected.factory ? { factory: detected.factory } : {}),
      ...(detected.poolCount != null ? { poolCount: detected.poolCount } : {}),

      executionConfidence: this.getExecutionConfidence(detected.type, {
        ...(detected.poolCount != null ? { poolCount: detected.poolCount } : {}),
      }),
    };
  }

  private static async detectRouter(
    client: PublicClient,
    router: Address,
    chain: string,
    options: StargateIntrospectionOptions
  ): Promise<{
    type: RouterType;
    factory?: Address;
    poolCount?: number;
  } | null> {
    try {
      const factory = await client.readContract({
        address: router,
        abi: ROUTER_V1_ABI,
        functionName: "factory",
      });

      if (factory && factory !== zeroAddress) {
        const poolCount = await client.readContract({
          address: factory,
          abi: FACTORY_ABI,
          functionName: "allPoolsLength",
        });

        const count = Number(poolCount);

        if (count > 0) {
          return {
            type: "stargate_v1",
            factory: getAddress(String(factory)),
            poolCount: count,
          };
        }

        this.log(
          options,
          `[${chain}] ${router} factory ${String(factory)} returned pool count ${String(poolCount)}.`
        );
      } else {
        this.log(options, `[${chain}] ${router} returned the zero factory address.`);
      }
    } catch (error) {
      this.logFailure(options, chain, router, "V1 probe", error);
    }

    const quoteSendProbeArgs = [
      {
        dstEid: 1,
        to: `0x${"00".repeat(32)}` as `0x${string}`,
        amountLD: 1n,
        minAmountLD: 0n,
        extraOptions: "0x" as `0x${string}`,
        composeMsg: "0x" as `0x${string}`,
        oftCmd: "0x" as `0x${string}`,
      },
      false,
    ] as const;

    try {
      await client.readContract({
        address: router,
        abi: ROUTER_V2_ABI,
        functionName: "quoteSend",
        args: quoteSendProbeArgs,
      });

      return {
        type: "stargate_v2",
      };
    } catch (error) {
      if (this.isFunctionMissing(error)) {
        this.logFailure(options, chain, router, "V2 probe (function missing)", error);
        return null;
      }

      this.logFailure(options, chain, router, "V2 probe (reverted but function present)", error);
      return {
        type: "stargate_v2",
      };
    }
  }

  private static isFunctionMissing(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
      message.includes("function selector was not recognized") ||
      message.includes("function does not exist") ||
      message.includes("method not found") ||
      message.includes("unknown function") ||
      message.includes("no matching function")
    );
  }

  private static log(options: StargateIntrospectionOptions, message: string): void {
    if (!options.verbose) {
      return;
    }

    (options.logger ?? console.log)(message);
  }

  private static logFailure(
    options: StargateIntrospectionOptions,
    chain: string,
    router: Address,
    phase: string,
    error: unknown
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.log(options, `[${chain}] ${router} ${phase} failed: ${message}`);
  }
}
