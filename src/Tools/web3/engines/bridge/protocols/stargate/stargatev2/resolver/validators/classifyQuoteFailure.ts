import { V2QuoteValidationResult } from "../types";
import { detectOftLikeRevert } from "./detectOftLikeRevert";

const MISSING_FUNCTION_PATTERNS = [
  "function does not exist",
  "returned no data",
  'the contract function "quotesend" returned no data',
];

const CAPABILITY_DENIED_PATTERNS = [
  "not supported",
  "route not found",
  "path not found",
  "route unavailable",
  "not configured",
  "not provisioned",
  "unsupported route",
  "unsupported token",
];

const PARAM_FAILURE_PATTERNS = [
  "invalid amount",
  "stargate_invalidamount",
  "slippage exceeded",
  "slippageexceeded",
  "invalid eid",
];

export function isCapabilityDeniedQuoteFailure(
  failure: Pick<V2QuoteValidationResult, "classification" | "reason">
): boolean {
  const normalizedReason = failure.reason?.toLowerCase() ?? "";

  return (
    failure.classification === "capability_denied" ||
    CAPABILITY_DENIED_PATTERNS.some((pattern) => normalizedReason.includes(pattern))
  );
}

export function classifyQuoteFailure(
  error: unknown
): Pick<V2QuoteValidationResult, "status" | "classification" | "reason" | "isOftLike"> {
  const reason = error instanceof Error ? error.message : String(error);
  const normalizedReason = reason.toLowerCase();
  const isOftLike = detectOftLikeRevert(error);

  if (MISSING_FUNCTION_PATTERNS.some((pattern) => normalizedReason.includes(pattern))) {
    return {
      status: false,
      classification: "missing_function",
      reason,
      isOftLike: false,
    };
  }

  if (CAPABILITY_DENIED_PATTERNS.some((pattern) => normalizedReason.includes(pattern))) {
    return {
      status: false,
      classification: "capability_denied",
      reason,
      isOftLike: false,
    };
  }

  if (PARAM_FAILURE_PATTERNS.some((pattern) => normalizedReason.includes(pattern))) {
    return {
      status: "unknown",
      classification: "param_invalid",
      reason,
      isOftLike: false,
    };
  }

  if (isOftLike) {
    return {
      status: "unknown",
      classification: "oft_like",
      reason,
      isOftLike: true,
    };
  }

  if (normalizedReason.includes("revert") || normalizedReason.includes("call exception")) {
    return {
      status: "unknown",
      classification: "reverted",
      reason,
      isOftLike: false,
    };
  }

  return {
    status: false,
    classification: "unsupported",
    reason,
    isOftLike: false,
  };
}
