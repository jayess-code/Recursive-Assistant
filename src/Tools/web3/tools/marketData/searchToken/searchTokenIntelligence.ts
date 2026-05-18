import type { DexPair } from "../../../services/DexScreener/dexScreenerClient";
import { normalizeDexChain, parseDexNullableNumber } from "../../../services/DexScreener/dexScreenerClient";
import { selectBestPair } from "./searchTokenRanking";
import type { CoinMarketCapTokenData } from "../../../services/CoinMarketCap/fetchCoinMarketCapTokenData";
import type { ChainKey } from "../../../clients/viem/viem-types";
import type {
  SearchTokenAlert,
  SearchTokenClassification,
  SearchTokenIdentity,
  SearchTokenIdentityRepresentation,
  SearchTokenLiquidity,
  SearchTokenMarketStructure,
  SearchTokenMetrics,
  SearchTokenPrice,
  SearchTokenProvenance,
  SearchTokenResult,
  SearchTokenRiskSignals,
  SearchTokenVolume,
} from "./searchToken";

// ---- Math helpers ----

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toPercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

function percentageDeviation(left?: number | null, right?: number | null): number | null {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  const average = (Math.abs(left as number) + Math.abs(right as number)) / 2;
  if (!average) return 0;
  return (Math.abs((left as number) - (right as number)) / average) * 100;
}

function sumPairMetric(pairs: DexPair[], selector: (pair: DexPair) => number | null): number | null {
  const values = pairs.map(selector).filter((v): v is number => Number.isFinite(v));
  if (!values.length) return null;
  return values.reduce((total, v) => total + v, 0);
}

// ---- Tag / chain normalizers ----

function normalizeTags(tags?: string[] | null): string[] {
  return Array.from(
    new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))
  );
}

function normalizeRepresentationChain(value?: string | null): string | null {
  if (!value) return null;
  return normalizeDexChain(value as ChainKey);
}

// ---- Price ----

export function buildPriceIntelligence(input: {
  topPair?: DexPair;
  cmc?: CoinMarketCapTokenData;
}): SearchTokenPrice | undefined {
  const dexPrice = parseDexNullableNumber(input.topPair?.priceUsd);
  const cmcPrice = input.cmc?.market.priceUsd ?? null;
  const topLiquidity = parseDexNullableNumber(input.topPair?.liquidity?.usd) ?? 0;
  const deviation = percentageDeviation(dexPrice, cmcPrice);

  if (dexPrice !== null && cmcPrice !== null) {
    let confidence = 0.2;
    if (deviation !== null && deviation <= 2) confidence = 0.95;
    else if (deviation !== null && deviation <= 5) confidence = 0.85;
    else if (deviation !== null && deviation <= 10) confidence = 0.7;
    else if (deviation !== null && deviation <= 20) confidence = 0.45;

    return { valueUsd: (dexPrice + cmcPrice) / 2, source: "aggregated", confidence, deviation };
  }

  if (dexPrice !== null) {
    const confidence =
      topLiquidity >= 1_000_000 ? 0.8 : topLiquidity >= 100_000 ? 0.65 : topLiquidity >= 10_000 ? 0.5 : 0.35;
    return { valueUsd: dexPrice, source: "dex", confidence, deviation: null };
  }

  if (cmcPrice !== null) {
    return { valueUsd: cmcPrice, source: "cmc", confidence: 0.75, deviation: null };
  }

  return undefined;
}

// ---- Liquidity ----

export function buildLiquidityIntelligence(pairs: DexPair[]): SearchTokenLiquidity | undefined {
  const totalUsd = sumPairMetric(pairs, (p) => parseDexNullableNumber(p.liquidity?.usd));
  const topPairUsd = parseDexNullableNumber(selectBestPair(pairs)?.liquidity?.usd);
  const concentration = totalUsd !== null && topPairUsd !== null ? toPercent(topPairUsd, totalUsd) : null;

  if (totalUsd === null && topPairUsd === null) return undefined;

  return {
    totalUsd,
    topPairUsd,
    concentration,
    isFragmented: concentration !== null ? concentration < 55 && pairs.length > 1 : null,
  };
}

// ---- Volume ----

export function buildVolumeIntelligence(input: {
  pairs: DexPair[];
  cmc?: CoinMarketCapTokenData;
  liquidity?: SearchTokenLiquidity;
  price?: SearchTokenPrice;
}): SearchTokenVolume | undefined {
  const dex24h = sumPairMetric(input.pairs, (p) => parseDexNullableNumber(p.volume?.h24));
  const cmc24h = input.cmc?.market.volume24h ?? null;
  const cex24h = cmc24h !== null && dex24h !== null ? Math.max(cmc24h - dex24h, 0) : null;
  const total24h = cmc24h ?? dex24h;
  const totalLiquidity = input.liquidity?.totalUsd ?? null;
  const volumeToLiquidity =
    total24h !== null && totalLiquidity !== null && totalLiquidity > 0 ? total24h / totalLiquidity : null;

  let washTradingRisk = 0;
  if (volumeToLiquidity !== null) {
    if (volumeToLiquidity > 5) washTradingRisk += 0.45;
    else if (volumeToLiquidity > 2) washTradingRisk += 0.25;
  }

  if ((input.liquidity?.isFragmented ?? false) && (total24h ?? 0) > 0) {
    washTradingRisk += 0.15;
  }

  if ((input.price?.deviation ?? 0) > 10) {
    washTradingRisk += input.price!.deviation! > 25 ? 0.3 : 0.2;
  }

  if (dex24h !== null && total24h !== null && total24h > 0) {
    const dexShare = dex24h / total24h;
    if (dexShare > 0.9 && (volumeToLiquidity ?? 0) > 2) washTradingRisk += 0.15;
  }

  if (total24h === null && dex24h === null && cex24h === null) return undefined;

  return { total24h, dex24h, cex24h, washTradingRisk: clamp01(washTradingRisk) };
}

// ---- Identity ----

export function buildIdentityIntelligence(input: {
  token: SearchTokenResult["token"];
  cmc?: CoinMarketCapTokenData;
}): SearchTokenIdentity {
  const seen = new Set<string>();
  const representations: SearchTokenIdentityRepresentation[] = [];

  const appendRepresentation = (chain?: string | null, address?: string | null) => {
    if (!chain || !address) return;
    const key = `${chain}:${address.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    representations.push({ chain, address: address.toLowerCase() });
  };

  appendRepresentation(input.token.chain, input.token.address);

  const platform = input.cmc?.metadata.platform;
  appendRepresentation(
    normalizeRepresentationChain(platform?.slug ?? platform?.name ?? null),
    platform?.tokenAddress ?? null
  );

  return { canonicalId: input.cmc?.identity.id ?? null, representations };
}

// ---- Classification ----

function mapClassification(tags: string[]): { sector: string | null; subSector: string | null } {
  const matches = (values: string[]) => values.some((v) => tags.includes(v));

  if (matches(["artificial-intelligence", "ai-big-data", "ai-agents"])) {
    return { sector: "AI", subSector: tags.includes("ai-agents") ? "AI Agents" : "AI Infrastructure" };
  }

  if (matches(["defi", "decentralized-exchange-dex-token", "yield-farming", "lending-borowing"])) {
    if (tags.includes("decentralized-exchange-dex-token")) return { sector: "DeFi", subSector: "DEX" };
    if (tags.includes("yield-farming")) return { sector: "DeFi", subSector: "Yield" };
    return { sector: "DeFi", subSector: null };
  }

  if (matches(["memes", "meme", "doggone-doggerel"])) return { sector: "Meme", subSector: null };

  if (matches(["gaming", "gamefi", "metaverse"])) {
    return { sector: "Gaming", subSector: tags.includes("gamefi") ? "GameFi" : null };
  }

  if (matches(["infrastructure", "layer-1", "layer-2", "interoperability"])) {
    if (tags.includes("layer-2")) return { sector: "Infrastructure", subSector: "Layer 2" };
    if (tags.includes("layer-1")) return { sector: "Infrastructure", subSector: "Layer 1" };
    return { sector: "Infrastructure", subSector: null };
  }

  if (matches(["stablecoin", "asset-backed-stablecoin", "algorithmic-stablecoin"])) {
    return { sector: "Stablecoin", subSector: tags.includes("algorithmic-stablecoin") ? "Algorithmic" : null };
  }

  return { sector: null, subSector: null };
}

export function buildClassificationIntelligence(cmc?: CoinMarketCapTokenData): SearchTokenClassification | undefined {
  const tags = normalizeTags(cmc?.metadata.tags);
  const mapped = mapClassification(tags);

  if (!tags.length && !mapped.sector && !mapped.subSector) return undefined;

  return { sector: mapped.sector, subSector: mapped.subSector, tags };
}

// ---- Risk ----

export function buildRiskSignals(): SearchTokenRiskSignals {
  return {
    isVerified: null,
    isScam: null,
    isProxy: null,
    hasRenouncedOwnership: null,
    hasMintFunction: null,
    hasBlacklistFunction: null,
  };
}

// ---- Market structure ----

export function buildMarketStructure(input: {
  metrics?: SearchTokenMetrics;
  cmc?: CoinMarketCapTokenData;
  price?: SearchTokenPrice;
}): SearchTokenMarketStructure | undefined {
  const marketCap = input.cmc?.market.marketCap ?? input.metrics?.marketCap ?? null;
  const priceChange24h = input.metrics?.priceChange24h ?? input.cmc?.market.percentChange24h ?? null;
  const launchedAt = input.cmc?.metadata.dateLaunched ? new Date(input.cmc.metadata.dateLaunched) : null;
  const isNew =
    launchedAt && Number.isFinite(launchedAt.getTime())
      ? Date.now() - launchedAt.getTime() <= 180 * 24 * 60 * 60 * 1000
      : null;

  if (marketCap === null && priceChange24h === null && isNew === null) return undefined;

  return {
    isNew,
    isMicroCap: marketCap !== null ? marketCap < 50_000_000 : null,
    isHighVolatility:
      priceChange24h !== null || input.price?.deviation !== null
        ? Math.abs(priceChange24h ?? 0) >= 15 || (input.price?.deviation ?? 0) >= 15
        : null,
    trend:
      priceChange24h === null
        ? null
        : priceChange24h >= 5
          ? "up"
          : priceChange24h <= -5
            ? "down"
            : "sideways",
  };
}

// ---- Alerts ----

export function buildAlerts(input: {
  liquidity?: SearchTokenLiquidity;
  price?: SearchTokenPrice;
  volume?: SearchTokenVolume;
  cmc?: CoinMarketCapTokenData;
  risk: SearchTokenRiskSignals;
  cmcWarning?: string;
}): SearchTokenAlert[] {
  const alerts: SearchTokenAlert[] = [];
  const totalLiquidity = input.liquidity?.totalUsd ?? null;

  if (totalLiquidity !== null && totalLiquidity < 100_000) {
    alerts.push({
      type: "low_liquidity",
      severity: totalLiquidity < 20_000 ? "high" : "medium",
      message: `Observed DEX liquidity is low at about $${totalLiquidity.toFixed(0)}.`,
    });
  }

  if (input.liquidity?.isFragmented) {
    alerts.push({
      type: "fragmented_liquidity",
      severity: (input.liquidity.concentration ?? 100) < 35 ? "medium" : "low",
      message: "Liquidity is spread across multiple pools instead of concentrating in one deep market.",
    });
  }

  if ((input.price?.deviation ?? 0) >= 10) {
    alerts.push({
      type: "price_mismatch",
      severity: (input.price?.deviation ?? 0) >= 25 ? "high" : "medium",
      message: `DEX and CMC prices diverge by ${input.price?.deviation?.toFixed(1)}%.`,
    });
  }

  if (input.cmc?.match.identityAmbiguous) {
    alerts.push({
      type: "identity_ambiguous",
      severity: "medium",
      message: `CoinMarketCap reports ${input.cmc.match.candidateCount} possible identities for this symbol.`,
    });
  }

  if (input.cmcWarning) {
    alerts.push({ type: "missing_cmc", severity: "low", message: input.cmcWarning });
  }

  if ((input.volume?.washTradingRisk ?? 0) >= 0.45) {
    alerts.push({
      type: "wash_trading_risk",
      severity: (input.volume?.washTradingRisk ?? 0) >= 0.75 ? "high" : "medium",
      message: `Volume quality is questionable (wash-trading heuristic ${input.volume?.washTradingRisk?.toFixed(2)}).`,
    });
  }

  if (input.risk.isVerified === false) {
    alerts.push({
      type: "unverified_contract",
      severity: "medium",
      message: "The contract is not verified by any trusted source in this tool's current inputs.",
    });
  }

  return alerts;
}

// ---- Provenance ----

export function buildProvenance(input: {
  price?: SearchTokenPrice;
  metrics?: SearchTokenMetrics;
  liquidity?: SearchTokenLiquidity;
  volume?: SearchTokenVolume;
  classification?: SearchTokenClassification;
  identity?: SearchTokenIdentity;
  cmc?: CoinMarketCapTokenData;
}): SearchTokenProvenance | undefined {
  const provenance: SearchTokenProvenance = {};

  if (input.price) provenance.price = input.price.source;

  if ((input.cmc?.market.marketCap ?? null) !== null) provenance.marketCap = "cmc";
  else if ((input.metrics?.marketCap ?? null) !== null) provenance.marketCap = "dex";

  if ((input.liquidity?.totalUsd ?? null) !== null || (input.liquidity?.topPairUsd ?? null) !== null) {
    provenance.liquidity = "dex";
  }

  if ((input.volume?.dex24h ?? null) !== null && (input.volume?.cex24h ?? null) !== null) {
    provenance.volume = "aggregated";
  } else if ((input.volume?.dex24h ?? null) !== null) {
    provenance.volume = "dex";
  } else if ((input.volume?.total24h ?? null) !== null) {
    provenance.volume = "cmc";
  }

  if (input.classification?.tags?.length) provenance.classification = "cmc";

  if ((input.identity?.canonicalId ?? null) !== null && (input.identity?.representations?.length ?? 0) > 0) {
    provenance.identity = "aggregated";
  } else if ((input.identity?.representations?.length ?? 0) > 0) {
    provenance.identity = "dex";
  }

  return Object.keys(provenance).length ? provenance : undefined;
}

// ---- Legacy compatibility helpers ----

export function legacySourcesFromResult(result: SearchTokenResult): string[] {
  const sources = new Set<string>();

  if (
    result.provenance?.price === "cmc" ||
    result.provenance?.marketCap === "cmc" ||
    result.provenance?.classification === "cmc"
  ) {
    sources.add("coinmarketcap");
  }

  if (
    result.provenance?.price === "aggregated" ||
    result.provenance?.volume === "aggregated" ||
    result.provenance?.identity === "aggregated"
  ) {
    sources.add("dexscreener");
    sources.add("coinmarketcap");
  }

  if (
    result.provenance?.price === "dex" ||
    result.provenance?.marketCap === "dex" ||
    result.provenance?.liquidity === "dex" ||
    result.provenance?.volume === "dex" ||
    result.provenance?.identity === "dex"
  ) {
    sources.add("dexscreener");
  }

  if (!sources.size) sources.add("dexscreener");

  return Array.from(sources);
}

export function buildWarnings(alerts: SearchTokenAlert[], warning?: string): string[] | undefined {
  const messages = [warning, ...alerts.map((a) => a.message)].filter(Boolean) as string[];
  const unique = Array.from(new Set(messages));
  return unique.length ? unique : undefined;
}

// ---- Main enrichment entry point ----

export function applyDecisionGradeIntelligence(input: {
  result: SearchTokenResult;
  pairs: DexPair[];
  topPair?: DexPair;
  cmc?: CoinMarketCapTokenData;
  cmcWarning?: string;
}): SearchTokenResult {
  const price = buildPriceIntelligence({
    ...(input.topPair ? { topPair: input.topPair } : {}),
    ...(input.cmc ? { cmc: input.cmc } : {}),
  });
  const liquidity = buildLiquidityIntelligence(input.pairs);
  const volume = buildVolumeIntelligence({
    pairs: input.pairs,
    ...(input.cmc ? { cmc: input.cmc } : {}),
    ...(liquidity ? { liquidity } : {}),
    ...(price ? { price } : {}),
  });
  const identity = buildIdentityIntelligence({
    token: input.result.token,
    ...(input.cmc ? { cmc: input.cmc } : {}),
  });
  const classification = buildClassificationIntelligence(input.cmc);
  const risk = buildRiskSignals();
  const marketStructure = buildMarketStructure({
    ...(input.result.metrics ? { metrics: input.result.metrics } : {}),
    ...(input.cmc ? { cmc: input.cmc } : {}),
    ...(price ? { price } : {}),
  });
  const alerts = buildAlerts({
    ...(liquidity ? { liquidity } : {}),
    ...(price ? { price } : {}),
    ...(volume ? { volume } : {}),
    ...(input.cmc ? { cmc: input.cmc } : {}),
    risk,
    ...(input.cmcWarning ? { cmcWarning: input.cmcWarning } : {}),
  });
  const provenance = buildProvenance({
    ...(price ? { price } : {}),
    ...(input.result.metrics ? { metrics: input.result.metrics } : {}),
    ...(liquidity ? { liquidity } : {}),
    ...(volume ? { volume } : {}),
    ...(classification ? { classification } : {}),
    identity,
    ...(input.cmc ? { cmc: input.cmc } : {}),
  });

  const enriched: SearchTokenResult = {
    ...input.result,
    ...(price ? { price } : {}),
    ...(liquidity ? { liquidity } : {}),
    ...(volume ? { volume } : {}),
    identity,
    ...(classification ? { classification } : {}),
    risk,
    ...(marketStructure ? { marketStructure } : {}),
    // Always include alerts — empty array means "no concerns detected", not "unknown".
    alerts,
    ...(provenance ? { provenance } : {}),
  };

  const warnings = buildWarnings(alerts, input.cmcWarning);
  return {
    ...enriched,
    sources: legacySourcesFromResult(enriched),
    ...(warnings ? { warnings } : {}),
  };
}
