import type { Abi, Address } from "viem";
import { getAddress, zeroAddress } from "viem";

import {
  BridgeAssetArgs,
  BridgeCapabilityDiscoveryArgs,
  BridgeExecutionPlan,
  BridgeExecutionResult,
  BridgePlanStep,
  BridgeProviderCapabilities,
  BridgeSimulationResult,
} from "../../core/BridgeTypes";
import { BridgeProvider } from "../../core/providers/BridgeProvider";
import { ChainKey } from "../../../../clients/viem/viem-types";
import { TokenIdentityResolver } from "../../identity/TokenIdentityResolver";
import { resolveChainKey } from "../../../../clients/viem/viemChains";
import { getHopRouteConfig, hasHopSupport, listHopRoutes } from "./hopRegistry";
import { viemChains } from "../../../../clients/viem/viemChains";
import { createViemWalletClient } from "../../../../clients/viem/createViemWalletClient";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";
import { getTokenAllowance } from "../../../../tools/general/allowances/manageAllowances";
import { writeContractTool } from "../../../../tools/general/contracts/writeContract/writeContractTool";
import { ERC20_ABI } from "../../../../utils/const/ERC20_ABI";

const HOP_BRIDGE_ABI = [
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "sendToL2",
    inputs: [
      { name: "chainId", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "relayer", type: "address" },
      { name: "relayerFee", type: "uint256" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

const DEFAULT_SLIPPAGE_BPS = 100;
const MAX_SLIPPAGE_BPS = 5000;

function normalizeAmount(value: string): string {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized) || BigInt(normalized) <= 0n) {
    throw new Error("amount must be a positive integer string.");
  }
  return normalized;
}

function normalizeSlippageBps(value: number | undefined): number {
  const normalized = Number.isFinite(Number(value)) ? Number(value) : DEFAULT_SLIPPAGE_BPS;
  if (!Number.isInteger(normalized) || normalized <= 0 || normalized > MAX_SLIPPAGE_BPS) {
    throw new Error(`slippageBps must be an integer between 1 and ${MAX_SLIPPAGE_BPS}.`);
  }
  return normalized;
}

function normalizeAddress(value: string, fieldName: string): Address {
  const trimmed = String(value || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`Invalid ${fieldName} address '${value}'. Expected 0x-prefixed 20-byte hex address.`);
  }
  return getAddress(trimmed) as Address;
}

function buildMinAmount(amount: bigint, slippageBps: number): bigint {
  const base = 10_000n;
  return (amount * (base - BigInt(slippageBps))) / base;
}

interface NormalizedBridgeInput {
  fromChain: ChainKey;
  toChain: ChainKey;
  token: string;
  amount: string;
  recipient: Address;
  slippageBps: number;
  dryRun: boolean;
  srcTokenAddress?: Address;
  dstTokenAddress?: Address;
}

function normalizeOptionalAddress(value?: string): Address | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return undefined;
  }

  return normalizeAddress(trimmed, "token");
}

function resolveTokenAddressHint(chain: ChainKey, tokenSymbol: string): Address | null {
  return TokenIdentityResolver.resolveAddressHint(chain, tokenSymbol);
}

function symbolsMatchWithIdentityHint(chain: ChainKey, requested: string, routeSymbol: string): boolean {
  const requestedIdentity = TokenIdentityResolver.resolveIdentity({ chain, symbol: requested });
  const routeIdentity = TokenIdentityResolver.resolveIdentity({ chain, symbol: routeSymbol });

  return requestedIdentity.canonicalId === routeIdentity.canonicalId;
}

function normalizeArgs(args: BridgeAssetArgs): NormalizedBridgeInput {
  const fromChain = resolveChainKey(String(args.fromChain || "").trim() as ChainKey);
  const toChain = resolveChainKey(String(args.toChain || "").trim() as ChainKey);
  if (!fromChain || !toChain) {
    throw new Error("fromChain and toChain are required.");
  }
  if (fromChain === toChain) {
    throw new Error("fromChain and toChain must be different for a bridge transfer.");
  }

  const requestedToken = String(args.token || "").trim().toUpperCase();
  if (!requestedToken) {
    throw new Error("token is required.");
  }

  const token = TokenIdentityResolver.normalizeSymbol(requestedToken);
  const srcTokenAddress = normalizeOptionalAddress(args.srcTokenAddress);
  const dstTokenAddress = normalizeOptionalAddress(args.dstTokenAddress);

  return {
    fromChain,
    toChain,
    token,
    amount: normalizeAmount(args.amount),
    recipient: normalizeAddress(String(args.recipient), "recipient"),
    slippageBps: normalizeSlippageBps(args.slippageBps),
    dryRun: Boolean(args.dryRun),
    ...(srcTokenAddress ? { srcTokenAddress } : {}),
    ...(dstTokenAddress ? { dstTokenAddress } : {}),
  };
}

export class HopProvider implements BridgeProvider {
  readonly id = "hop";

  async discoverCapabilities(args: BridgeCapabilityDiscoveryArgs): Promise<BridgeProviderCapabilities> {
    const fromChainsFilter = new Set(
      (args.fromChains ?? []).map((value: string) => String(value || "").trim().toLowerCase()).filter(Boolean)
    );
    const toChainsFilter = new Set(
      (args.toChains ?? []).map((value: string) => String(value || "").trim().toLowerCase()).filter(Boolean)
    );
    const symbolsFilter = (args.symbols ?? [])
      .map((value: string) => String(value || "").trim())
      .filter(Boolean);
    const warnings: string[] = [];
    const chainMap = new Map<string, BridgeProviderCapabilities["chains"][number]>();
    const tokenMap = new Map<string, BridgeProviderCapabilities["tokens"][number]>();
    const routeCandidates: BridgeProviderCapabilities["routeCandidates"] = [];

    for (const route of listHopRoutes()) {
      const normalizedFromChain = String(route.fromChain).toLowerCase();
      const normalizedToChain = String(route.toChain).toLowerCase();
      const normalizedSymbol = String(route.token).toUpperCase();
      const routeMatchesSymbolFilter =
        symbolsFilter.length === 0 ||
        symbolsFilter.some((filterSymbol: string) =>
          symbolsMatchWithIdentityHint(route.fromChain, filterSymbol, normalizedSymbol)
        );

      if (fromChainsFilter.size > 0 && !fromChainsFilter.has(normalizedFromChain)) {
        continue;
      }
      if (toChainsFilter.size > 0 && !toChainsFilter.has(normalizedToChain)) {
        continue;
      }
      if (!routeMatchesSymbolFilter) {
        continue;
      }

      const fromChainConfig = viemChains[route.fromChain];
      const toChainConfig = viemChains[route.toChain];
      if (args.includeOnlyViemChains && (!fromChainConfig || !toChainConfig)) {
        continue;
      }

      const sourceTokenAddress = resolveTokenAddressHint(route.fromChain, route.token);
      const destinationTokenAddress = resolveTokenAddressHint(route.toChain, route.token);
      if (!sourceTokenAddress || !destinationTokenAddress) {
        warnings.push(
          `Skipping Hop route ${route.token} ${route.fromChain}->${route.toChain}: no token identity address hints available.`
        );
        continue;
      }

      const canonicalIdentity = TokenIdentityResolver.resolveIdentity({
        chain: route.fromChain,
        address: sourceTokenAddress,
        symbol: route.token,
      });

      const fromChainKey = String(route.fromChain);
      if (!chainMap.has(fromChainKey)) {
        chainMap.set(fromChainKey, {
          chainKey: fromChainKey,
          chainType: "EVM",
          chainId: fromChainConfig?.id ?? null,
          name: fromChainConfig?.name ?? null,
          shortName: (fromChainConfig as { shortName?: string } | undefined)?.shortName ?? null,
          nativeSymbol: fromChainConfig?.nativeCurrency.symbol ?? null,
          nativeDecimals: fromChainConfig?.nativeCurrency.decimals ?? null,
          isViemSupported: Boolean(fromChainConfig),
          metadata: {},
        });
      }

      const toChainKey = String(route.toChain);
      if (!chainMap.has(toChainKey)) {
        chainMap.set(toChainKey, {
          chainKey: toChainKey,
          chainType: "EVM",
          chainId: toChainConfig?.id ?? null,
          name: toChainConfig?.name ?? null,
          shortName: (toChainConfig as { shortName?: string } | undefined)?.shortName ?? null,
          nativeSymbol: toChainConfig?.nativeCurrency.symbol ?? null,
          nativeDecimals: toChainConfig?.nativeCurrency.decimals ?? null,
          isViemSupported: Boolean(toChainConfig),
          metadata: {},
        });
      }

      const sourceTokenKey = `${fromChainKey}:${String(sourceTokenAddress).toLowerCase()}`;
      if (!tokenMap.has(sourceTokenKey)) {
        tokenMap.set(sourceTokenKey, {
          chainKey: fromChainKey,
          address: sourceTokenAddress,
          symbol: canonicalIdentity.symbol ?? route.token,
          name: canonicalIdentity.name,
          decimals: canonicalIdentity.decimals,
          isSupported: true,
          isViemSupported: Boolean(fromChainConfig),
          priceUsd: null,
          canonicalId: canonicalIdentity.canonicalId,
          canonicalSource: canonicalIdentity.canonicalSource,
          metadata: {},
        });
      }

      const destinationTokenKey = `${toChainKey}:${String(destinationTokenAddress).toLowerCase()}`;
      if (!tokenMap.has(destinationTokenKey)) {
        tokenMap.set(destinationTokenKey, {
          chainKey: toChainKey,
          address: destinationTokenAddress,
          symbol: canonicalIdentity.symbol ?? route.token,
          name: canonicalIdentity.name,
          decimals: canonicalIdentity.decimals,
          isSupported: true,
          isViemSupported: Boolean(toChainConfig),
          priceUsd: null,
          canonicalId: canonicalIdentity.canonicalId,
          canonicalSource: canonicalIdentity.canonicalSource,
          metadata: {},
        });
      }

      routeCandidates.push({
        provider: this.id,
        fromChain: fromChainKey,
        toChain: toChainKey,
        canonicalId: canonicalIdentity.canonicalId,
        symbol: canonicalIdentity.symbol ?? route.token,
        name: canonicalIdentity.name,
        fromTokenAddress: sourceTokenAddress,
        toTokenAddress: destinationTokenAddress,
        fromChainViemSupported: Boolean(fromChainConfig),
        toChainViemSupported: Boolean(toChainConfig),
        metadata: {
          bridgeAddress: route.bridgeAddress,
          destinationChainId: route.destinationChainId,
        },
      });
    }

    if (routeCandidates.length === 0) {
      warnings.push("No Hop routes matched the selected filters.");
    }

    return {
      provider: this.id,
      chains: [...chainMap.values()],
      tokens: [...tokenMap.values()],
      routeCandidates,
      warnings,
    };
  }

  async match(args: BridgeAssetArgs): Promise<BridgeAssetArgs | null> {
    try {
      const normalized = normalizeArgs(args);
      const supported = hasHopSupport(normalized.fromChain, normalized.toChain, normalized.token);

      if (!supported) {
        return null;
      }

      const srcTokenAddress = normalized.srcTokenAddress ?? resolveTokenAddressHint(normalized.fromChain, normalized.token);
      const dstTokenAddress = normalized.dstTokenAddress ?? resolveTokenAddressHint(normalized.toChain, normalized.token);
      if (!srcTokenAddress || !dstTokenAddress) {
        return null;
      }

      return {
        ...args,
        fromChain: normalized.fromChain,
        toChain: normalized.toChain,
        token: normalized.token,
        amount: normalized.amount,
        recipient: normalized.recipient,
        slippageBps: normalized.slippageBps,
        dryRun: normalized.dryRun,
        srcTokenAddress,
        dstTokenAddress,
      };
    } catch {
      return null;
    }
  }

  async simulate(args: BridgeAssetArgs): Promise<BridgeSimulationResult> {
    const plan = await this.buildPlan(args);
    return {
      simulated: true,
      canExecute: true,
      dryRun: true,
      plan,
    };
  }

  async execute(args: BridgeAssetArgs): Promise<BridgeExecutionResult> {
    const plan = await this.buildPlan(args);
    const dryRun = Boolean(args.dryRun ?? true);

    if (dryRun) {
      return {
        simulated: true,
        executed: false,
        dryRun,
        plan,
        txHashes: [],
      };
    }

    const txHashes: string[] = [];
    for (const step of plan.steps) {
      if (step.tool !== "write_contract") {
        throw new Error(`Hop provider does not support executing step tool '${step.tool}'.`);
      }

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
    }

    return {
      simulated: false,
      executed: true,
      dryRun,
      plan,
      txHashes,
    };
  }

  private async buildPlan(args: BridgeAssetArgs): Promise<BridgeExecutionPlan> {
    const matchedArgs = await this.match(args);
    if (!matchedArgs) {
      throw new Error("Hop provider does not support this route/token.");
    }

    const normalized = normalizeArgs(matchedArgs);
    const walletClient = createViemWalletClient(normalized.fromChain);
    const senderAddress = walletClient.account.address;
    const publicClient = getViemPublicClient(normalized.fromChain);

    const srcTokenAddress = matchedArgs.srcTokenAddress;
    if (!srcTokenAddress) {
      throw new Error("Hop provider requires a source token address after route matching.");
    }

    const routeConfig = getHopRouteConfig(normalized.fromChain, normalized.toChain, normalized.token);
    const amount = BigInt(normalized.amount);
    const minAmount = buildMinAmount(amount, normalized.slippageBps);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
    const relayer = zeroAddress;
    const relayerFee = 0n;

    const allowance = await getTokenAllowance({
      chain: normalized.fromChain,
      tokenAddress: srcTokenAddress,
      ownerAddress: senderAddress,
      spenderAddress: routeConfig.bridgeAddress,
      action: "read",
    });

    const approvalRequired = allowance < amount;
    const approvalStep: BridgePlanStep | null = approvalRequired
      ? {
          type: "approval",
          tool: "write_contract",
          args: {
            chain: normalized.fromChain,
            address: srcTokenAddress,
            abi: ERC20_ABI as readonly unknown[],
            functionName: "approve",
            args: [routeConfig.bridgeAddress, amount],
            value: null,
          },
        }
      : null;

    const bridgeArgs: [bigint, `0x${string}`, bigint, bigint, bigint, `0x${string}`, bigint] = [
      BigInt(routeConfig.destinationChainId),
      normalized.recipient,
      amount,
      minAmount,
      deadline,
      relayer,
      relayerFee,
    ];

    await publicClient.simulateContract({
      account: senderAddress,
      address: routeConfig.bridgeAddress,
      abi: HOP_BRIDGE_ABI,
      functionName: "sendToL2",
      args: bridgeArgs,
    });

    const bridgeStep: BridgePlanStep = {
      type: "bridge",
      tool: "write_contract",
      args: {
        chain: normalized.fromChain,
        address: routeConfig.bridgeAddress,
        abi: HOP_BRIDGE_ABI,
        functionName: "sendToL2",
        args: bridgeArgs,
        value: null,
      },
    };

    const steps = approvalStep ? [approvalStep, bridgeStep] : [bridgeStep];

    return {
      provider: this.id,
      fromChain: normalized.fromChain,
      toChain: normalized.toChain,
      token: normalized.token,
      amount: normalized.amount,
      recipient: normalized.recipient,
      slippageBps: normalized.slippageBps,
      fee: {
        quotedNativeFee: "0",
        bufferedNativeFee: "0",
        bufferBps: 0,
      },
      approval: {
        required: approvalRequired,
        token: srcTokenAddress,
        spender: routeConfig.bridgeAddress,
        amount,
      },
      steps,
      metadata: {
        senderAddress,
        srcTokenAddress,
        dstTokenAddress: matchedArgs.dstTokenAddress,
        destinationChainId: routeConfig.destinationChainId,
        bridgeAddress: routeConfig.bridgeAddress,
        protocolFunction: "sendToL2",
      },
    };
  }
}
