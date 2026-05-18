import { Address, encodeFunctionData, getAddress, parseAbi } from "viem";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";
import { SwapFamilyAdapter } from "../../core/adapters/SwapFamilyAdapter";
import { DetectorResult, SwapExecutionRequest, SwapQuote } from "../../core/SwapTypes";
import { encodeAlgebraPath } from "../../shared/encodeMultihopPath";

const ALGEBRA_ROUTER_ABI = parseAbi([
  "function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)) returns (uint256 amountOut)",
  "function exactInputSingle((address tokenIn,address tokenOut,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 limitSqrtPrice)) returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn,address tokenOut,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 limitSqrtPrice)) returns (uint256 amountIn)",
]);

const ALGEBRA_QUOTER_ABI = parseAbi([
  "function quoteExactInput(bytes path,uint256 amountIn) view returns (uint256 amountOut,uint16[] fees)",
  "function quoteExactInputSingle(address tokenIn,address tokenOut,uint256 amountIn,uint160 limitSqrtPrice) view returns (uint256 amountOut)",
  "function quoteExactOutputSingle(address tokenIn,address tokenOut,uint256 amountOut,uint160 limitSqrtPrice) view returns (uint256 amountIn)",
]);

function isMultiHop(request: SwapExecutionRequest): boolean {
  return Boolean(request.path?.length && request.path.length > 2);
}

function applySlippage(amount: bigint, bps: number, direction: "min" | "max"): bigint {
  if (direction === "min") {
    return (amount * BigInt(10_000 - bps)) / 10_000n;
  }

  return (amount * BigInt(10_000 + bps)) / 10_000n;
}

export class AlgebraAdapter implements SwapFamilyAdapter {
  readonly family = "algebra" as const;

  detectSupport(detectorResult: DetectorResult): boolean {
    return detectorResult.family === this.family;
  }

  async getQuote(request: SwapExecutionRequest, detectorResult: DetectorResult): Promise<SwapQuote> {
    const quoterAddress = detectorResult.quoterAddress ?? request.quoterAddress ?? null;

    if (!quoterAddress) {
      throw new Error("Algebra quote requires a quoter address in registry or request.");
    }

    const client = getViemPublicClient(request.chain);

    if (request.tradeType === "exact_in" && isMultiHop(request)) {
      const path = request.path!.map((token) => getAddress(token));
      const packedPath = encodeAlgebraPath(path);
      const [amountOut, fees] = await client.readContract({
        address: quoterAddress,
        abi: ALGEBRA_QUOTER_ABI,
        functionName: "quoteExactInput",
        args: [packedPath, BigInt(request.amount)],
      });

      return {
        family: this.family,
        chain: request.chain,
        routerAddress: detectorResult.routerAddress,
        tokenIn: getAddress(request.tokenIn),
        tokenOut: getAddress(request.tokenOut),
        tradeType: request.tradeType,
        amountIn: request.amount,
        amountOut: amountOut.toString(),
        path,
        quoterAddress,
        source: "onchain",
        metadata: {
          quoteFunction: "quoteExactInput",
          packedPath,
          fees: fees.map((fee) => Number(fee)),
        },
      };
    }

    if (request.tradeType === "exact_in") {
      const amountOut = await client.readContract({
        address: quoterAddress,
        abi: ALGEBRA_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [request.tokenIn, request.tokenOut, BigInt(request.amount), 0n],
      });

      return {
        family: this.family,
        chain: request.chain,
        routerAddress: detectorResult.routerAddress,
        tokenIn: getAddress(request.tokenIn),
        tokenOut: getAddress(request.tokenOut),
        tradeType: request.tradeType,
        amountIn: request.amount,
        amountOut: amountOut.toString(),
        path: [getAddress(request.tokenIn), getAddress(request.tokenOut)],
        quoterAddress,
        source: "onchain",
        metadata: { quoteFunction: "quoteExactInputSingle" },
      };
    }

    const amountIn = await client.readContract({
      address: quoterAddress,
      abi: ALGEBRA_QUOTER_ABI,
      functionName: "quoteExactOutputSingle",
      args: [request.tokenIn, request.tokenOut, BigInt(request.amount), 0n],
    });

    return {
      family: this.family,
      chain: request.chain,
      routerAddress: detectorResult.routerAddress,
      tokenIn: getAddress(request.tokenIn),
      tokenOut: getAddress(request.tokenOut),
      tradeType: request.tradeType,
      amountIn: amountIn.toString(),
      amountOut: request.amount,
      path: [getAddress(request.tokenIn), getAddress(request.tokenOut)],
      quoterAddress,
      source: "onchain",
      metadata: { quoteFunction: "quoteExactOutputSingle" },
    };
  }

  async buildSwapTransaction(request: SwapExecutionRequest, quote: SwapQuote): Promise<{
    to: Address;
    data: `0x${string}`;
    value: bigint;
    estimatedGas: bigint | null;
  }> {
    const slippageBps = request.slippageBps ?? 100;
    const deadline = Math.floor(Date.now() / 1000) + (request.deadlineSecondsFromNow ?? 20 * 60);

    const exactIn = request.tradeType === "exact_in";
    const amountIn = BigInt(quote.amountIn);
    const amountOut = BigInt(quote.amountOut);

    if (exactIn && isMultiHop(request)) {
      const path = request.path!.map((token) => getAddress(token));
      const packedPath = encodeAlgebraPath(path);
      const data = encodeFunctionData({
        abi: ALGEBRA_ROUTER_ABI,
        functionName: "exactInput",
        args: [
          {
            path: packedPath,
            recipient: request.recipient,
            deadline: BigInt(deadline),
            amountIn,
            amountOutMinimum: applySlippage(amountOut, slippageBps, "min"),
          },
        ],
      });

      const client = getViemPublicClient(request.chain);
      const estimatedGas =
        (await client
          .estimateGas({
            account: request.sender,
            to: request.routerAddress,
            data,
            value: 0n,
          })
          .catch(() => null)) ?? null;

      return {
        to: request.routerAddress,
        data,
        value: 0n,
        estimatedGas,
      };
    }

    const data = exactIn
      ? encodeFunctionData({
          abi: ALGEBRA_ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: getAddress(request.tokenIn),
              tokenOut: getAddress(request.tokenOut),
              recipient: request.recipient,
              deadline: BigInt(deadline),
              amountIn,
              amountOutMinimum: applySlippage(amountOut, slippageBps, "min"),
              limitSqrtPrice: 0n,
            },
          ],
        })
      : encodeFunctionData({
          abi: ALGEBRA_ROUTER_ABI,
          functionName: "exactOutputSingle",
          args: [
            {
              tokenIn: getAddress(request.tokenIn),
              tokenOut: getAddress(request.tokenOut),
              recipient: request.recipient,
              deadline: BigInt(deadline),
              amountOut,
              amountInMaximum: applySlippage(amountIn, slippageBps, "max"),
              limitSqrtPrice: 0n,
            },
          ],
        });

    const client = getViemPublicClient(request.chain);
    const estimatedGas =
      (await client
        .estimateGas({
          account: request.sender,
          to: request.routerAddress,
          data,
          value: 0n,
        })
        .catch(() => null)) ?? null;

    return {
      to: request.routerAddress,
      data,
      value: 0n,
      estimatedGas,
    };
  }
}
