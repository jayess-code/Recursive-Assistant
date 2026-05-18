import { StargateBridgeExecutionMode, BridgeRouteStrategy } from "../../../core/BridgeTypes";
import { V2ExecutionTargetResolution } from "../stargatev2/StargateV2TokenResolver";

type SupportedV2Resolution = Extract<V2ExecutionTargetResolution, { supported: true }>;

export function isExecutableStargateV2Resolution(
  resolution?: SupportedV2Resolution | null
): boolean {
  return Boolean(
    resolution &&
      (
        (resolution.executionMode === "v2_oft" && resolution.executionValid === true) ||
        (resolution.executionMode === "v2_adapter" && resolution.executionValid !== false)
      )
  );
}

export function deriveExecutionModeFromV2Resolution(
  resolution?: SupportedV2Resolution | null
): StargateBridgeExecutionMode {
  if (!resolution) {
    return "unknown";
  }

  if (resolution.executionMode && resolution.executionMode !== "unknown") {
    return resolution.executionMode;
  }

  if (
    resolution.executionSurface === "adapter" ||
    resolution.executionSurface === "asset0" ||
    resolution.executionTargetType === "router"
  ) {
    return "v2_adapter";
  }

  return "unknown";
}

export function normalizeRequestedStargateExecutionMode(
  strategy?: BridgeRouteStrategy,
  resolution?: SupportedV2Resolution | null
): StargateBridgeExecutionMode {
  switch (strategy) {
    case "v1":
    case "v1_pool":
      return "v1_pool";
    case "v2_router":
    case "v2_adapter":
      return "v2_adapter";
    case "v2_oft":
      return "v2_oft";
    case "v2": {
      const derivedMode = deriveExecutionModeFromV2Resolution(resolution);
      return derivedMode === "unknown" ? "v2_oft" : derivedMode;
    }
    case "auto":
    case undefined:
    default: {
      const derivedMode = deriveExecutionModeFromV2Resolution(resolution);
      return derivedMode === "unknown" ? "v1_pool" : derivedMode;
    }
  }
}

export function matchesRequestedStargateExecutionMode(
  strategy: BridgeRouteStrategy | undefined,
  actualMode: StargateBridgeExecutionMode
): boolean {
  if (!strategy || strategy === "auto") {
    return actualMode !== "unknown";
  }

  if (strategy === "v1") {
    return actualMode === "v1_pool";
  }

  if (strategy === "v2") {
    return (
      actualMode === "v2_adapter" ||
      actualMode === "v2_router" ||
      actualMode === "v2_oft"
    );
  }

  if (strategy === "v2_router") {
    return actualMode === "v2_adapter" || actualMode === "v2_router";
  }

  if (strategy === "v2_adapter") {
    return actualMode === "v2_adapter";
  }

  return actualMode === strategy;
}
