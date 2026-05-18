import { Address, getAddress } from "viem";
import { SwapFamilyAdapter } from "../../core/adapters/SwapFamilyAdapter";
import { DetectorResult, SwapExecutionRequest, SwapQuote } from "../../core/SwapTypes";
import { resolveChainKey } from "../../../../clients/viem/viemChains";
 
interface ZeroExQuote {
  to: Address;
  data: `0x${string}`;
  value: string;
  buyAmount: string;
  sellAmount: string;
  allowanceTarget?: Address;
  gas?: string;
  estimatedGas?: string;
}

interface ZeroExQuoteV2Response {
  buyAmount?: string;
  sellAmount?: string;
  allowanceTarget?: Address;
  gas?: string;
  transaction?: {
    to?: Address;
    data?: `0x${string}`;
    value?: string;
    gas?: string;
  };
}

function get0xHost(chain: string): string | null {
  const resolved = resolveChainKey(chain);

  if (resolved === "ethereum") return "https://api.0x.org";
  if (resolved === "base") return "https://base.api.0x.org";
  if (resolved === "arbitrum") return "https://arbitrum.api.0x.org";
  if (resolved === "polygon") return "https://polygon.api.0x.org";

  return null;
}

async function fetch0xQuote(request: SwapExecutionRequest): Promise<ZeroExQuote> {
  const host = get0xHost(request.chain);
  if (!host) {
    throw new Error(`0x fallback is not configured for chain ${request.chain}.`);
  }

  const query = new URLSearchParams({
    sellToken: request.tokenIn,
    buyToken: request.tokenOut,
    takerAddress: request.sender,
    slippagePercentage: ((request.slippageBps ?? 100) / 10_000).toString(),
  });

  if (request.tradeType === "exact_in") {
    query.set("sellAmount", request.amount);
  } else {
    query.set("buyAmount", request.amount);
  }

  const endpoints = [
    { path: "/swap/v1/quote", headers: {} as Record<string, string> },
    { path: "/swap/allowance-holder/quote", headers: { "0x-version": "v2" } },
    { path: "/swap/permit2/quote", headers: { "0x-version": "v2" } },
  ];

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    const response = await fetch(`${host}${endpoint.path}?${query.toString()}`, {
      headers: {
        Accept: "application/json",
        ...endpoint.headers,
      },
    }).catch((error) => {
      errors.push(`${endpoint.path}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });

    if (!response) {
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      errors.push(`${endpoint.path}: status ${response.status} ${body}`);
      continue;
    }

    const payload = (await response.json()) as Partial<ZeroExQuote> & ZeroExQuoteV2Response;

    const to = payload.to ?? payload.transaction?.to;
    const data = payload.data ?? payload.transaction?.data;
    const value = payload.value ?? payload.transaction?.value ?? "0";
    const gas = payload.gas ?? payload.transaction?.gas;

    if (!to || !data || !payload.buyAmount || !payload.sellAmount) {
      errors.push(`${endpoint.path}: malformed quote payload`);
      continue;
    }

    const quote: ZeroExQuote = {
      to,
      data,
      value,
      buyAmount: payload.buyAmount,
      sellAmount: payload.sellAmount,
    };

    if (payload.allowanceTarget) {
      quote.allowanceTarget = payload.allowanceTarget;
    }

    if (gas) {
      quote.gas = gas;
    }

    if (payload.estimatedGas) {
      quote.estimatedGas = payload.estimatedGas;
    }

    return quote;
  }

  throw new Error(`0x quote failed on all endpoints. ${errors.join(" | ")}`);
}

export class Aggregator0xAdapter implements SwapFamilyAdapter {
  readonly family = "aggregator_0x" as const;

  detectSupport(detectorResult: DetectorResult): boolean {
    return detectorResult.family === this.family;
  }

  async getQuote(request: SwapExecutionRequest, detectorResult: DetectorResult): Promise<SwapQuote> {
    const quote = await fetch0xQuote(request);

    return {
      family: this.family,
      chain: request.chain,
      routerAddress: detectorResult.routerAddress,
      tokenIn: getAddress(request.tokenIn),
      tokenOut: getAddress(request.tokenOut),
      tradeType: request.tradeType,
      amountIn: quote.sellAmount,
      amountOut: quote.buyAmount,
      path: [getAddress(request.tokenIn), getAddress(request.tokenOut)],
      quoterAddress: null,
      source: "mixed",
      metadata: {
        source: "0x",
        allowanceTarget: quote.allowanceTarget ?? null,
      },
    };
  }

  async buildSwapTransaction(request: SwapExecutionRequest, _quote: SwapQuote): Promise<{
    to: Address;
    data: `0x${string}`;
    value: bigint;
    estimatedGas: bigint | null;
  }> {
    const quote = await fetch0xQuote(request);

    return {
      to: quote.to,
      data: quote.data,
      value: BigInt(quote.value || "0"),
      estimatedGas: BigInt(quote.estimatedGas ?? quote.gas ?? "0"),
    };
  }
}
