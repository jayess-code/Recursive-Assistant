import { Address, getAddress, maxUint256, parseAbi } from "viem";
import { getViemPublicClient } from "../../../clients/viem/getViemPublicClient";
import { detectSwapFamily } from "../detection/detectSwapFamily";
import { SwapFamilyAdapter } from "./adapters/SwapFamilyAdapter";
import {
  ApprovalRequirement,
  DetectorResult,
  ExecutableSwapRoute,
  SwapExecutionPlan,
  SwapExecutionRequest,
  SwapPolicy,
  SwapQuote,
} from "./SwapTypes";
import { UniswapV2Adapter } from "../families/uniswapV2/UniswapV2Adapter";
import { UniswapV3Adapter } from "../families/uniswapV3/UniswapV3Adapter";
import { AlgebraAdapter } from "../families/algebra/AlgebraAdapter";
import { validateExecutionRoute } from "./validateExecutionRoute";
// Aggregator0xAdapter requires a 0x API key (KYC) — re-enable when available

const ERC20_ALLOWANCE_ABI = parseAbi([
  "function allowance(address owner,address spender) view returns (uint256)",
]);

const ERC20_APPROVE_ABI = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
]);

const DEFAULT_POLICY: SwapPolicy = {
  minSlippageBps: 5,
  maxSlippageBps: 2_000,
  defaultSlippageBps: 100,
  defaultDeadlineSecondsFromNow: 20 * 60,
  minDetectionConfidence: "medium",
};

function confidenceScore(value: "high" | "medium" | "low"): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function isNativePseudoAddress(address: Address): boolean {
  return address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

function resolveAdapter(adapters: SwapFamilyAdapter[], detector: DetectorResult): SwapFamilyAdapter {
  const adapter = adapters.find((candidate) => candidate.detectSupport(detector));
  if (!adapter) {
    throw new Error(
      `No active adapter for swap family '${detector.family}' on router ${detector.routerAddress}. ` +
      `The adapter for this family may require additional configuration (e.g. API key).`
    );
  }

  return adapter;
}

export class SwapExecutionEngine {
  private readonly adapters: SwapFamilyAdapter[];
  private readonly policy: SwapPolicy;

  constructor(policy: Partial<SwapPolicy> = {}) {
    this.adapters = [
      new UniswapV2Adapter(),
      new UniswapV3Adapter(),
      new AlgebraAdapter(),
      // new Aggregator0xAdapter(), // requires 0x API key (KYC) — re-enable when available
    ];
    this.policy = {
      ...DEFAULT_POLICY,
      ...policy,
    };
  }

  async detect(request: SwapExecutionRequest): Promise<DetectorResult> {
    return detectSwapFamily(request);
  }

  async quote(request: SwapExecutionRequest): Promise<{ detector: DetectorResult; quote: SwapQuote }> {
    const detector = await this.detect(request);
    if (detector.supportStatus === "unsupported") {
      throw new Error(`Swap family is unsupported for router ${request.routerAddress}.`);
    }

    this.assertDetectionPolicy(detector, request.allowLowConfidence === true);
    const route = this.validateRoute(request, detector);
    const normalizedRequest = this.applyValidatedRoute(request, route);

    const adapter = resolveAdapter(this.adapters, detector);
    const quote = await adapter.getQuote(normalizedRequest, detector);

    quote.metadata = {
      ...quote.metadata,
      routePath: route.path,
      routeFeeTiers: route.feeTiers,
      atomicExecutable: route.atomicExecutable,
      routeReason: route.reason ?? null,
    };

    return { detector, quote };
  }

  async build(request: SwapExecutionRequest): Promise<SwapExecutionPlan> {
    const detector = await this.detect(request);
    if (detector.supportStatus === "unsupported") {
      throw new Error(`Swap family is unsupported for router ${request.routerAddress}.`);
    }

    this.assertDetectionPolicy(detector, request.allowLowConfidence === true);
    const route = this.validateRoute(request, detector);
    const normalizedRequest = this.applyValidatedRoute(request, route);

    const adapter = resolveAdapter(this.adapters, detector);
    const quote = await adapter.getQuote(normalizedRequest, detector);
    quote.metadata = {
      ...quote.metadata,
      routePath: route.path,
      routeFeeTiers: route.feeTiers,
      atomicExecutable: route.atomicExecutable,
      routeReason: route.reason ?? null,
    };

    const artifacts = await adapter.buildSwapTransaction(normalizedRequest, quote, detector);
    const slippageBps = normalizedRequest.slippageBps ?? this.policy.defaultSlippageBps;
    const deadline = Math.floor(Date.now() / 1000) +
      (normalizedRequest.deadlineSecondsFromNow ?? this.policy.defaultDeadlineSecondsFromNow);

    this.assertSlippage(slippageBps);

    const approval = await this.buildApprovalRequirement(normalizedRequest, artifacts.to, quote.amountIn, detector.family);
    const steps: SwapExecutionPlan["steps"] = [];

    if (approval.required) {
      steps.push({
        type: "approval",
        tool: "write_contract",
        description: "Approve token allowance for swap spender",
        args: {
          chain: normalizedRequest.chain,
          address: approval.token,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [approval.spender, approval.amount],
          dryRun: normalizedRequest.dryRun ?? true,
        },
      });
    }

    steps.push({
      type: "swap",
      tool: "send_transaction",
      description: "Execute swap transaction with deterministic calldata",
      args: {
        chain: normalizedRequest.chain,
        to: artifacts.to,
        data: artifacts.data,
        value: artifacts.value.toString(),
        dryRun: normalizedRequest.dryRun ?? true,
      },
    });

    return {
      chain: normalizedRequest.chain,
      family: detector.family,
      supportStatus: detector.supportStatus,
      confidence: detector.confidence,
      source: quote.source,
      routerAddress: detector.routerAddress,
      tokenIn: getAddress(normalizedRequest.tokenIn),
      tokenOut: getAddress(normalizedRequest.tokenOut),
      tradeType: normalizedRequest.tradeType,
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      slippageBps,
      deadline,
      approval,
      artifacts,
      steps,
      warnings: detector.supportStatus === "known_not_executable" ? ["Detection confidence is low."] : [],
      metadata: {
        detectorReasons: detector.reasons,
        detectorSignals: detector.signals,
        route,
        quoteMetadata: quote.metadata,
      },
    };
  }

  private validateRoute(request: SwapExecutionRequest, detector: DetectorResult): ExecutableSwapRoute {
    const route = validateExecutionRoute(request, detector);

    if (request.path?.length && request.path.length > 2 && !route.atomicExecutable) {
      throw new Error(route.reason ?? "Requested multi-hop route is not atomically executable.");
    }

    return route;
  }

  private applyValidatedRoute(
    request: SwapExecutionRequest,
    route: ExecutableSwapRoute
  ): SwapExecutionRequest {
    const tokenIn = route.path[0];
    const tokenOut = route.path[route.path.length - 1];

    if (!tokenIn || !tokenOut) {
      throw new Error("Validated route must contain at least two token addresses.");
    }

    return {
      ...request,
      tokenIn,
      tokenOut,
      path: route.path,
      feeTiers: route.feeTiers,
    };
  }

  private assertDetectionPolicy(detector: DetectorResult, allowLowConfidence: boolean) {
    if (allowLowConfidence) {
      return;
    }

    if (confidenceScore(detector.confidence) < confidenceScore(this.policy.minDetectionConfidence)) {
      throw new Error(
        `Detection confidence ${detector.confidence} is below policy minimum ${this.policy.minDetectionConfidence}.`
      );
    }
  }

  private assertSlippage(slippageBps: number) {
    if (slippageBps < this.policy.minSlippageBps || slippageBps > this.policy.maxSlippageBps) {
      throw new Error(
        `Slippage ${slippageBps} bps is outside allowed policy bounds ${this.policy.minSlippageBps}-${this.policy.maxSlippageBps}.`
      );
    }
  }

  private async buildApprovalRequirement(
    request: SwapExecutionRequest,
    spender: Address,
    amountIn: string,
    family: string
  ): Promise<ApprovalRequirement> {
    const token = getAddress(request.tokenIn);
    if (isNativePseudoAddress(token) || family === "aggregator_0x") {
      return {
        required: false,
        token,
        spender,
        owner: getAddress(request.sender),
        amount: "0",
        currentAllowance: maxUint256.toString(),
      };
    }

    const client = getViemPublicClient(request.chain);
    const owner = getAddress(request.sender);
    const currentAllowance = await client
      .readContract({
        address: token,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [owner, spender],
      })
      .catch(() => 0n);

    const requiredAmount = BigInt(amountIn);

    return {
      required: currentAllowance < requiredAmount,
      token,
      spender,
      owner,
      amount: requiredAmount.toString(),
      currentAllowance: currentAllowance.toString(),
    };
  }
}
