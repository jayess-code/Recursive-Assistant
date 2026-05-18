import { Address, PublicClient, getAddress } from "viem";
import { StargateBridgeExecutionMode } from "../../../core/BridgeTypes";
import { buildStargateTaxiExtraOptions } from "../stargatev2/utils/encoding";
import { oftCapabilityCheck } from "../stargatev2/resolver/validators/oftCapabilityCheck";
import { getStargateRouterForChain } from "../discovery/stargateRouters";
import { resolveStargateOftRoutingHint } from "../discovery/stargateOftRegistry";
import { resolveChainKey } from "../../../../../clients/viem/viemChains";
import { getViemPublicClient } from "../../../../../clients/viem/getViemPublicClient";

export type CapabilitySignal = boolean | "unknown";
export type ExecutionValidity = boolean | "unknown";
export type CapabilityConfidence = "high" | "medium" | "low";
export type CapabilityIdentitySource = "registry" | "probe" | "heuristic" | "none";

export interface ContractCapabilities {
  role: StargateContractRole;
  executionMode: StargateBridgeExecutionMode;
  executionModeConfidence: CapabilityConfidence;
  isRouterV1: boolean;
  isOFTV2: boolean;

  supportsQuoteSend: CapabilitySignal;
  supportsSend: CapabilitySignal;
  supportsFactory: boolean;
  lastQuoteError?: string;

  registryMatch: {
    router: boolean;
    adapter: boolean;
    asset0: boolean;
  };
  identitySource: CapabilityIdentitySource;
  executionValid: ExecutionValidity;
  confidence: CapabilityConfidence;
}

export type StargateContractRole = "router_v1" | "oft_v2" | "erc20" | "unknown";

const FACTORY_ABI = [
  {
    name: "factory",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const QUOTESEND_ABI = [
  {
    name: "quoteSend",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
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
      { name: "payInLzToken", type: "bool" },
    ],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

function buildProbeParams(dstEid: number): {
  dstEid: number;
  to: `0x${string}`;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: `0x${string}`;
  composeMsg: `0x${string}`;
  oftCmd: `0x${string}`;
} {
  return {
    dstEid,
    to: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    amountLD: 1n,
    minAmountLD: 0n,
    extraOptions: buildStargateTaxiExtraOptions(200000n),
    composeMsg: "0x",
    oftCmd: "0x",
  };
}

function isFunctionMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("function does not exist") ||
    message.includes("function selector was not recognized") ||
    message.includes("returned no data") ||
    message.includes("the contract function \"quotesend\" returned no data") ||
    message.includes("the contract function \"factory\" returned no data")
  );
}

async function getRegistryMatches(chain: string, address: Address): Promise<{
  router: boolean;
  adapter: boolean;
  asset0: boolean;
}> {
  const addr = address.toLowerCase();
  const knownRouter = await getStargateRouterForChain(chain);
  const routingHint = await resolveStargateOftRoutingHint(chain, address);

  return {
    router: knownRouter?.toLowerCase() === addr,
    adapter: routingHint?.executionSurface === "adapter",
    asset0: routingHint?.executionSurface === "asset0",
  };
}

async function probeFactorySupport(client: PublicClient, address: Address): Promise<boolean> {
  try {
    await client.readContract({
      address,
      abi: FACTORY_ABI,
      functionName: "factory",
    });

    return true;
  } catch {
    return false;
  }
}

async function probeQuoteSendSupport(
  client: PublicClient,
  address: Address,
  dstEid: number
): Promise<{
  support: CapabilitySignal;
  reason?: string;
}> {
  try {
    await client.readContract({
      address,
      abi: QUOTESEND_ABI,
      functionName: "quoteSend",
      args: [buildProbeParams(dstEid), false],
    });

    return {
      support: true,
    };
  } catch (error) {
    return {
      support: isFunctionMissing(error) ? false : "unknown",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function classifyStargateContract({
  chain,
  address,
}: {
  chain: string;
  address: Address;
}): Promise<StargateContractRole> {
  const capabilities = await probeContractCapabilities({ chain, address });
  return capabilities.role;
}

export async function probeContractCapabilities(params: {
  chain: string;
  address: Address;
  dstEid?: number;
}): Promise<ContractCapabilities> {
  const resolvedChain = resolveChainKey(params.chain);
  const client = getViemPublicClient(resolvedChain);
  const addr = getAddress(params.address);

  const registryMatch = await getRegistryMatches(resolvedChain, addr);
  const supportsFactory = await probeFactorySupport(client, addr);
  const quoteProbe = await probeQuoteSendSupport(client, addr, params.dstEid ?? 1);
  const supportsQuoteSend = quoteProbe.support;
  const supportsSend: CapabilitySignal = supportsQuoteSend === true ? true : supportsQuoteSend;

  const isRouterV1 = supportsFactory;
  let executionMode: StargateBridgeExecutionMode = "unknown";
  let executionModeConfidence: CapabilityConfidence = "low";
  let executionValid: ExecutionValidity = "unknown";
  let lastQuoteError = quoteProbe.reason;

  if (isRouterV1) {
    executionMode = "v1_pool";
    executionModeConfidence = "high";
    executionValid = true;
  } else if (!registryMatch.asset0 && supportsQuoteSend !== false) {
    const oftProbe = await oftCapabilityCheck(client, addr, buildProbeParams(params.dstEid ?? 1));

    if (oftProbe.supported) {
      executionMode = "v2_oft";
      executionModeConfidence = supportsQuoteSend === true ? "high" : "medium";
      executionValid = supportsQuoteSend === true ? true : "unknown";
      lastQuoteError = undefined;
    } else if (supportsQuoteSend === true) {
      executionMode = "v2_oft";
      executionModeConfidence = "medium";
      executionValid = true;
      lastQuoteError = oftProbe.reason ?? quoteProbe.reason;
    } else if (oftProbe.classification === "missing_function") {
      executionMode = "v2_oft";
      executionModeConfidence = "medium";
      executionValid = oftProbe.executionValid;
      lastQuoteError = oftProbe.reason ?? quoteProbe.reason;
    } else if (oftProbe.classification === "oft_like") {
      executionMode = "v2_oft";
      executionModeConfidence = "medium";
      executionValid = oftProbe.executionValid;
      lastQuoteError = oftProbe.reason ?? quoteProbe.reason;
    }
  } else if (!registryMatch.asset0 && (registryMatch.adapter || (registryMatch.router && supportsQuoteSend === false))) {
    executionMode = "v2_adapter";
    executionModeConfidence = registryMatch.adapter ? "high" : "medium";
  }

  const isOFTV2 = executionMode === "v2_oft";

  let role: StargateContractRole = "erc20";
  if (isRouterV1) {
    role = "router_v1";
  } else if (isOFTV2) {
    role = "oft_v2";
  } else if (registryMatch.router || registryMatch.adapter || registryMatch.asset0) {
    role = "unknown";
  }

  let identitySource: CapabilityIdentitySource = "none";
  if (registryMatch.adapter || registryMatch.asset0) {
    identitySource = "registry";
  } else if (supportsFactory || supportsQuoteSend !== false) {
    identitySource = "probe";
  }

  let confidence: CapabilityConfidence = "low";
  if (registryMatch.adapter || registryMatch.asset0) {
    confidence = "high";
  } else if (supportsFactory || supportsQuoteSend !== false || registryMatch.router) {
    confidence = "medium";
  }

  return {
    role,
    executionMode,
    executionModeConfidence,
    isRouterV1,
    isOFTV2,
    supportsQuoteSend,
    supportsSend,
    supportsFactory,
    ...(lastQuoteError != null ? { lastQuoteError } : {}),
    registryMatch,
    identitySource,
    executionValid,
    confidence,
  };
}
