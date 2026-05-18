import { Address, encodeFunctionData, getAddress, parseAbi } from "viem";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";
import { SwapFamilyAdapter } from "../../core/adapters/SwapFamilyAdapter";
import { DetectorResult, SwapExecutionRequest, SwapQuote } from "../../core/SwapTypes";
import { encodeV3Path } from "../../shared/encodeMultihopPath";

// SwapRouter01 — deadline is a field inside the params struct
// e.g. 0xE592427A0AEce92De3Edee1F18E0157C05861564 (Ethereum)
const V3_ROUTER01_ABI = parseAbi([
  "function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)",
]);

// SwapRouter02 — deadline removed from params struct; set via top-level deadline param or omitted
// e.g. 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 (Ethereum, Polygon, Base, etc.)
const V3_ROUTER02_ABI = parseAbi([
  "function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)",
]);

// Canonical SwapRouter02 addresses across all chains
const SWAP_ROUTER02_ADDRESSES = new Set([
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
]);

function isRouter02(routerAddress: Address): boolean {
  return SWAP_ROUTER02_ADDRESSES.has(routerAddress.toLowerCase());
}

const V3_QUOTER_ABI = parseAbi([
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)",
  "function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountIn)",
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

export class UniswapV3Adapter implements SwapFamilyAdapter {
  readonly family = "uniswap_v3" as const;

  detectSupport(detectorResult: DetectorResult): boolean {
    return detectorResult.family === this.family;
  }

  async getQuote(request: SwapExecutionRequest, detectorResult: DetectorResult): Promise<SwapQuote> {
    const quoterAddress = detectorResult.quoterAddress ?? request.quoterAddress ?? null;

    if (!quoterAddress) {
      throw new Error("Uniswap V3 quote requires a quoter address in registry or request.");
    }

    const fee = request.feeTier ?? 3000;
    const client = getViemPublicClient(request.chain);

    if (request.tradeType === "exact_in" && isMultiHop(request)) {
      const path = request.path!.map((token) => getAddress(token));
      const feeTiers = request.feeTiers ?? [];
      const packedPath = encodeV3Path(path, feeTiers);
      const quote = (await client.readContract({
        address: quoterAddress,
        abi: V3_QUOTER_ABI,
        functionName: "quoteExactInput",
        args: [packedPath, BigInt(request.amount)],
      })) as readonly [bigint, readonly bigint[], readonly bigint[], bigint];
      const [amountOut, , , gasEstimate] = quote;

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
          feeTiers,
          quoteFunction: "quoteExactInput",
          gasEstimate: gasEstimate.toString(),
          packedPath,
        },
      };
    }

    if (request.tradeType === "exact_in") {
      const amountOut = (await client.readContract({
        address: quoterAddress,
        abi: V3_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: getAddress(request.tokenIn),
            tokenOut: getAddress(request.tokenOut),
            amountIn: BigInt(request.amount),
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })) as bigint;

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
        metadata: { feeTier: fee, quoteFunction: "quoteExactInputSingle" },
      };
    }

    const amountIn = (await client.readContract({
      address: quoterAddress,
      abi: V3_QUOTER_ABI,
      functionName: "quoteExactOutputSingle",
      args: [
        {
          tokenIn: getAddress(request.tokenIn),
          tokenOut: getAddress(request.tokenOut),
          amount: BigInt(request.amount),
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })) as bigint;

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
      metadata: { feeTier: fee, quoteFunction: "quoteExactOutputSingle" },
    };
  }

  async buildSwapTransaction(request: SwapExecutionRequest, quote: SwapQuote): Promise<{
    to: Address;
    data: `0x${string}`;
    value: bigint;
    estimatedGas: bigint | null;
  }> {
    const fee = request.feeTier ?? 3000;
    const slippageBps = request.slippageBps ?? 100;
    const deadline = Math.floor(Date.now() / 1000) + (request.deadlineSecondsFromNow ?? 20 * 60);
    const router02 = isRouter02(request.routerAddress);

    const exactIn = request.tradeType === "exact_in";
    const amountIn = BigInt(quote.amountIn);
    const amountOut = BigInt(quote.amountOut);

    if (exactIn && isMultiHop(request)) {
      const path = request.path!.map((token) => getAddress(token));
      const packedPath = encodeV3Path(path, request.feeTiers ?? []);
      const data = router02
        ? encodeFunctionData({
            abi: V3_ROUTER02_ABI,
            functionName: "exactInput",
            args: [
              {
                path: packedPath,
                recipient: request.recipient,
                amountIn,
                amountOutMinimum: applySlippage(amountOut, slippageBps, "min"),
              },
            ],
          })
        : encodeFunctionData({
            abi: V3_ROUTER01_ABI,
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
      ? router02
        ? encodeFunctionData({
            abi: V3_ROUTER02_ABI,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn: getAddress(request.tokenIn),
                tokenOut: getAddress(request.tokenOut),
                fee,
                recipient: request.recipient,
                amountIn,
                amountOutMinimum: applySlippage(amountOut, slippageBps, "min"),
                sqrtPriceLimitX96: 0n,
              },
            ],
          })
        : encodeFunctionData({
            abi: V3_ROUTER01_ABI,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn: getAddress(request.tokenIn),
                tokenOut: getAddress(request.tokenOut),
                fee,
                recipient: request.recipient,
                deadline: BigInt(deadline),
                amountIn,
                amountOutMinimum: applySlippage(amountOut, slippageBps, "min"),
                sqrtPriceLimitX96: 0n,
              },
            ],
          })
      : router02
        ? encodeFunctionData({
            abi: V3_ROUTER02_ABI,
            functionName: "exactOutputSingle",
            args: [
              {
                tokenIn: getAddress(request.tokenIn),
                tokenOut: getAddress(request.tokenOut),
                fee,
                recipient: request.recipient,
                amountOut,
                amountInMaximum: applySlippage(amountIn, slippageBps, "max"),
                sqrtPriceLimitX96: 0n,
              },
            ],
          })
        : encodeFunctionData({
            abi: V3_ROUTER01_ABI,
            functionName: "exactOutputSingle",
            args: [
              {
                tokenIn: getAddress(request.tokenIn),
                tokenOut: getAddress(request.tokenOut),
                fee,
                recipient: request.recipient,
                deadline: BigInt(deadline),
                amountOut,
                amountInMaximum: applySlippage(amountIn, slippageBps, "max"),
                sqrtPriceLimitX96: 0n,
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
