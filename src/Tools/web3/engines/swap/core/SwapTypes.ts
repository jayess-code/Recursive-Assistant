import { Address, ChainKey } from "../../../clients/viem/viem-types";

export type SwapExecutionFamily =
  | "uniswap_v2"
  | "uniswap_v3"
  | "algebra"
  | "aggregator_0x"
  | "unknown";

export type SwapSupportStatus = "supported" | "unsupported" | "known_not_executable";
export type DetectionConfidence = "high" | "medium" | "low";
export type DetectionIdentitySource =
  | "registry"
  | "dynamic_verified"
  | "dynamic_hint"
  | "abi"
  | "selector"
  | "heuristic"
  | "none";

export type SwapTradeType = "exact_in" | "exact_out";

export type SwapFailureCode =
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_FAMILY"
  | "LOW_CONFIDENCE_DETECTION"
  | "INVALID_TOKEN_PAIR"
  | "INVALID_ROUTE"
  | "ROUTE_NOT_ATOMIC"
  | "MISSING_QUOTE"
  | "APPROVAL_QUERY_FAILED"
  | "GAS_ESTIMATE_FAILED"
  | "SLIPPAGE_OUT_OF_RANGE"
  | "INVALID_DEADLINE"
  | "INVALID_ROUTER";

export interface DetectionSignal {
  type: "registry" | "dynamic" | "abi_method" | "selector" | "runtime_probe" | "heuristic";
  key: string;
  value: string;
  weight: number;
}

export interface DetectorResult {
  family: SwapExecutionFamily;
  supportStatus: SwapSupportStatus;
  confidence: DetectionConfidence;
  identitySource: DetectionIdentitySource;
  reasons: string[];
  signals: DetectionSignal[];
  routerAddress: Address;
  chain: ChainKey;
  quoterAddress: Address | null;
}

export interface SwapIntent {
  chain: ChainKey;
  routerAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  amount: string;
  tradeType: SwapTradeType;
  recipient: Address;
  sender: Address;
  path?: Address[] | null;
  feeTiers?: number[] | null;
  slippageBps?: number | null;
  deadlineSecondsFromNow?: number | null;
  feeTier?: number | null;
  abi?: readonly unknown[] | null;
  quoterAddress?: Address | null;
  allowLowConfidence?: boolean | null;
  feeOnTransferTokenIn?: boolean | null;
  feeOnTransferTokenOut?: boolean | null;
}

export interface RequestedSwapRoute {
  path: Address[];
  feeTiers: number[] | null;
}

export interface RouteExecutionViability {
  atomicExecutable: boolean;
  family: SwapExecutionFamily;
  routerAddress: Address;
  reason?: string;
}

export interface ExecutableSwapRoute extends RequestedSwapRoute, RouteExecutionViability {}

export interface SwapQuote {
  family: SwapExecutionFamily;
  chain: ChainKey;
  routerAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  tradeType: SwapTradeType;
  amountIn: string;
  amountOut: string;
  path: Address[];
  quoterAddress: Address | null;
  source: "onchain" | "offchain" | "mixed";
  metadata: Record<string, unknown>;
}

export interface ApprovalRequirement {
  required: boolean;
  token: Address;
  spender: Address;
  owner: Address;
  amount: string;
  currentAllowance: string;
}

export type SwapPlanStep =
  | {
      type: "approval";
      tool: "write_contract";
      description?: string;
      args: {
        chain: ChainKey;
        address: Address;
        abi: readonly unknown[];
        functionName: string;
        args: unknown[];
        dryRun?: boolean;
      };
    }
  | {
      type: "swap";
      tool: "send_transaction";
      description?: string;
      args: {
        chain: ChainKey;
        to: Address;
        data: `0x${string}`;
        value?: string | null;
        dryRun?: boolean;
      };
    };

export interface SwapBuildArtifacts {
  to: Address;
  data: `0x${string}`;
  value: bigint;
  estimatedGas: bigint | null;
}

export interface SwapExecutionPlan {
  chain: ChainKey;
  family: SwapExecutionFamily;
  supportStatus: SwapSupportStatus;
  confidence: DetectionConfidence;
  source: "onchain" | "offchain" | "mixed";
  routerAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  tradeType: SwapTradeType;
  amountIn: string;
  amountOut: string;
  slippageBps: number;
  deadline: number;
  approval: ApprovalRequirement;
  artifacts: SwapBuildArtifacts;
  steps: SwapPlanStep[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface SwapExecutionRequest extends SwapIntent {
  dryRun?: boolean | null;
}

export interface SwapPolicy {
  minSlippageBps: number;
  maxSlippageBps: number;
  defaultSlippageBps: number;
  defaultDeadlineSecondsFromNow: number;
  minDetectionConfidence: DetectionConfidence;
}
