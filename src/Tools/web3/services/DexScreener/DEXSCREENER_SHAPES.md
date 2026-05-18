# DexScreener Data Shapes

Reference for the canonical shape of DexScreener API responses.
Use this when scaffolding tools, writing types, or reasoning about pair/token data.

---

## Pair Object

```json
{
  "chainId": "bsc",
  "dexId": "pancakeswap",
  "url": "https://dexscreener.com/bsc/0xee445e64eec4c860ad528803b957b00d8ed0df16",
  "pairAddress": "0xee445e64eec4C860AD528803b957B00d8eD0df16",
  "labels": ["v3"],
  "baseToken": {
    "address": "0xaFCC12e4040615E7Afe9fb4330eB3D9120acAC05",
    "name": "PirateCash",
    "symbol": "PIRATE"
  },
  "quoteToken": {
    "address": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    "name": "PancakeSwap Token",
    "symbol": "Cake"
  },
  "priceNative": "0.01347",
  "priceUsd": "0.02062",
  "txns": {
    "m5":  { "buys": 0,  "sells": 1  },
    "h1":  { "buys": 2,  "sells": 5  },
    "h6":  { "buys": 12, "sells": 16 },
    "h24": { "buys": 59, "sells": 56 }
  },
  "volume": {
    "h24": 529.38,
    "h6":  123.08,
    "h1":  23.87,
    "m5":  2.36
  },
  "priceChange": {
    "m5":  -0.05,
    "h1":  -0.18,
    "h6":  -0.07,
    "h24": -0.67
  },
  "liquidity": {
    "usd":   21479.58,
    "base":  522984,
    "quote": 6988.9644
  },
  "fdv": 2165173,
  "marketCap": 1440337,
  "pairCreatedAt": 1704385604000,
  "info": {
    "imageUrl": "https://cdn.dexscreener.com/...",
    "header":   "https://cdn.dexscreener.com/...",
    "openGraph": "https://cdn.dexscreener.com/...",
    "websites": [
      { "url": "https://p.cash", "label": "Website" }
    ],
    "socials": [
      { "url": "https://twitter.com/...", "type": "twitter" },
      { "url": "https://t.me/...",        "type": "telegram" },
      { "url": "https://discord.gg/...",  "type": "discord" }
    ]
  }
}
```

---

## Field Reference

| Field | Type | Notes |
|-------|------|-------|
| `chainId` | string | DexScreener chain key (e.g. `"ethereum"`, `"bsc"`, `"polygon"`, `"solana"`) |
| `dexId` | string | DEX identifier (e.g. `"uniswap"`, `"pancakeswap"`, `"quickswap"`) |
| `pairAddress` | string | **Pool/pair contract address. NOT a router address. Never use as `routerAddress` in swap tools.** |
| `labels` | string[] | Protocol version hints e.g. `["v2"]`, `["v3"]`, `["stable"]` |
| `baseToken.address` | string | Token being priced (the "input" or "from" token in context) |
| `quoteToken.address` | string | Denominator token (e.g. WETH, USDC, CAKE) |
| `priceNative` | string | Price in units of the quote token |
| `priceUsd` | string | USD price of base token |
| `txns` | object | Transaction counts over m5/h1/h6/h24 windows |
| `volume` | object | USD volume over m5/h1/h6/h24 windows |
| `priceChange` | object | Percentage price change over m5/h1/h6/h24 windows |
| `liquidity.usd` | number | Total pool liquidity in USD |
| `liquidity.base` | number | Base token amount in pool |
| `liquidity.quote` | number | Quote token amount in pool |
| `fdv` | number | Fully diluted valuation in USD |
| `marketCap` | number | Circulating market cap in USD (may be 0 if unknown) |
| `pairCreatedAt` | number | Unix timestamp (ms) when the pair was created on-chain |
| `info.imageUrl` | string | Token logo |
| `info.websites` | array | Project websites with labels |
| `info.socials` | array | Social links; `type` is `"twitter"`, `"telegram"`, `"discord"`, etc. |

---

## Critical Mapping Rules

- **`pairAddress` ≠ router address.** It is a liquidity pool contract. Never pass it as `routerAddress` to swap_quote or swap_build.
- **`dexId` → router address** mapping lives in `Tools/web3/engines/swap/discovery/routerRegistry.ts`. Use that to resolve a router for a given `dexId`.
- **`chainId`** uses DexScreener keys which differ from viem chain keys. Use `normalizeDexChain()` in `Tools/web3/utils/chain/` to convert.
- **`baseToken` vs `quoteToken`** — when quoting a swap, `baseToken.address` is typically `tokenIn` and `quoteToken.address` is the denominator. Confirm direction with the user.

---

## Chain Key Examples (DexScreener → viem)

| DexScreener `chainId` | viem chain key |
|-----------------------|---------------|
| `ethereum` | `mainnet` |
| `bsc` | `bsc` |
| `polygon` | `polygon` |
| `arbitrum` | `arbitrum` |
| `base` | `base` |
| `solana` | *(not EVM — viem does not support)* |
| `osmosis` | *(not EVM — viem does not support)* |
