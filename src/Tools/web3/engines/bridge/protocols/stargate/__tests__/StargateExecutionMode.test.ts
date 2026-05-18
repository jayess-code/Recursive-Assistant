import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveExecutionModeFromV2Resolution,
  isExecutableStargateV2Resolution,
  matchesRequestedStargateExecutionMode,
  normalizeRequestedStargateExecutionMode,
} from "../planning/resolveStargateExecutionMode";
import {
  shouldPreserveV2FailureContext,
} from "../matcher/StargateCrossChainMatcher";
import { resolveMatchedDstTokenAddress } from "../shared/StargateNormalizer";
import { shouldSurfaceV2Match } from "../stargatev2/StargateV2CrossChainMatcher";
import {
  classifyQuoteFailure,
  isCapabilityDeniedQuoteFailure,
} from "../stargatev2/resolver/validators/classifyQuoteFailure";
import {
  buildOftQuoteParams,
  buildBusAwareOftQuoteSendParams,
  deriveQuotedMinAmountLD,
  resolveDestinationTokenForV2Route,
} from "../stargatev2/StargateV2TokenResolver";
import { resolveAsset0Surface } from "../stargatev2/asset0/resolveAsset0Surface";
import { buildOftAdapterQuoteParams } from "../stargatev2/oft-adapter/buildOftAdapterQuoteParams";
import { resolveOftAdapterSurface } from "../stargatev2/oft-adapter/resolveOftAdapterSurface";
import { resolveOftSurface } from "../stargatev2/oft/resolveOftSurface";
import { resolveTaggedOftSurface } from "../stargatev2/oft/resolveTaggedOftSurface";
import {
  buildExecutionPreflight,
  buildExecutorOptions,
} from "../stargatev2/resolver/preflight/ExecutionPreflightBuilder";
import { getStargateOftRegistryEntry } from "../discovery/stargateOftRegistry";
// import { fetchWalletAddress } from "../../../../../tools/general/fetchWalletAddress/fetchWalletAddress";
const DEFAULT_USER_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
test("deriveExecutionModeFromV2Resolution only trusts runtime-validated explicit modes", () => {
  const inferredTokenMode = deriveExecutionModeFromV2Resolution({
    supported: true,
    executionSurface: "oft",
  } as never);

  const explicitOftMode = deriveExecutionModeFromV2Resolution({
    supported: true,
    executionMode: "v2_oft",
    executionSurface: "oft",
  } as never);

  const adapterMode = deriveExecutionModeFromV2Resolution({
    supported: true,
    executionSurface: "adapter",
  } as never);

  const oftMode = deriveExecutionModeFromV2Resolution({
    supported: true,
    executionMode: "v2_oft",
    executionSurface: "oft",
  } as never);

  const unknownMode = deriveExecutionModeFromV2Resolution({
    supported: true,
    executionSurface: "unknown",
  } as never);

  assert.equal(inferredTokenMode, "unknown");
  assert.equal(explicitOftMode, "v2_oft");
  assert.equal(adapterMode, "v2_adapter");
  assert.equal(oftMode, "v2_oft");
  assert.equal(unknownMode, "unknown");
});

test("normalizeRequestedStargateExecutionMode honors explicit mode requests", () => {
  assert.equal(normalizeRequestedStargateExecutionMode("v1_pool"), "v1_pool");
  assert.equal(normalizeRequestedStargateExecutionMode("v2_router"), "v2_adapter");
  assert.equal(normalizeRequestedStargateExecutionMode("v2_adapter"), "v2_adapter");
  assert.equal(normalizeRequestedStargateExecutionMode("v2_oft"), "v2_oft");
  assert.equal(
    normalizeRequestedStargateExecutionMode("auto", {
      supported: true,
      executionSurface: "adapter",
    } as never),
    "v2_adapter"
  );
});

test("matchesRequestedStargateExecutionMode accepts all V2 execution families", () => {
  assert.equal(matchesRequestedStargateExecutionMode("v2", "v2_oft"), true);
  assert.equal(matchesRequestedStargateExecutionMode("v2", "v2_adapter"), true);
  assert.equal(matchesRequestedStargateExecutionMode("v2_router", "v2_adapter"), true);
});

test("isExecutableStargateV2Resolution only allows validated simple OFT execution", () => {
  assert.equal(
    isExecutableStargateV2Resolution({
      supported: true,
      executionMode: "v2_oft",
      executionValid: true,
    } as never),
    true
  );

  assert.equal(
    isExecutableStargateV2Resolution({
      supported: true,
      executionMode: "v2_oft",
      executionValid: "unknown",
    } as never),
    false
  );

  assert.equal(
    isExecutableStargateV2Resolution({
      supported: true,
      executionMode: "v2_adapter",
      executionValid: true,
    } as never),
    true
  );

  assert.equal(
    isExecutableStargateV2Resolution({
      supported: true,
      executionMode: "v2_adapter",
      executionValid: "unknown",
    } as never),
    true
  );
});

test("buildOftQuoteParams uses Stargate taxi defaults", () => {
  const params = buildOftQuoteParams({
    dstEid: 110,
    recipient: DEFAULT_USER_ADDRESS,
    amount: 1_000_000n,
    transportMode: "taxi",
  } as never);

  assert.equal(params.oftCmd, "0x");
  assert.notEqual(params.extraOptions, "0x");
  assert.equal(params.minAmountLD, 0n);
});

test("buildBusAwareOftQuoteSendParams preserves the dedicated OFT bus encoding", () => {
  const params = buildBusAwareOftQuoteSendParams({
    dstEid: 110,
    recipient: DEFAULT_USER_ADDRESS,
    amount: 1_000_000n,
    transportMode: "bus",
  } as never);

  assert.equal(params.oftCmd, "0x00");
  assert.notEqual(params.extraOptions, "0x");
});

test("deriveQuotedMinAmountLD applies slippage to the quoted receive amount", () => {
  assert.equal(deriveQuotedMinAmountLD(985000n, 100), 975150n);
  assert.equal(deriveQuotedMinAmountLD(985000n, 0), 985000n);
});


test("OFT builder accepts Katana endpoint ids", () => {

  const params = buildOftQuoteParams({
    dstEid: 30375,
    recipient: DEFAULT_USER_ADDRESS,
    amount: 1_000_000n,
    transportMode: "taxi",
  } as never);

  assert.equal(params.dstEid, 30375);
});

test("classifyQuoteFailure separates capability denial from param issues", () => {
  const capabilityFailure = classifyQuoteFailure(
    new Error("quoteSend reverted: route not supported for destination")
  );
  const paramFailure = classifyQuoteFailure(
    new Error("quoteSend reverted: slippage exceeded due to minAmount")
  );
  const genericOftLikeRevert = classifyQuoteFailure(
    new Error(
      'The contract function "quoteOFT" reverted. args: ({"dstEid":30375,"minAmountLD":"1000000","extraOptions":"0x"})'
    )
  );

  assert.equal(capabilityFailure.classification, "capability_denied");
  assert.equal(isCapabilityDeniedQuoteFailure(capabilityFailure), true);
  assert.equal(paramFailure.classification, "param_invalid");
  assert.equal(isCapabilityDeniedQuoteFailure(paramFailure), false);
  assert.notEqual(genericOftLikeRevert.classification, "param_invalid");
});

test("shouldPreserveV2FailureContext keeps classified OFT-like failures visible", () => {
  assert.equal(
    shouldPreserveV2FailureContext({
      executionMode: "v2_oft",
      executionTargetType: "token",
      metadata: {
        validationClassification: "oft_like",
      },
    } as never),
    true
  );

  assert.equal(
    shouldPreserveV2FailureContext({
      executionMode: "unknown",
      executionTargetType: "unknown",
      metadata: {
        validationClassification: "unsupported",
      },
    } as never),
    false
  );
});

test("shouldSurfaceV2Match keeps identified OFT and adapter candidates visible while validation remains unknown", () => {
  assert.equal(
    shouldSurfaceV2Match({
      supported: true,
      executionMode: "v2_oft",
      executionTargetType: "token",
      executionTarget: "0x0000000000000000000000000000000000000001",
      executionValid: "unknown",
      identityConfidence: "high",
    } as never),
    true
  );

  assert.equal(
    shouldSurfaceV2Match({
      supported: true,
      executionMode: "v2_adapter",
      executionTargetType: "router",
      executionTarget: "0x0000000000000000000000000000000000000001",
      executionValid: "unknown",
      identityConfidence: "medium",
    } as never),
    true
  );
});

test("resolveTaggedOftSurface does not promote unknown quote probes into a direct OFT route", () => {
  assert.equal(
    resolveTaggedOftSurface({
      tokenAddress: "0x0000000000000000000000000000000000000001",
      capability: {
        supportsQuoteSend: "unknown",
        executionMode: "unknown",
        executionValid: "unknown",
      } as never,
    }),
    null
  );
});

test("resolveOftSurface classifies direct OFT routes from dynamic quoteSend capability", () => {
  const candidate = resolveOftSurface({
    tokenAddress: "0x0000000000000000000000000000000000000001",
    capability: {
      isOFTV2: true,
      supportsQuoteSend: true,
      identitySource: "probe",
      confidence: "medium",
    } as never,
  });

  assert.ok(candidate);
  assert.equal(candidate?.executionSurface, "oft");
  assert.equal(candidate?.executionMode, "v2_oft");
  assert.equal(candidate?.selectionSource, "token_capability");
});

test("resolveOftAdapterSurface activates when direct quoteSend is unavailable but a router path exists", () => {
  const candidate = resolveOftAdapterSurface({
    router: "0x0000000000000000000000000000000000000002",
    capability: {
      supportsQuoteSend: false,
      confidence: "medium",
    } as never,
    routingHint: null,
  } as never);

  assert.ok(candidate);
  assert.equal(candidate?.executionSurface, "adapter");
  assert.equal(candidate?.executionMode, "v2_adapter");
});

test("buildOftAdapterQuoteParams emits only the 5 adapter-compatible fields", () => {
  const params = buildOftAdapterQuoteParams({
    dstEid: 30110,
    recipient: DEFAULT_USER_ADDRESS,
    amount: 1_000_000n,
  });

  assert.deepEqual(Object.keys(params).sort(), [
    "amountLD",
    "dstEid",
    "extraOptions",
    "minAmountLD",
    "to",
  ]);
  assert.equal("composeMsg" in params, false);
  assert.equal("oftCmd" in params, false);
});

test("buildOftAdapterQuoteParams honors explicit minAmount and options overrides", () => {
  const params = buildOftAdapterQuoteParams({
    dstEid: 30110,
    recipient: DEFAULT_USER_ADDRESS,
    amount: 1_000_000n,
    minAmountLD: 990_000n,
    extraOptions: "0x1234",
  });

  assert.equal(params.minAmountLD, 990_000n);
  assert.equal(params.extraOptions, "0x1234");
  assert.equal("composeMsg" in params, false);
  assert.equal("oftCmd" in params, false);
});

test("resolveAsset0Surface returns a router candidate for asset0 registry hints", () => {
  const candidate = resolveAsset0Surface({
    router: "0x0000000000000000000000000000000000000002",
    routingHint: {
      executionSurface: "asset0",
    } as never,
  });

  assert.ok(candidate);
  assert.equal(candidate?.executionSurface, "asset0");
  assert.equal(candidate?.executionMode, "v2_adapter");
});

test("base aUSD remains registry-hinted as asset0 and not a direct OFT", () => {
  const entry = getStargateOftRegistryEntry(
    "base",
    "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a"
  );

  assert.ok(entry);
  assert.equal(entry?.executionSurface, "asset0");
});

test("resolveMatchedDstTokenAddress maps Polygon USDC to Base USDC", () => {
  const dstToken = resolveMatchedDstTokenAddress({
    fromChain: "polygon",
    toChain: "base",
    tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  });

  assert.equal(dstToken, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
});

test("polygon native USDC registry is classified as adapter-backed V2 execution", () => {
  const entry = getStargateOftRegistryEntry(
    "polygon",
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
  );

  assert.ok(entry);
  assert.equal(entry?.symbol, "USDC");
  assert.equal(entry?.executionSurface, "adapter");
  assert.equal(entry?.executionModeHint, "v2_adapter");
});

test("resolveDestinationTokenForV2Route uses the LayerZero peer address for direct OFT routes", () => {
  const dstToken = resolveDestinationTokenForV2Route({
    srcToken: "0xEb971Fd26783f32694dbB392dD7289de23109148",
    candidate: {
      executionSurface: "oft",
      executionMode: "v2_oft",
    },
    routingGraph: {
      routeType: "direct_peer",
      peer: "0x31DbA3c96481FDe3CD81C2aaF51F2D8bf618C742",
    },
  });

  assert.equal(dstToken, "0x31DbA3c96481FDe3CD81C2aaF51F2D8bf618C742");
});

test("resolveDestinationTokenForV2Route does not override adapter-backed routes", () => {
  const dstToken = resolveDestinationTokenForV2Route({
    srcToken: "0xEb971Fd26783f32694dbB392dD7289de23109148",
    candidate: {
      executionSurface: "adapter",
      executionMode: "v2_adapter",
    },
    routingGraph: {
      routeType: "adapter_router",
      peer: "0x31DbA3c96481FDe3CD81C2aaF51F2D8bf618C742",
    },
  });

  assert.equal(dstToken, "0xEb971Fd26783f32694dbB392dD7289de23109148");
});

test("buildExecutorOptions always emits non-empty LayerZero execution options", () => {
  const options = buildExecutorOptions({
    dstEid: 30110,
    gasLimit: 250000n,
    msgType: 1,
  });

  assert.notEqual(options, "0x");
});

test("buildExecutionPreflight blocks execution when DVN or executor config is invalid", async () => {
  const preflight = await buildExecutionPreflight({
    candidate: {
      executionTarget: "0x0000000000000000000000000000000000000001",
      executionTargetType: "token",
      executionSurface: "oft",
      executionMode: "v2_oft",
      selectionSource: "registry",
      attributionSource: "unknown",
      identityConfidence: "high",
      executionConfidence: "medium",
    },
    quoteArgs: {
      dstEid: 30110,
      recipient: DEFAULT_USER_ADDRESS,
      amount: 1_000_000n,
      transportMode: "taxi",
    },
    routingGraph: {
      routeType: "direct_peer",
      routeWired: true,
      peer: "0x0000000000000000000000000000000000000002",
      endpoint: "0x0000000000000000000000000000000000000003",
      sendLibrary: "0x0000000000000000000000000000000000000004",
      executorConfigReady: false,
      dvnConfigReady: false,
      deadDvnPresent: false,
      configValid: false,
      reason: "Executor and DVN config missing.",
    },
  });

  assert.equal(preflight.ready, false);
  assert.equal(preflight.executorValid, false);
  assert.equal(preflight.dvnValid, false);
});

test("buildExecutionPreflight uses enforced options directly instead of double-appending defaults", async () => {
  const enforced = "0x000301001101000000000000000000000000000186a0";
  const preflight = await buildExecutionPreflight({
    candidate: {
      executionTarget: "0x0000000000000000000000000000000000000001",
      executionTargetType: "token",
      executionSurface: "oft",
      executionMode: "v2_oft",
      selectionSource: "registry",
      attributionSource: "unknown",
      identityConfidence: "high",
      executionConfidence: "medium",
    },
    quoteArgs: {
      dstEid: 30110,
      recipient: DEFAULT_USER_ADDRESS,
      amount: 1_000_000n,
      transportMode: "taxi",
    },
    routingGraph: {
      routeType: "direct_peer",
      routeWired: true,
      peer: "0x0000000000000000000000000000000000000002",
      endpoint: "0x0000000000000000000000000000000000000003",
      sendLibrary: "0x0000000000000000000000000000000000000004",
      executorConfigReady: true,
      dvnConfigReady: true,
      deadDvnPresent: false,
      configValid: true,
    },
    client: {
      readContract: async () => enforced,
    } as never,
  });

  assert.equal(preflight.params.extraOptions, enforced);
  assert.equal(preflight.params.minAmountLD, 0n);
});

test("buildExecutionPreflight treats adapter routes as ready without OFT config", async () => {
  const preflight = await buildExecutionPreflight({
    candidate: {
      executionTarget: "0x0000000000000000000000000000000000000001",
      executionTargetType: "router",
      executionSurface: "adapter",
      executionMode: "v2_adapter",
      selectionSource: "registry",
      attributionSource: "unknown",
      identityConfidence: "high",
      executionConfidence: "medium",
    },
    quoteArgs: {
      dstEid: 30110,
      recipient: DEFAULT_USER_ADDRESS,
      amount: 1_000_000n,
      transportMode: "taxi",
    },
    routingGraph: {
      routeType: "adapter_router",
      routeWired: true,
      peer: null,
      endpoint: null,
      sendLibrary: null,
      executorConfigReady: false,
      dvnConfigReady: false,
      deadDvnPresent: false,
      configValid: false,
    },
  });

  assert.equal(preflight.ready, true);
  assert.equal(preflight.executorValid, true);
  assert.equal(preflight.dvnValid, true);
  assert.deepEqual(Object.keys(preflight.params).sort(), [
    "amountLD",
    "composeMsg",
    "dstEid",
    "extraOptions",
    "minAmountLD",
    "oftCmd",
    "to",
  ]);
  assert.equal("recipient" in preflight.params, false);
  assert.equal("msgType" in preflight.params, false);
  assert.equal("ready" in preflight.params, false);
});
