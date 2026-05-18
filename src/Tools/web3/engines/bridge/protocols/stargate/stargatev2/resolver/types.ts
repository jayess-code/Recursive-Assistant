import { Address } from "viem";
import { StargateBridgeExecutionMode } from "../../../../core/BridgeTypes";

export type V2ExecutionMode = Extract<
  StargateBridgeExecutionMode,
  "v2_oft" | "v2_adapter"
>;

export type StargateV2ExecutionSurface = "oft" | "adapter" | "asset0" | "unknown";
export type StargateV2ExecutionTargetType = "token" | "router" | "adapter" | "unknown";
export type V2ExecutionValidationStatus = boolean | "unknown";
export type V2ResolutionConfidence = "high" | "medium" | "low";
export type V2ExecutionAttributionSource =
  | "layerzero_api"
  | "probe_fallback"
  | "asset0_overlay"
  | "unknown";
export type V2ExecutionSelectionSource =
  | "registry"
  | "token_capability"
  | "surface_probe"
  | "heuristic"
  | "unknown";

export interface ResolveV2ExecutionTargetArgs {
  fromChain: string;
  toChain: string;
  srcTokenAddress: Address;
  recipient?: Address;
  amount?: bigint;
  slippageBps?: number;
  transportMode?: "taxi" | "bus";
}

export interface V2QuoteSendParams {
  dstEid: number;
  to: `0x${string}`;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: `0x${string}`;
  composeMsg: `0x${string}`;
  oftCmd: `0x${string}`;
}

/**
 * OFT surface params - includes OFT-specific encoding fields (composeMsg, oftCmd)
 * Used when calling quoteSend on the token contract itself
 */
export interface OFTQuoteSendParams {
  dstEid: number;
  to: `0x${string}`;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: `0x${string}`;
  composeMsg: `0x${string}`;
  oftCmd: `0x${string}`;
}

/**
 * Adapter surface params - excludes OFT-specific fields
 * Used when calling quoteSend on the adapter/router contract
 * The router doesn't understand composeMsg/oftCmd encoding
 */
export interface AdapterQuoteSendParams {
  dstEid: number;
  to: `0x${string}`;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: `0x${string}`;
}

/**
 * Asset0 surface params - different structure for pool-based quoting
 */
export interface Asset0QuoteSendParams {
  dstEid: number;
  to: `0x${string}`;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: `0x${string}`;
}

export interface ExecutionPreflight {
  params: V2QuoteSendParams | AdapterQuoteSendParams | Asset0QuoteSendParams;
  recipient: Address;
  msgType: number;
  dvnValid: boolean;
  executorValid: boolean;
  ready: boolean;
  reason?: string;
}

export type V2QuoteFailureClassification =
  | "quote_ok"
  | "oft_like"
  | "missing_function"
  | "reverted"
  | "param_invalid"
  | "capability_denied"
  | "unsupported";

export interface V2QuoteValidationResult {
  status: V2ExecutionValidationStatus;
  nativeFee: bigint;
  classification: V2QuoteFailureClassification;
  reason?: string;
  isOftLike: boolean;
}

export interface V2ExecutionCandidate {
  executionTarget: Address;
  executionTargetType: StargateV2ExecutionTargetType;
  executionSurface: StargateV2ExecutionSurface;
  executionMode: V2ExecutionMode;
  selectionSource: V2ExecutionSelectionSource;
  attributionSource: V2ExecutionAttributionSource;
  identityConfidence: V2ResolutionConfidence;
  executionConfidence: V2ResolutionConfidence;
}

export interface V2RoutingGraphStatus {
  routeType: "direct_peer" | "adapter_router" | "asset0_hub" | "unknown";
  routeWired: boolean;
  peer: Address | null;
  endpoint: Address | null;
  sendLibrary: Address | null;
  executorConfigReady: boolean;
  dvnConfigReady: boolean;
  deadDvnPresent: boolean;
  configValid: boolean;
  reason?: string;
}

export interface V2ValidatedCandidate extends V2ExecutionCandidate {
  executionValid: V2ExecutionValidationStatus;
  nativeFee: bigint;
  params: V2QuoteSendParams | AdapterQuoteSendParams | Asset0QuoteSendParams;
  validationReason?: string;
  validationClassification: V2QuoteFailureClassification;
  routingGraph: V2RoutingGraphStatus;
}

export type V2ExecutionTargetResolution =
  | {
      supported: true;
      confidence: V2ResolutionConfidence;
      identityConfidence: V2ResolutionConfidence;
      executionConfidence: V2ResolutionConfidence;
      mechanism: "oft";
      router: Address;
      dstToken: Address;
      executionTarget: Address;
      executionTargetType: StargateV2ExecutionTargetType;
      executionSurface: StargateV2ExecutionSurface;
      executionMode: StargateBridgeExecutionMode;
      selectionSource: V2ExecutionSelectionSource;
      attributionSource: V2ExecutionAttributionSource;
      executionModeConfidence: V2ResolutionConfidence;
      executionValid: V2ExecutionValidationStatus;
      lastQuoteError?: string;
      validationReason?: string;
      validationClassification: V2QuoteFailureClassification;
      dstEid: number;
      nativeFee: bigint;
      params: V2QuoteSendParams | AdapterQuoteSendParams | Asset0QuoteSendParams;
      preflight: ExecutionPreflight;
      routingGraph: V2RoutingGraphStatus;
    }
  | {
      supported: false;
      confidence: V2ResolutionConfidence;
      identityConfidence: V2ResolutionConfidence;
      executionConfidence: V2ResolutionConfidence;
      mechanism: "oft";
      router: Address;
      dstToken: Address;
      executionTarget: Address;
      executionTargetType: StargateV2ExecutionTargetType;
      executionSurface: StargateV2ExecutionSurface;
      executionMode: StargateBridgeExecutionMode;
      selectionSource: V2ExecutionSelectionSource;
      attributionSource: V2ExecutionAttributionSource;
      executionModeConfidence: V2ResolutionConfidence;
      executionValid: false;
      lastQuoteError?: string;
      validationClassification: V2QuoteFailureClassification;
      reason: string;
      dstEid?: number;
      nativeFee: bigint;
      params?: V2QuoteSendParams | AdapterQuoteSendParams | Asset0QuoteSendParams;
      preflight?: ExecutionPreflight;
      validationReason?: string;
      routingGraph?: V2RoutingGraphStatus;
    };
