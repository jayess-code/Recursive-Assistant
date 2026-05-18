import { BridgeAssetArgs } from "../BridgeTypes";
import { BridgeProviderSelection } from "./BridgeProvider";
import { listBridgeProviders } from "./providerRegistry";
import { StargateProvider } from "../../protocols/stargate/StargateProvider";

const PROVIDER_CALL_TIMEOUT_MS = Number(process.env.BRIDGE_PROVIDER_TIMEOUT_MS ?? 12000);

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

function normalizeMaybeAddress(value?: string): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

async function buildProviderMismatchHints(args: BridgeAssetArgs): Promise<string[]> {
  const requestedSource = normalizeMaybeAddress(args.srcTokenAddress);
  const requestedDestination = normalizeMaybeAddress(args.dstTokenAddress);
  const fromChain = String(args.fromChain || "").trim().toLowerCase();
  const toChain = String(args.toChain || "").trim().toLowerCase();
  const symbol = String(args.token || "").trim().toUpperCase();

  if (!requestedSource && !requestedDestination) {
    return [];
  }

  const hints: string[] = [];

  for (const provider of listBridgeProviders()) {
    if (!provider.discoverCapabilities) {
      continue;
    }

    try {
      const capabilities = await withTimeout(
        provider.discoverCapabilities({
        ...(fromChain ? { fromChains: [fromChain] } : {}),
        ...(toChain ? { toChains: [toChain] } : {}),
        ...(symbol ? { symbols: [symbol] } : {}),
        includeOnlyViemChains: true,
        includeUnsupportedTokens: false,
        maxRoutes: 10,
        }),
        PROVIDER_CALL_TIMEOUT_MS,
        `discoverCapabilities(${provider.id})`
      );

      const candidate = capabilities.routeCandidates.find((route) => {
        return (
          route.fromChain.toLowerCase() === fromChain &&
          route.toChain.toLowerCase() === toChain &&
          String(route.symbol || "").trim().toUpperCase() === symbol
        );
      });

      if (!candidate) {
        continue;
      }

      const supportedSource = normalizeMaybeAddress(candidate.fromTokenAddress);
      const supportedDestination = normalizeMaybeAddress(candidate.toTokenAddress);
      const sourceMismatch = Boolean(requestedSource && supportedSource && requestedSource !== supportedSource);
      const destinationMismatch = Boolean(
        requestedDestination && supportedDestination && requestedDestination !== supportedDestination
      );

      if (!sourceMismatch && !destinationMismatch) {
        continue;
      }

      const details: string[] = [];
      if (sourceMismatch) {
        details.push(
          `srcTokenAddress=${args.srcTokenAddress} is not supported by ${provider.id}; expected ${candidate.fromTokenAddress}`
        );
      }
      if (destinationMismatch) {
        details.push(
          `dstTokenAddress=${args.dstTokenAddress} is not supported by ${provider.id}; expected ${candidate.toTokenAddress}`
        );
      }

      hints.push(details.join(". "));
    } catch {
      continue;
    }
  }

  return hints;
}

export async function selectBridgeProvider(
  args: BridgeAssetArgs,
  routeStrategy?: BridgeAssetArgs["routeStrategy"]
): Promise<BridgeProviderSelection> {
  let stargateClassification: BridgeProviderSelection | null = null;

  for (const provider of listBridgeProviders()) {
    if (provider instanceof StargateProvider && typeof provider.assessRouteSupport === "function") {
      const assessment = await withTimeout(
        provider.assessRouteSupport({
        ...args,
        ...(routeStrategy ?? args.routeStrategy
          ? { routeStrategy: routeStrategy ?? args.routeStrategy }
          : {}),
        }),
        PROVIDER_CALL_TIMEOUT_MS,
        `assessRouteSupport(${provider.id})`
      );
      if (assessment.status === "supported") {
        return {
          status: "supported",
          provider,
          matchedArgs: assessment.matchedArgs,
        };
      }

      stargateClassification = {
        status: assessment.status,
        provider,
        reason: assessment.reason,
        ...(assessment.details != null ? { details: assessment.details } : {}),
      };
      continue;
    }

    const matchedArgs = await withTimeout(
      provider.match(args),
      PROVIDER_CALL_TIMEOUT_MS,
      `match(${provider.id})`
    );
    if (matchedArgs) {
      return { status: "supported", provider, matchedArgs };
    }
  }

  const mismatchHints = await buildProviderMismatchHints(args);
  if (mismatchHints.length > 0) {
    return {
      status: "unsupported",
      reason:
        `No bridge provider accepted the requested explicit token addresses. ${mismatchHints.join(". ")} ` +
        `Use getBridgeQuotes for the supported route addresses.`,
    };
  }

  if (stargateClassification) {
    return stargateClassification;
  }

  return {
    status: "unsupported",
    reason:
      "No bridge provider supports this route/token yet. Use getBridgeQuotes for strict discovery or add provider support in bridge/core/providers/selectProvider.ts.",
  };
}
