# Token Intelligence Architecture

## Current State (Phase 1)

The token intelligence layer integrates three primary sources:

- **DexScreener** — Real-time DEX pair discovery, liquidity, market microstructure
- **CoinMarketCap** — Canonical asset identity, normalized metadata, categories, market cap
- **On-chain RPC** — Direct contract truth, fallback validation

## Future Direction (Phase 2 — Planned)

In a future phase, we will add **The Graph + direct on-chain indexing** to complement (not replace) the current sources. This integration will unlock deeper historical and behavioral intelligence that market APIs do not provide efficiently.

### Future On-Chain Focus Areas

- Holder counts and concentration over time
- Transfer activity and behavioral patterns
- Mint/burn history and supply evolution
- LP and liquidity depth evolution
- Protocol exposure and DeFi position intelligence
- Event-derived behavioral signals (deposited, withdrawn, etc.)

## Design Principle

**Future indexed data should COMPLEMENT current sources, not replace them.**

Each source fills a specific niche:

| Source | Role |
|--------|------|
| **DexScreener** | Freshest DEX liquidity & pair-level discovery |
| **CoinMarketCap** | Canonical identity, metadata, market-wide normalization |
| **The Graph / RPC** | Historical behavioral intelligence & contract truth |

## Why This Matters for AI Reasoning

Market APIs describe **what markets currently report**.  
Indexed on-chain data describes **what actually happened historically**.

This distinction is critical for:

- **Confidence scoring** — Deviation patterns reveal quality
- **Detecting fragile liquidity** — Concentration history shows resilience
- **Identifying concentration risk** — Holder evolution over time
- **Understanding behavioral tokens** — Emission patterns, whale activity
- **Historical intelligence** — When did liquidity dry up? When was the token created?

## Implementation Notes

- ❌ Do NOT remove or downgrade current source integrations
- ✅ Add new fields to `SearchTokenResult` types as needed (keep `provenance` updated)
- ✅ Maintain backward compatibility with existing field projections
- ✅ Document source attribution for every new field in `provenance`

## Current Result Structure

See `searchToken.ts` for the 9 decision-grade intelligence sections:

1. `price` — DEX + CMC price normalization with confidence
2. `liquidity` — Concentration and fragmentation metrics
3. `volume` — Quality scoring and wash-trading heuristics
4. `identity` — Canonical cross-chain representation
5. `classification` — Sector and category tags
6. `risk` — Contract-level signals (placeholder for on-chain indexing)
7. `marketStructure` — Derived behavioral signals
8. `alerts` — Structured risk indicators
9. `provenance` — Field-level source attribution

## Related Files

- `searchToken.ts` — Orchestration, type exports, query loop
- `searchTokenIntelligence.ts` — All 9 builder functions
- `searchTokenRanking.ts` — Candidate selection and pair scoring
- `projectFields.ts` — Shared field projection utility
