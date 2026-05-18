
import { Address, ChainKey } from "../../../clients/viem/viem-types";

export interface BridgeRoute {
  provider: string;
  fromChain: string;
  toChain: string;
  srcToken: string;
  dstToken: string;
  amount: string;
  estimatedReceived: bigint | null;
  fee: {
    native: bigint;
    usd?: number;
  };
  timeEstimate: "fast" | "medium" | "slow";
  riskLevel: "low" | "medium" | "high";
  executionPlan: any; // your BridgeExecutionPlan
  metadata: Record<string, unknown>;
}

export type BridgeSupportStatus =
  | "supported"
  | "unsupported"
  | "known_not_executable";

export type StargateBridgeExecutionMode =
  | "v1_pool"
  | "v2_adapter"
  | "v2_asset0"
  | "v2_oft"
  | "v2_router"
  | "unknown";

export type BridgeRouteStrategy =
  | "auto"
  | "v1"
  | "v2"
  | Exclude<StargateBridgeExecutionMode, "unknown">;

export type BridgeAssetArgs = {
  fromChain: ChainKey;
  toChain: ChainKey;
  token: string;
  sender?: Address;
  srcTokenAddress?: Address;
  dstTokenAddress?: Address;
  amount: string;
  recipient: Address;
  slippageBps?: number;
  dryRun?: boolean;
  transportMode?: "taxi" | "bus";
  fields?: string[] | null;
  includeRawStepData?: boolean | null;
  routeStrategy?: BridgeRouteStrategy;
}

export type BridgeQuoteArgs = {
  fromChain: ChainKey;
  toChain: ChainKey;
  token: string;
  amount: string;
  recipient?: Address;
  srcTokenAddress?: Address;
  dstTokenAddress?: Address;
  slippageBps?: number;
  transportMode?: "taxi" | "bus";
  fields?: string[] | null;
  routeFields?: string[] | null;
  compact?: boolean | null;
}

export type BridgeApproval = {
  required: boolean;
  token: Address;
  spender: Address | null;
  amount: bigint;
}

export type BridgePlanStep =
  | {
      type: "approval" | "bridge";
      tool: "write_contract";
      description?: string;
      args: {
        chain: ChainKey;
        address: Address;
        abi: readonly unknown[];
        functionName: string;
        args?: unknown[];
        value?: string | null;
        dryRun?: boolean;
      };
    }
  | {
      type: "approval" | "bridge";
      tool: "send_transaction";
      description?: string;
      args: {
        chain: ChainKey;
        to: Address;
        data?: `0x${string}` | null;
        value?: string | null;
        dryRun?: boolean;
      };
    };

export interface BridgeExecutionPlan {
  provider: string;
  executionMode?: StargateBridgeExecutionMode;
  fromChain: ChainKey;
  toChain: ChainKey;
  token: string;
  amount: string;
  recipient: Address;
  slippageBps: number;
  fee: {
    quotedNativeFee: string;
    bufferedNativeFee: string;
    bufferBps: number;
  };
  approval: BridgeApproval;
  steps: BridgePlanStep[];
  metadata: Record<string, unknown>;
}

export interface BridgeSimulationResult {
  simulated: true;
  canExecute: boolean;
  dryRun: boolean;
  plan: BridgeExecutionPlan;
}

export interface BridgeExecutionResult {
  simulated: boolean;
  executed: boolean;
  dryRun: boolean;
  plan: BridgeExecutionPlan;
  txHashes: string[];
}

export interface BridgeRouteQuote {
  provider: string;
  summary: string;
  supportStatus: BridgeSupportStatus;
  estimatedReceived: string | null;
  estimatedReceivedFormatted: string | null;
  estimatedReceivedSymbol: string | null;
  fee: string | null;
  feeFormatted: string | null;
  feeSymbol: string | null;
  approvalRequired: boolean;
  stepsCount: number;
  timeEstimate: "fast" | "medium" | "slow";
  riskLevel: "low" | "medium" | "high";
  metadata: Record<string, unknown>;
}

export interface BridgeQuoteResult {
  input: {
    fromChain: ChainKey;
    toChain: ChainKey;
    token: string;
    amount: string;
    amountFormatted: string;
    amountDecimals: number;
    recipient: Address;
    slippageBps: number;
  };
  routes: BridgeRouteQuote[];
  bestRoute: BridgeRouteQuote | null;
  warnings?: string[];
}

export interface BridgeCapabilityDiscoveryArgs {
  fromChains?: string[];
  toChains?: string[];
  symbols?: string[];
  includeOnlyViemChains: boolean;
  includeUnsupportedTokens: boolean;
  maxRoutes: number;
}

export interface BridgeDiscoveredChain {
  chainKey: string;
  chainType: string;
  chainId: number | null;
  name: string | null;
  shortName: string | null;
  nativeSymbol: string | null;
  nativeDecimals: number | null;
  isViemSupported: boolean;
  metadata: Record<string, unknown>;
}

export interface BridgeDiscoveredToken {
  chainKey: string;
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  isSupported: boolean;
  isViemSupported: boolean;
  priceUsd: number | null;
  canonicalId: string;
  canonicalSource: "registry" | "fingerprint" | "address";
  metadata: Record<string, unknown>;
}

export interface BridgeDiscoveredRouteCandidate {
  provider: string;
  fromChain: string;
  toChain: string;
  canonicalId: string;
  symbol: string | null;
  name: string | null;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromChainViemSupported: boolean;
  toChainViemSupported: boolean;
  metadata: Record<string, unknown>;
}

export interface BridgeProviderCapabilities {
  provider: string;
  chains: BridgeDiscoveredChain[];
  tokens: BridgeDiscoveredToken[];
  routeCandidates: BridgeDiscoveredRouteCandidate[];
  warnings: string[];
}
