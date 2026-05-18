import { Address, Hex, getAddress, zeroAddress } from "viem";
import { getLayerZeroV2EndpointId } from "../../../../shared/layerZeroV2MetadataRegistry";
import { StargateIntrospector } from "../../runtime/StargateIntrospector";
import { probeContractCapabilities } from "../../runtime/StargateContractClassifier";
import { resolveStargateOftRoutingHint } from "../../discovery/stargateOftRegistry";
import { addressToBytes32 } from "../utils/address";
import { buildStargateTaxiExtraOptions } from "../utils/encoding";
import { formatValidationReason } from "../utils/logging";
import {
  buildExecutionPreflight,
  deriveExecutionConfidenceFromPreflight,
} from "./preflight/ExecutionPreflightBuilder";
import { resolveAsset0Surface } from "../asset0/resolveAsset0Surface";
import { buildOftAdapterRoutingGraph } from "../oft-adapter/buildOftAdapterRoutingGraph";
import { resolveOftAdapterSurface } from "../oft-adapter/resolveOftAdapterSurface";
import { buildOftQuoteParams } from "../oft/buildOftQuoteParams";
import { resolveOftSurface } from "../oft/resolveOftSurface";
import { resolveTaggedOftSurface } from "../oft/resolveTaggedOftSurface";
import {
  ResolveV2ExecutionTargetArgs,
  V2ExecutionCandidate,
  V2ExecutionTargetResolution,
  V2QuoteSendParams,
  V2ResolutionConfidence,
  V2RoutingGraphStatus,
} from "./types";
import { validateQuoteSend } from "./validators/validateQuoteSend";
import { resolveChainKey } from "../../../../../../clients/viem/viemChains";
import { getViemPublicClient } from "../../../../../../clients/viem/getViemPublicClient";

type QuoteBuilderArgs = {
  dstEid: number;
  recipient: Address;
  amount: bigint;
  slippageBps?: number;
  transportMode?: "taxi" | "bus";
  strictMinAmount?: boolean;
};

const LAYERZERO_OAPP_ABI = [
  {
    name: "peers",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "eid", type: "uint32" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "endpoint",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const LAYERZERO_ENDPOINT_ABI = [
  {
    name: "getSendLibrary",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "dstEid", type: "uint32" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    name: "getConfig",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "oapp", type: "address" },
      { name: "lib", type: "address" },
      { name: "eid", type: "uint32" },
      { name: "configType", type: "uint32" },
    ],
    outputs: [{ type: "bytes" }],
  },
] as const;

export function deriveQuotedMinAmountLD(
  amountReceivedLD: bigint,
  slippageBps: number = 100
): bigint {
  return (amountReceivedLD * BigInt(10_000 - slippageBps)) / 10_000n;
}

function buildBaseQuoteSendParams(args: QuoteBuilderArgs): Pick<
  V2QuoteSendParams,
  "dstEid" | "to" | "amountLD" | "minAmountLD"
> {
  const slippageBps = args.slippageBps ?? 100;
  const minAmountLD = args.strictMinAmount
    ? args.amount
    : deriveQuotedMinAmountLD(args.amount, slippageBps);

  return {
    dstEid: args.dstEid,
    to: addressToBytes32(args.recipient),
    amountLD: args.amount,
    minAmountLD,
  };
}

export function buildOFTQuoteSendParams(args: QuoteBuilderArgs): V2QuoteSendParams {
  const transportMode = args.transportMode ?? "taxi";

  return {
    ...buildBaseQuoteSendParams(args),
    extraOptions: buildStargateTaxiExtraOptions(200000n),
    composeMsg: "0x",
    oftCmd: transportMode === "bus" ? "0x00" : "0x",
  };
}

export function buildBusAwareOftQuoteSendParams(args: QuoteBuilderArgs): V2QuoteSendParams {
  return buildOftQuoteParams({
    dstEid: args.dstEid,
    recipient: args.recipient,
    amount: args.amount,
    ...(args.transportMode != null ? { transportMode: args.transportMode } : {}),
  });
}

function getConfidenceScore(confidence: V2ResolutionConfidence): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function dedupeCandidates(candidates: Array<V2ExecutionCandidate | null>): V2ExecutionCandidate[] {
  const deduped = new Map<string, V2ExecutionCandidate>();

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const key = [
      candidate.executionTarget.toLowerCase(),
      candidate.executionTargetType,
      candidate.executionSurface,
      candidate.executionMode,
    ].join(":");

    const existing = deduped.get(key);
    if (
      !existing ||
      getConfidenceScore(candidate.identityConfidence) > getConfidenceScore(existing.identityConfidence)
    ) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()];
}

function summarizeQuoteValidationFailure(
  validation: Awaited<ReturnType<typeof validateQuoteSend>>
): string {
  switch (validation.classification) {
    case "capability_denied":
      return "quoteSend reported that the route or token is not provisioned for this destination.";
    case "param_invalid":
      return "quoteSend rejected the current execution options or amount constraints.";
    case "missing_function":
      return "The selected execution surface does not expose a compatible quoteSend entrypoint.";
    case "oft_like":
    case "reverted":
    case "unsupported":
    default:
      return "quoteSend reverted during final validation.";
  }
}

function buildUnknownRoutingGraph(reason?: string): V2RoutingGraphStatus {
  return {
    routeType: "unknown",
    routeWired: false,
    peer: null,
    endpoint: null,
    sendLibrary: null,
    executorConfigReady: false,
    dvnConfigReady: false,
    deadDvnPresent: false,
    configValid: false,
    ...(reason != null ? { reason } : {}),
  };
}

function buildAsset0RoutingGraph(reason?: string): V2RoutingGraphStatus {
  return {
    routeType: "asset0_hub",
    routeWired: false,
    peer: null,
    endpoint: null,
    sendLibrary: null,
    executorConfigReady: false,
    dvnConfigReady: false,
    deadDvnPresent: false,
    configValid: false,
    ...(reason != null ? { reason } : {}),
  };
}

function hasDeadDvnConfig(value: Hex | null | undefined): boolean {
  if (!hasNonZeroHex(value)) {
    return false;
  }

  const normalized = String(value).toLowerCase();
  return normalized.includes("000000000000000000000000000000000000dead");
}

function hasNonZeroHex(value: Hex | null | undefined): boolean {
  return typeof value === "string" && value !== "0x" && !/^0x0+$/i.test(value);
}

function parsePeerAddress(value: Hex | null | undefined): Address | null {
  if (!hasNonZeroHex(value)) {
    return null;
  }

  return getAddress(`0x${String(value).slice(-40)}`);
}

export function resolveDestinationTokenForV2Route(args: {
  srcToken: Address;
  candidate?: Pick<V2ExecutionCandidate, "executionSurface" | "executionMode"> | null;
  routingGraph?: Pick<V2RoutingGraphStatus, "routeType" | "peer"> | null;
}): Address {
  const normalizedSource = getAddress(args.srcToken);

  if (args.candidate?.executionSurface !== "oft") {
    return normalizedSource;
  }

  if (args.candidate.executionMode !== "v2_oft") {
    return normalizedSource;
  }

  if (args.routingGraph?.routeType !== "direct_peer" || !args.routingGraph.peer) {
    return normalizedSource;
  }

  return getAddress(args.routingGraph.peer);
}

async function inspectRoutingGraph(
  client: ReturnType<typeof getViemPublicClient>,
  candidate: V2ExecutionCandidate,
  dstEid: number
): Promise<V2RoutingGraphStatus> {
  if (candidate.executionSurface === "asset0") {
    return buildAsset0RoutingGraph(
      "Asset0 hub routing requires a hub composer configuration before it can be validated."
    );
  }

  if (candidate.executionSurface === "adapter" || candidate.executionTargetType === "router") {
    return buildOftAdapterRoutingGraph(candidate.executionTarget);
  }

  const routeType = "direct_peer";

  let peer: Address | null = null;
  if (routeType === "direct_peer") {
    try {
      const rawPeer = await client.readContract({
        address: candidate.executionTarget,
        abi: LAYERZERO_OAPP_ABI,
        functionName: "peers",
        args: [dstEid],
      });
      peer = parsePeerAddress(rawPeer as Hex);
    } catch (error) {
      return buildUnknownRoutingGraph(
        formatValidationReason([
          `Unable to inspect peers(${dstEid}) for ${candidate.executionTarget}.`,
          error instanceof Error ? error.message : String(error),
        ])
      );
    }
  }

  const routeWired = peer != null;
  if (!routeWired) {
    return {
      routeType,
      routeWired: false,
      peer,
      endpoint: null,
      sendLibrary: null,
      executorConfigReady: false,
      dvnConfigReady: false,
      deadDvnPresent: false,
      configValid: false,
      reason: `No LayerZero peer is configured for dstEid ${dstEid} on ${candidate.executionTarget}.`,
    };
  }

  let endpoint: Address | null = null;
  try {
    const resolvedEndpoint = await client.readContract({
      address: candidate.executionTarget,
      abi: LAYERZERO_OAPP_ABI,
      functionName: "endpoint",
    });
    endpoint = getAddress(resolvedEndpoint as Address);
  } catch (error) {
    const reason = formatValidationReason([
      `Route peer exists for dstEid ${dstEid}, but endpoint() could not be resolved.`,
      error instanceof Error ? error.message : String(error),
    ]);

    return {
      routeType,
      routeWired,
      peer,
      endpoint: null,
      sendLibrary: null,
      executorConfigReady: false,
      dvnConfigReady: false,
      deadDvnPresent: false,
      configValid: false,
      ...(reason != null ? { reason } : {}),
    };
  }

  let sendLibrary: Address | null = null;
  try {
    const resolvedSendLibrary = await client.readContract({
      address: endpoint,
      abi: LAYERZERO_ENDPOINT_ABI,
      functionName: "getSendLibrary",
      args: [candidate.executionTarget, dstEid],
    });

    const normalizedLibrary = getAddress(resolvedSendLibrary as Address);
    sendLibrary = normalizedLibrary.toLowerCase() === zeroAddress ? null : normalizedLibrary;
  } catch {
    sendLibrary = null;
  }

  let executorConfig: Hex | null = null;
  let dvnConfig: Hex | null = null;

  if (sendLibrary) {
    executorConfig = (await client
      .readContract({
        address: endpoint,
        abi: LAYERZERO_ENDPOINT_ABI,
        functionName: "getConfig",
        args: [candidate.executionTarget, sendLibrary, dstEid, 1],
      })
      .catch(() => null)) as Hex | null;

    dvnConfig = (await client
      .readContract({
        address: endpoint,
        abi: LAYERZERO_ENDPOINT_ABI,
        functionName: "getConfig",
        args: [candidate.executionTarget, sendLibrary, dstEid, 2],
      })
      .catch(() => null)) as Hex | null;
  }

  const deadDvnPresent = hasDeadDvnConfig(dvnConfig);
  const executorConfigReady = hasNonZeroHex(executorConfig);
  const dvnConfigReady = hasNonZeroHex(dvnConfig) && !deadDvnPresent;
  const configValid = sendLibrary != null && executorConfigReady && dvnConfigReady;

  const reason = !sendLibrary
    ? `Route peer exists for dstEid ${dstEid}, but no send library is configured on the LayerZero endpoint.`
    : !executorConfigReady
      ? `Route peer exists for dstEid ${dstEid}, but executor config is missing.`
      : deadDvnPresent
        ? `Route peer exists for dstEid ${dstEid}, but the DVN config contains the LayerZero dead DVN placeholder.`
        : !dvnConfigReady
          ? `Route peer exists for dstEid ${dstEid}, but DVN config is missing.`
          : undefined;

  return {
    routeType,
    routeWired,
    peer,
    endpoint,
    sendLibrary,
    executorConfigReady,
    dvnConfigReady,
    deadDvnPresent,
    configValid,
    ...(reason != null ? { reason } : {}),
  };
}

function selectPreferredCandidate(
  candidates: V2ExecutionCandidate[],
  preferredMode?: V2ExecutionCandidate["executionMode"]
): V2ExecutionCandidate | null {
  if (!candidates.length) {
    return null;
  }

  const scoped = preferredMode
    ? candidates.filter((candidate) => candidate.executionMode === preferredMode)
    : candidates;

  const sourceScore: Record<V2ExecutionCandidate["selectionSource"], number> = {
    registry: 4,
    token_capability: 3,
    surface_probe: 2,
    heuristic: 1,
    unknown: 0,
  };

  return (
    [...(scoped.length ? scoped : candidates)].sort((left, right) => {
    const leftSource = sourceScore[left.selectionSource] ?? 0;
    const rightSource = sourceScore[right.selectionSource] ?? 0;
    if (rightSource !== leftSource) {
      return rightSource - leftSource;
    }

    const identityDiff = getConfidenceScore(right.identityConfidence) - getConfidenceScore(left.identityConfidence);
    if (identityDiff !== 0) {
      return identityDiff;
    }

    if (left.executionTargetType !== right.executionTargetType) {
      return left.executionTargetType === "token" ? -1 : 1;
    }

    return 0;
    })[0] ?? null
  );
}

function shouldLogResolverDebug(): boolean {
  return process.env.STARGATE_RESOLVER_DEBUG === "true";
}

function logResolverAttribution(event: string, details: Record<string, unknown>): void {
  if (!shouldLogResolverDebug()) {
    return;
  }

  console.log("[stargate-v2-resolver]", event, details);
}

export async function resolveV2ExecutionTarget(
  args: ResolveV2ExecutionTargetArgs
): Promise<V2ExecutionTargetResolution> {
  const resolvedFrom = resolveChainKey(args.fromChain);
  const resolvedTo = resolveChainKey(args.toChain);
  const tokenAddress = getAddress(args.srcTokenAddress);
  const recipient = args.recipient ?? zeroAddress;
  const amount = args.amount ?? 1n;
  const dstEid = await getLayerZeroV2EndpointId(resolvedTo);
  const defaultDstToken = tokenAddress;
  const quoteArgs: QuoteBuilderArgs = {
    dstEid,
    recipient,
    amount,
    ...(args.slippageBps != null ? { slippageBps: args.slippageBps } : {}),
    ...(args.transportMode != null ? { transportMode: args.transportMode } : {}),
  };

  const routingHint = await resolveStargateOftRoutingHint(resolvedFrom, tokenAddress);
  const capability = await probeContractCapabilities({
    chain: resolvedFrom,
    address: tokenAddress,
    dstEid,
  }).catch(() => null);
  const chainProbe = await StargateIntrospector.probeChain(resolvedFrom).catch(() => null);
  const router = routingHint?.router ?? chainProbe?.router ?? zeroAddress;
  const executionModeConfidence = capability?.executionModeConfidence ?? capability?.confidence ?? "low";
  const lastQuoteError = capability?.lastQuoteError;

  const candidates = dedupeCandidates([
    resolveTaggedOftSurface({ tokenAddress, capability }),
    resolveOftSurface({ tokenAddress, capability, routingHint }),
    resolveAsset0Surface({ router, routingHint }),
    resolveOftAdapterSurface({ router, capability, routingHint }),
  ]);

  if (!candidates.length) {
    const asset0Reason =
      routingHint?.executionSurface === "asset0"
        ? `Token ${tokenAddress} appears to use Stargate Asset0 hub or multihop routing for ${resolvedFrom} -> ${resolvedTo}. Direct OFT execution is not available from peers(${dstEid}) or quoteSend().`
        : `No dynamic Stargate V2 capability was detected for ${tokenAddress} on ${resolvedFrom}.`;
    const attributionSource = routingHint?.executionSurface === "asset0" ? "asset0_overlay" : "probe_fallback";

    logResolverAttribution("no_candidates", {
      fromChain: resolvedFrom,
      toChain: resolvedTo,
      tokenAddress,
      attributionSource,
      reason: asset0Reason,
    });

    return {
      supported: false,
      confidence: routingHint?.executionSurface === "asset0" ? "medium" : "low",
      identityConfidence: routingHint?.executionSurface === "asset0" ? "medium" : "low",
      executionConfidence: capability?.confidence ?? "low",
      mechanism: "oft",
      router,
      dstToken: defaultDstToken,
      executionTarget: zeroAddress,
      executionTargetType: "unknown",
      executionSurface: "unknown",
      executionMode: "unknown",
      selectionSource: "unknown",
      attributionSource,
      executionModeConfidence,
      executionValid: false,
      ...(lastQuoteError != null ? { lastQuoteError } : {}),
      validationClassification: "unsupported",
      reason: asset0Reason,
      validationReason: asset0Reason,
      dstEid,
      nativeFee: 0n,
      routingGraph:
        routingHint?.executionSurface === "asset0"
          ? buildAsset0RoutingGraph(asset0Reason)
          : buildUnknownRoutingGraph("Dynamic capability probing did not find a direct OFT or adapter path."),
    };
  }

  const selected = selectPreferredCandidate(candidates);
  if (!selected) {
    logResolverAttribution("candidate_selection_failed", {
      fromChain: resolvedFrom,
      toChain: resolvedTo,
      tokenAddress,
      candidateCount: candidates.length,
      attributionSource: "unknown",
    });

    return {
      supported: false,
      confidence: "low",
      identityConfidence: "low",
      executionConfidence: "low",
      mechanism: "oft",
      router,
      executionTarget: zeroAddress,
      executionTargetType: "unknown",
      executionSurface: "unknown",
      executionMode: "unknown",
      selectionSource: "unknown",
      attributionSource: "unknown",
      executionModeConfidence,
      executionValid: false,
      ...(lastQuoteError != null ? { lastQuoteError } : {}),
      validationClassification: "unsupported",
      reason: "Unable to select a dynamic Stargate V2 execution surface.",
      validationReason: "Unable to select a dynamic Stargate V2 execution surface.",
      dstToken: defaultDstToken,
      dstEid,
      nativeFee: 0n,
      routingGraph: buildUnknownRoutingGraph("Execution surface selection did not yield a candidate."),
    };
  }

  logResolverAttribution("selected_candidate", {
    fromChain: resolvedFrom,
    toChain: resolvedTo,
    tokenAddress,
    executionMode: selected.executionMode,
    executionSurface: selected.executionSurface,
    selectionSource: selected.selectionSource,
    attributionSource: selected.attributionSource,
  });

  const client = getViemPublicClient(resolvedFrom);
  const routingGraph = await inspectRoutingGraph(client, selected, dstEid);
  const dstToken = resolveDestinationTokenForV2Route({
    srcToken: tokenAddress,
    candidate: selected,
    routingGraph,
  });
  const preflight = await buildExecutionPreflight({
    candidate: selected,
    quoteArgs,
    routingGraph,
    client,
  });

  if (!preflight.ready) {
    const graphReason =
      formatValidationReason([
        preflight.reason,
        `Dynamic ${selected.executionMode} surface selected via on-chain capability probing, but the execution preflight is not ready for ${resolvedFrom} -> ${resolvedTo}.`,
      ]) ??
      `Dynamic ${selected.executionMode} surface selected via on-chain capability probing, but the execution preflight is not ready for ${resolvedFrom} -> ${resolvedTo}.`;

    const canSurfaceAdapterCandidate =
      selected.executionMode === "v2_adapter" &&
      selected.executionTargetType === "router" &&
      selected.identityConfidence !== "low" &&
      selected.executionSurface === "adapter" &&
      routingGraph.routeWired;

    const canSurfaceAsset0Candidate =
      selected.executionMode === "v2_adapter" &&
      selected.executionTargetType === "router" &&
      selected.identityConfidence !== "low" &&
      selected.executionSurface === "asset0";

    if (canSurfaceAdapterCandidate || canSurfaceAsset0Candidate) {
      return {
        supported: true,
        confidence: selected.identityConfidence,
        identityConfidence: selected.identityConfidence,
        executionConfidence: deriveExecutionConfidenceFromPreflight(preflight),
        mechanism: "oft",
        router,
        dstToken,
        executionTarget: selected.executionTarget,
        executionTargetType: selected.executionTargetType,
        executionSurface: selected.executionSurface,
        executionMode: selected.executionMode,
        selectionSource: selected.selectionSource,
        attributionSource: selected.attributionSource,
        executionModeConfidence,
        executionValid: "unknown",
        ...(lastQuoteError != null ? { lastQuoteError } : {}),
        validationReason: graphReason,
        validationClassification: "unsupported",
        dstEid,
        nativeFee: 0n,
        params: preflight.params,
        preflight,
        routingGraph,
      };
    }

    return {
      supported: false,
      confidence: selected.identityConfidence,
      identityConfidence: selected.identityConfidence,
      executionConfidence: deriveExecutionConfidenceFromPreflight(preflight),
      mechanism: "oft",
      router,
      dstToken,
      executionTarget: selected.executionTarget,
      executionTargetType: selected.executionTargetType,
      executionSurface: selected.executionSurface,
      executionMode: selected.executionMode,
      selectionSource: selected.selectionSource,
      attributionSource: selected.attributionSource,
      executionModeConfidence,
      executionValid: false,
      ...(lastQuoteError != null ? { lastQuoteError } : {}),
      validationClassification: "unsupported",
      reason: graphReason,
      validationReason: graphReason,
      dstEid,
      nativeFee: 0n,
      params: preflight.params,
      preflight,
      routingGraph,
    };
  }

  const validation = await validateQuoteSend(client, selected.executionTarget, preflight.params);
  if (validation.status !== true) {
    const quoteError = validation.reason ?? lastQuoteError;
    const validationReason =
      formatValidationReason([
        `Routing graph is wired and ${selected.executionMode} was selected via dynamic capability probing.`,
        `The final quoteSend validation still failed, so treat this as an execution/config issue rather than route discovery.`,
        summarizeQuoteValidationFailure(validation),
      ]) ??
      `Routing graph is wired and ${selected.executionMode} was selected via dynamic capability probing, but the final quoteSend validation failed.`;

    const canSurfaceAdapterCandidate =
      selected.executionMode === "v2_adapter" &&
      selected.executionTargetType === "router" &&
      selected.identityConfidence !== "low" &&
      validation.classification !== "capability_denied";

    if (canSurfaceAdapterCandidate) {
      return {
        supported: true,
        confidence: selected.identityConfidence,
        identityConfidence: selected.identityConfidence,
        executionConfidence: deriveExecutionConfidenceFromPreflight(preflight),
        mechanism: "oft",
        router,
        dstToken,
        executionTarget: selected.executionTarget,
        executionTargetType: selected.executionTargetType,
        executionSurface: selected.executionSurface,
        executionMode: selected.executionMode,
        selectionSource: selected.selectionSource,
        attributionSource: selected.attributionSource,
        executionModeConfidence,
        executionValid: "unknown",
        ...(quoteError != null ? { lastQuoteError: quoteError } : {}),
        validationReason,
        validationClassification: validation.classification,
        dstEid,
        nativeFee: 0n,
        params: preflight.params,
        preflight,
        routingGraph,
      };
    }

    return {
      supported: false,
      confidence: selected.identityConfidence,
      identityConfidence: selected.identityConfidence,
      executionConfidence: deriveExecutionConfidenceFromPreflight(preflight),
      mechanism: "oft",
      router,
      dstToken,
      executionTarget: selected.executionTarget,
      executionTargetType: selected.executionTargetType,
      executionSurface: selected.executionSurface,
      executionMode: selected.executionMode,
      selectionSource: selected.selectionSource,
      attributionSource: selected.attributionSource,
      executionModeConfidence,
      executionValid: false,
      ...(quoteError != null ? { lastQuoteError: quoteError } : {}),
      validationClassification: validation.classification,
      reason: validationReason,
      validationReason,
      dstEid,
      nativeFee: 0n,
      params: preflight.params,
      preflight,
      routingGraph,
    };
  }

  return {
    supported: true,
    confidence: selected.identityConfidence,
    identityConfidence: selected.identityConfidence,
    executionConfidence: deriveExecutionConfidenceFromPreflight(preflight),
    mechanism: "oft",
    router,
    dstToken,
    executionTarget: selected.executionTarget,
    executionTargetType: selected.executionTargetType,
    executionSurface: selected.executionSurface,
    executionMode: selected.executionMode,
    selectionSource: selected.selectionSource,
    attributionSource: selected.attributionSource,
    executionModeConfidence,
    executionValid: true,
    ...(lastQuoteError != null ? { lastQuoteError } : {}),
    validationClassification: validation.classification,
    dstEid,
    nativeFee: validation.nativeFee,
    params: preflight.params,
    preflight,
    routingGraph,
  };
}
