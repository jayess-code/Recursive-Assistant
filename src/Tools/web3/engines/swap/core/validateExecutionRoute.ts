import { Address, getAddress } from "viem";
import { DetectorResult, ExecutableSwapRoute, SwapExecutionRequest } from "./SwapTypes";

function normalizePath(request: SwapExecutionRequest): Address[] {
  if (request.path?.length && request.path.length >= 2) {
    return request.path.map((token) => getAddress(token));
  }

  return [getAddress(request.tokenIn), getAddress(request.tokenOut)];
}

export function validateExecutionRoute(
  request: SwapExecutionRequest,
  detector: DetectorResult
): ExecutableSwapRoute {
  const tokenIn = getAddress(request.tokenIn);
  const tokenOut = getAddress(request.tokenOut);
  const path = normalizePath(request);
  const feeTiers = request.feeTiers?.length ? [...request.feeTiers] : null;

  if (path.length < 2) {
    throw new Error("Swap path must contain at least two token addresses.");
  }

  if (path[0] !== tokenIn) {
    throw new Error(`Swap path must start with tokenIn ${tokenIn}.`);
  }

  if (path[path.length - 1] !== tokenOut) {
    throw new Error(`Swap path must end with tokenOut ${tokenOut}.`);
  }

  if (path.length === 2) {
    return {
      path,
      feeTiers: feeTiers?.length ? feeTiers : null,
      atomicExecutable: true,
      family: detector.family,
      routerAddress: detector.routerAddress,
    };
  }

  if (detector.family === "uniswap_v2") {
    return {
      path,
      feeTiers: null,
      atomicExecutable: true,
      family: detector.family,
      routerAddress: detector.routerAddress,
    };
  }

  if (detector.family === "uniswap_v3") {
    if (request.tradeType === "exact_out") {
      throw new Error("Uniswap V3 multi-hop exact_out is not supported yet.");
    }

    if (!feeTiers || feeTiers.length !== path.length - 1) {
      throw new Error(
        `Uniswap V3 multi-hop requires feeTiers length ${path.length - 1}; received ${feeTiers?.length ?? 0}.`
      );
    }

    return {
      path,
      feeTiers,
      atomicExecutable: true,
      family: detector.family,
      routerAddress: detector.routerAddress,
    };
  }

  if (detector.family === "algebra") {
    if (request.tradeType === "exact_out") {
      throw new Error("Algebra multi-hop exact_out is not supported yet.");
    }

    return {
      path,
      feeTiers: null,
      atomicExecutable: true,
      family: detector.family,
      routerAddress: detector.routerAddress,
      ...(feeTiers?.length
        ? { reason: "Ignoring feeTiers for algebra multi-hop path encoding." }
        : {}),
    };
  }

  return {
    path,
    feeTiers,
    atomicExecutable: false,
    family: detector.family,
    routerAddress: detector.routerAddress,
    reason: `Multi-hop packed-path execution is not supported for family '${detector.family}'.`,
  };
}