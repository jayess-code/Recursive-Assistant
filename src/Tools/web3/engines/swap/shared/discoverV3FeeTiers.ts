import { Address, getAddress, parseAbi } from "viem";
import { getViemPublicClient } from "../../../clients/viem/getViemPublicClient";

/**
 * Standard Uniswap V3 fee tiers (in order of most common pool density).
 * Probed in this order so the most-likely-active pool wins first on ties.
 */
const COMMON_V3_FEE_TIERS = [500, 3000, 100, 10000] as const;

const V3_QUOTER_SINGLE_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)",
]);

/**
 * Result for a single discovered hop.
 */
export interface DiscoveredHopFee {
  tokenIn: Address;
  tokenOut: Address;
  feeTier: number;
  /** Raw amount-out returned by the quoter for the probe amount (used to rank tiers). */
  probeAmountOut: bigint;
}

/**
 * Discover the active fee tier for each hop in a Uniswap V3 multi-hop path by
 * probing `quoteExactInputSingle` with all common fee tiers.
 *
 * Each hop is probed in parallel across all fee tiers.  The tier yielding the
 * highest `amountOut` is chosen (better output = deeper pool = better trade
 * execution).  Throws if no active pool exists for any hop.
 *
 * @param chain         - Chain key (e.g. "polygon", "ethereum")
 * @param quoterAddress - Uniswap V3 Quoter V2 address for the target chain
 * @param path          - Ordered token addresses: [tokenA, tokenB, ...tokenN]
 * @param probeAmount   - Raw amount-in to use when probing the first hop.
 *                        Intermediate hops always use "1000" to avoid
 *                        liquidity-depth failures on large intermediate amounts.
 * @returns Array of discovered fee tiers, length = path.length - 1
 */
export async function discoverV3FeeTiers(
  chain: string,
  quoterAddress: Address,
  path: Address[],
  probeAmount = "10000"
): Promise<number[]> {
  if (path.length < 2) {
    throw new Error("discoverV3FeeTiers requires at least 2 tokens in path.");
  }

  const client = getViemPublicClient(chain);
  const discoveredHops: DiscoveredHopFee[] = [];

  for (let hopIndex = 0; hopIndex < path.length - 1; hopIndex += 1) {
    const hopTokenIn = path[hopIndex];
    const hopTokenOut = path[hopIndex + 1];
    if (!hopTokenIn || !hopTokenOut) {
      throw new Error(`discoverV3FeeTiers: Invalid path hop at index ${hopIndex}.`);
    }

    const tokenIn = getAddress(hopTokenIn);
    const tokenOut = getAddress(hopTokenOut);
    // Use a small fixed probe for non-first hops to avoid over-consuming
    // pool liquidity depth and getting revert-like zero-output results.
    const hopProbeAmount = hopIndex === 0 ? probeAmount : "1000";

    const tierResults = await Promise.allSettled(
      COMMON_V3_FEE_TIERS.map(async (fee) => {
        const amountOut = (await client.readContract({
          address: quoterAddress,
          abi: V3_QUOTER_SINGLE_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn,
              tokenOut,
              amountIn: BigInt(hopProbeAmount),
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })) as bigint;
        return { fee: Number(fee), amountOut };
      })
    );

    const validResults = tierResults
      .filter(
        (r): r is PromiseFulfilledResult<{ fee: number; amountOut: bigint }> =>
          r.status === "fulfilled" && r.value.amountOut > 0n
      )
      .sort((a, b) => (a.value.amountOut > b.value.amountOut ? -1 : 1)); // highest output first

    if (validResults.length === 0) {
      const tried = COMMON_V3_FEE_TIERS.join(", ");
      throw new Error(
        `discoverV3FeeTiers: No active V3 pool found for hop ${tokenIn} → ${tokenOut} on ${chain}. ` +
          `Tried fee tiers: ${tried}. Check that the pool exists and is initialised.`
      );
    }

    const bestResult = validResults[0];
    if (!bestResult) {
      throw new Error("discoverV3FeeTiers: Unable to determine best fee tier result.");
    }

    const best = bestResult.value;
    discoveredHops.push({
      tokenIn,
      tokenOut,
      feeTier: best.fee,
      probeAmountOut: best.amountOut,
    });
  }

  return discoveredHops.map((hop) => hop.feeTier);
}
