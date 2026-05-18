/**
 * ROUTING_TOKENS.ts
 *
 * Allowlist of trusted intermediate (relay/bridge) tokens per chain.
 * Used by multi-hop route discovery to filter candidates before scoring
 * by liquidity. Only tokens in this list may be used as intermediate hops.
 *
 * Ordering within each chain array is priority — the bridge candidate
 * scorer should prefer tokens that appear earlier when scores are tied.
 *
 * Tokens must NOT be added here if:
 *  - Their contract has transfer restrictions that affect pool-to-pool hops (e.g. blacklisted USDC.e pools)
 *  - They are deprecated bridged variants with known execution failures
 *  - They have pausable transfers controlled by a centralised issuer who has
 *    already paused or blacklisted relevant pool addresses
 */

export interface RoutingToken {
  address: `0x${string}`;
  symbol: string;
  /** Lower number = higher preference as intermediate hop */
  priority: number;
}

export const ROUTING_TOKENS: Record<string, RoutingToken[]> = {
  polygon: [
    {
      // Wrapped Ether — deepest cross-pair liquidity on Polygon
      address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
      symbol: "WETH",
      priority: 1,
    },
    {
      // Wrapped POL — native gas token wrapper, wide DEX coverage
      address: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
      symbol: "WPOL",
      priority: 2,
    },
    {
      // Native USDC (Circle-issued) — safe transfer, not blacklisted
      address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      symbol: "USDC",
      priority: 3,
    },
    {
      // USDT (PoS) — broad stablecoin pool coverage
      address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      symbol: "USDT",
      priority: 4,
    },
    {
      // DAI — additional stablecoin coverage
      address: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
      symbol: "DAI",
      priority: 5,
    },
    // ❌ USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) is intentionally excluded.
    //    Circle has blacklisted certain Uniswap V3 pool addresses on this contract,
    //    causing "TF" (Transfer Failed) reverts on mid-route transfers despite
    //    the pools having significant TVL. Do not add it back.
  ],

  mainnet: [
    {
      address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      symbol: "WETH",
      priority: 1,
    },
    {
      address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      symbol: "USDC",
      priority: 2,
    },
    {
      address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      symbol: "USDT",
      priority: 3,
    },
    {
      address: "0x6b175474e89094c44da98b954eedeac495271d0f",
      symbol: "DAI",
      priority: 4,
    },
    {
      address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
      symbol: "WBTC",
      priority: 5,
    },
  ],

  arbitrum: [
    {
      address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      symbol: "WETH",
      priority: 1,
    },
    {
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      symbol: "USDC",
      priority: 2,
    },
    {
      address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      symbol: "USDT",
      priority: 3,
    },
    {
      address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
      symbol: "DAI",
      priority: 4,
    },
    {
      address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
      symbol: "WBTC",
      priority: 5,
    },
  ],

  optimism: [
    {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      priority: 1,
    },
    {
      address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      symbol: "USDC",
      priority: 2,
    },
    {
      address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
      symbol: "USDT",
      priority: 3,
    },
    {
      address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
      symbol: "DAI",
      priority: 4,
    },
  ],

  base: [
    {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      priority: 1,
    },
    {
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      symbol: "USDC",
      priority: 2,
    },
    {
      address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
      symbol: "DAI",
      priority: 3,
    },
  ],

  bsc: [
    {
      address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
      symbol: "WBNB",
      priority: 1,
    },
    {
      address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
      symbol: "USDC",
      priority: 2,
    },
    {
      address: "0x55d398326f99059ff775485246999027b3197955",
      symbol: "USDT",
      priority: 3,
    },
    {
      address: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
      symbol: "BUSD",
      priority: 4,
    },
    {
      address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
      symbol: "WETH",
      priority: 5,
    },
  ],
};

/**
 * Returns the routing token allowlist for a given chain as a Set of lowercase addresses.
 * Returns an empty Set if the chain has no configured routing tokens (all intermediates blocked).
 */
export function getRoutingTokenSet(chain: string): Set<string> {
  const tokens = ROUTING_TOKENS[chain.toLowerCase()] ?? [];
  return new Set(tokens.map((t) => t.address.toLowerCase()));
}

/**
 * Returns the priority of a token as an intermediate hop (lower = preferred).
 * Returns Infinity if the token is not in the allowlist (will be filtered out).
 */
export function getRoutingTokenPriority(chain: string, address: string): number {
  const tokens = ROUTING_TOKENS[chain.toLowerCase()] ?? [];
  const match = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return match?.priority ?? Infinity;
}
