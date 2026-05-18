import {
  Address,
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";
import { SwapFamilyAdapter } from "../../core/adapters/SwapFamilyAdapter";
import { DetectorResult, SwapExecutionRequest, SwapQuote } from "../../core/SwapTypes";

const V2_QUOTE_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] memory path) view returns (uint256[] memory amounts)",
  "function getAmountsIn(uint256 amountOut, address[] memory path) view returns (uint256[] memory amounts)",
]);

const V2_SWAP_ABI = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
  "function swapTokensForExactTokens(uint256 amountOut,uint256 amountInMax,address[] path,address to,uint256 deadline)",
  "function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable",
  "function swapETHForExactTokens(uint256 amountOut,address[] path,address to,uint256 deadline) payable",
  "function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
  "function swapTokensForExactETH(uint256 amountOut,uint256 amountInMax,address[] path,address to,uint256 deadline)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
]);

function getPath(request: SwapExecutionRequest): Address[] {
  if (request.path?.length && request.path.length >= 2) {
    return request.path.map((token) => getAddress(token));
  }

  return [getAddress(request.tokenIn), getAddress(request.tokenOut)];
}

function isNativeToken(value: Address): boolean {
  const normalized = value.toLowerCase();
  return normalized === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

function applySlippage(amount: bigint, bps: number, direction: "min" | "max"): bigint {
  if (direction === "min") {
    return (amount * BigInt(10_000 - bps)) / 10_000n;
  }

  return (amount * BigInt(10_000 + bps)) / 10_000n;
}

export class UniswapV2Adapter implements SwapFamilyAdapter {
  readonly family = "uniswap_v2" as const;

  detectSupport(detectorResult: DetectorResult): boolean {
    return detectorResult.family === this.family;
  }

  async getQuote(request: SwapExecutionRequest, detectorResult: DetectorResult): Promise<SwapQuote> {
    const client = getViemPublicClient(request.chain);
    const path = getPath(request);

    if (request.tradeType === "exact_in") {
      const amountIn = BigInt(request.amount);
      const amounts = await client.readContract({
        address: detectorResult.routerAddress,
        abi: V2_QUOTE_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, path],
      });
      const last = amounts[amounts.length - 1];
      if (last === undefined) {
        throw new Error("Router returned empty quote amounts for exact_in request.");
      }

      return {
        family: this.family,
        chain: request.chain,
        routerAddress: detectorResult.routerAddress,
        tokenIn: getAddress(request.tokenIn),
        tokenOut: getAddress(request.tokenOut),
        tradeType: request.tradeType,
        amountIn: amountIn.toString(),
        amountOut: last.toString(),
        path,
        quoterAddress: null,
        source: "onchain",
        metadata: { quoteFunction: "getAmountsOut" },
      };
    }

    const amountOut = BigInt(request.amount);
    const amounts = await client.readContract({
      address: detectorResult.routerAddress,
      abi: V2_QUOTE_ABI,
      functionName: "getAmountsIn",
      args: [amountOut, path],
    });
    const first = amounts[0];
    if (first === undefined) {
      throw new Error("Router returned empty quote amounts for exact_out request.");
    }

    return {
      family: this.family,
      chain: request.chain,
      routerAddress: detectorResult.routerAddress,
      tokenIn: getAddress(request.tokenIn),
      tokenOut: getAddress(request.tokenOut),
      tradeType: request.tradeType,
      amountIn: first.toString(),
      amountOut: amountOut.toString(),
      path,
      quoterAddress: null,
      source: "onchain",
      metadata: { quoteFunction: "getAmountsIn" },
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
    const path = quote.path;
    const pathTokenIn = path[0];
    const pathTokenOut = path[path.length - 1];
    if (!pathTokenIn || !pathTokenOut) {
      throw new Error("Quote path must include at least two token addresses.");
    }

    const tokenInIsNative = isNativeToken(pathTokenIn);
    const tokenOutIsNative = isNativeToken(pathTokenOut);
    const exactIn = request.tradeType === "exact_in";
    const useFoTPath = exactIn && (request.feeOnTransferTokenIn === true || request.feeOnTransferTokenOut === true);

    const amountIn = BigInt(quote.amountIn);
    const amountOut = BigInt(quote.amountOut);

    let data: `0x${string}`;
    let value = 0n;

    if (exactIn) {
      const minOut = applySlippage(amountOut, slippageBps, "min");

      if (tokenInIsNative) {
        if (useFoTPath) {
          data = encodeFunctionData({
            abi: V2_SWAP_ABI,
            functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
            args: [minOut, path, request.recipient, BigInt(deadline)],
          });
        } else {
          data = encodeFunctionData({
            abi: V2_SWAP_ABI,
            functionName: "swapExactETHForTokens",
            args: [minOut, path, request.recipient, BigInt(deadline)],
          });
        }
        value = amountIn;
      } else if (tokenOutIsNative) {
        if (useFoTPath) {
          data = encodeFunctionData({
            abi: V2_SWAP_ABI,
            functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
            args: [amountIn, minOut, path, request.recipient, BigInt(deadline)],
          });
        } else {
          data = encodeFunctionData({
            abi: V2_SWAP_ABI,
            functionName: "swapExactTokensForETH",
            args: [amountIn, minOut, path, request.recipient, BigInt(deadline)],
          });
        }
      } else {
        if (useFoTPath) {
          data = encodeFunctionData({
            abi: V2_SWAP_ABI,
            functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
            args: [amountIn, minOut, path, request.recipient, BigInt(deadline)],
          });
        } else {
          data = encodeFunctionData({
            abi: V2_SWAP_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountIn, minOut, path, request.recipient, BigInt(deadline)],
          });
        }
      }
    } else {
      const maxIn = applySlippage(amountIn, slippageBps, "max");

      if (tokenInIsNative) {
        data = encodeFunctionData({
          abi: V2_SWAP_ABI,
          functionName: "swapETHForExactTokens",
          args: [amountOut, path, request.recipient, BigInt(deadline)],
        });
        value = maxIn;
      } else if (tokenOutIsNative) {
        data = encodeFunctionData({
          abi: V2_SWAP_ABI,
          functionName: "swapTokensForExactETH",
          args: [amountOut, maxIn, path, request.recipient, BigInt(deadline)],
        });
      } else {
        data = encodeFunctionData({
          abi: V2_SWAP_ABI,
          functionName: "swapTokensForExactTokens",
          args: [amountOut, maxIn, path, request.recipient, BigInt(deadline)],
        });
      }
    }

    const client = getViemPublicClient(request.chain);
    const estimatedGas =
      (await client
        .estimateGas({
          account: request.sender,
          to: request.routerAddress,
          data,
          value,
        })
        .catch(() => null)) ?? null;

    return {
      to: request.routerAddress,
      data,
      value,
      estimatedGas,
    };
  }
}
