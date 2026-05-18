import { Abi, getAddress, toFunctionSelector } from "viem";
import { getViemPublicClient } from "../../../clients/viem/getViemPublicClient";
import { resolveChainKey } from "../../../clients/viem/viemChains";
import { getAlchemyBaseUrl } from "../../../utils/alchemy/alchemyChainResolver";
import { 
  DetectionSignal,
  DetectorResult,
  SwapExecutionFamily,
  SwapExecutionRequest,
} from "../core/SwapTypes";
import { findRouterRegistryEntry } from "../discovery/routerRegistry";
import { findDynamicRouterCandidate } from "../discovery/dynamicRouterCandidates";

const V2_METHODS = new Set(["getAmountsOut", "getAmountsIn", "swapExactTokensForTokens", "swapExactETHForTokens"]);
const V3_METHODS = new Set(["exactInput", "exactInputSingle", "exactOutput", "exactOutputSingle"]);
const ALGEBRA_METHODS = new Set(["exactInputSingleSupportingFeeOnTransferTokens", "exactInputSingle", "exactOutputSingle"]);

const V2_SELECTORS = new Set([
  toFunctionSelector("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"),
  toFunctionSelector("swapTokensForExactTokens(uint256,uint256,address[],address,uint256)"),
]);

const V3_SELECTORS = new Set([
  toFunctionSelector(
    "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"
  ),
  toFunctionSelector(
    "exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"
  ),
]);

const ALGEBRA_SELECTORS = new Set([
  toFunctionSelector(
    "exactInputSingle((address,address,address,uint256,uint256,uint256,uint160))"
  ),
  toFunctionSelector(
    "exactOutputSingle((address,address,address,uint256,uint256,uint256,uint160))"
  ),
]);

function extractSignalsFromAbi(abi: readonly unknown[] | null | undefined): {
  methods: Set<string>;
  selectors: Set<`0x${string}`>;
} {
  const methods = new Set<string>();
  const selectors = new Set<`0x${string}`>();

  if (!abi?.length) {
    return { methods, selectors };
  }

  for (const entry of abi as Abi) {
    if (!entry || entry.type !== "function") {
      continue;
    }

    methods.add(String(entry.name));

    try {
      const inputs = (entry.inputs ?? []).map((input) => input.type).join(",");
      const signature = `${entry.name}(${inputs})`;
      selectors.add(toFunctionSelector(signature));
    } catch {
      continue;
    }
  }

  return { methods, selectors };
}

function scoreFamily(
  family: SwapExecutionFamily,
  methods: Set<string>,
  selectors: Set<`0x${string}`>
): { score: number; signals: DetectionSignal[] } {
  const signals: DetectionSignal[] = [];
  let score = 0;

  const methodSet = family === "uniswap_v2" ? V2_METHODS : family === "uniswap_v3" ? V3_METHODS : ALGEBRA_METHODS;
  const selectorSet = family === "uniswap_v2" ? V2_SELECTORS : family === "uniswap_v3" ? V3_SELECTORS : ALGEBRA_SELECTORS;

  for (const method of methodSet) {
    if (methods.has(method)) {
      score += 12;
      signals.push({
        type: "abi_method",
        key: method,
        value: "present",
        weight: 12,
      });
    }
  }

  for (const selector of selectorSet) {
    if (selectors.has(selector)) {
      score += 25;
      signals.push({
        type: "selector",
        key: selector,
        value: "present",
        weight: 25,
      });
    }
  }

  return { score, signals };
}

function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export async function detectSwapFamily(args: SwapExecutionRequest): Promise<DetectorResult> {
  const chain = resolveChainKey(args.chain);
  const routerAddress = getAddress(args.routerAddress);
  const resolvedBaseUrl = getAlchemyBaseUrl(chain);

  if (!resolvedBaseUrl) {
    return {
      family: "unknown",
      supportStatus: "unsupported",
      confidence: "low",
      identitySource: "none",
      reasons: [`Chain ${chain} is not supported by configured Alchemy resolution.`],
      signals: [],
      chain,
      routerAddress,
      quoterAddress: null,
    };
  }

  const dynamicMatch = findDynamicRouterCandidate(chain, routerAddress);
  if (dynamicMatch && dynamicMatch.family !== "unknown" && dynamicMatch.verifiedOnchain) {
    return {
      family: dynamicMatch.family,
      supportStatus: "supported",
      confidence: dynamicMatch.confidence,
      identitySource: "dynamic_verified",
      reasons: ["Router matched dynamically discovered and onchain-verified metadata."],
      signals: [
        {
          type: "dynamic",
          key: "routerAddress",
          value: dynamicMatch.label,
          weight: 90,
        },
      ],
      chain,
      routerAddress,
      quoterAddress: dynamicMatch.quoterAddress ?? null,
    };
  }

  const registryMatch = findRouterRegistryEntry(chain, routerAddress);
  if (registryMatch) {
    return {
      family: registryMatch.family,
      supportStatus: "supported",
      confidence: "high",
      identitySource: "registry",
      reasons: ["Router matched curated family registry."],
      signals: [
        {
          type: "registry",
          key: "routerAddress",
          value: registryMatch.label,
          weight: 100,
        },
      ],
      chain,
      routerAddress,
      quoterAddress: registryMatch.quoterAddress ?? null,
    };
  }

  if (dynamicMatch && dynamicMatch.family !== "unknown") {
    return {
      family: dynamicMatch.family,
      supportStatus: "known_not_executable",
      confidence: dynamicMatch.confidence,
      identitySource: "dynamic_hint",
      reasons: ["Router matched dynamically discovered metadata without onchain verification."],
      signals: [
        {
          type: "dynamic",
          key: "routerAddress",
          value: dynamicMatch.label,
          weight: 55,
        },
      ],
      chain,
      routerAddress,
      quoterAddress: dynamicMatch.quoterAddress ?? null,
    };
  }

  const client = getViemPublicClient(chain);
  const code = await client.getCode({ address: routerAddress }).catch(() => null);

  if (!code || code === "0x") {
    return {
      family: "unknown",
      supportStatus: "unsupported",
      confidence: "low",
      identitySource: "none",
      reasons: ["Router address does not have deployed bytecode on target chain."],
      signals: [],
      chain,
      routerAddress,
      quoterAddress: null,
    };
  }

  const { methods, selectors } = extractSignalsFromAbi(args.abi);
  const v2Score = scoreFamily("uniswap_v2", methods, selectors);
  const v3Score = scoreFamily("uniswap_v3", methods, selectors);
  const algebraScore = scoreFamily("algebra", methods, selectors);

  const scored = [
    { family: "uniswap_v2" as const, ...v2Score },
    { family: "uniswap_v3" as const, ...v3Score },
    { family: "algebra" as const, ...algebraScore },
  ].sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score <= 0) {
    return {
      family: "unknown",
      supportStatus: "known_not_executable",
      confidence: "low",
      identitySource: "none",
      reasons: ["No known family selectors or ABI methods were detected."],
      signals: [],
      chain,
      routerAddress,
      quoterAddress: null,
    };
  }

  const confidence = confidenceFromScore(best.score);

  return {
    family: best.family,
    supportStatus: confidence === "low" ? "known_not_executable" : "supported",
    confidence,
    identitySource: best.signals.some((signal) => signal.type === "selector") ? "selector" : "abi",
    reasons: ["Family detected via ABI/function selector fingerprinting."],
    signals: best.signals,
    chain,
    routerAddress,
    quoterAddress: args.quoterAddress ?? null,
  };
}
