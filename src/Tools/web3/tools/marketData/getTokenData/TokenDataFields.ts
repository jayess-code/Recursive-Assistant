export const MANDATORY_FIELDS = ["id", "name", "symbol", "slug", "cmc_rank", "is_active", "is_fiat"] as const;

export const TOKEN_OPTIONAL_FIELDS = [
    "tags",
    "date_added",
    "circulating_supply",
    "total_supply",
    "max_supply",
    "infinite_supply",
    "platform",
    "num_market_pairs",
    "self_reported_circulating_supply",
    "self_reported_market_cap",
    "minted_market_cap",
    "tvl_ratio",
    "last_updated",
] as const;

export const QUOTE_OPTIONAL_FIELDS = [
    "price",
    "volume_24h",
    "volume_change_24h",
    "cex_volume_24h",
    "dex_volume_24h",
    "percent_change_1h",
    "percent_change_24h",
    "percent_change_7d",
    "percent_change_30d",
    "percent_change_60d",
    "percent_change_90d",
    "market_cap",
    "market_cap_dominance",
    "fully_diluted_market_cap",
    "tvl",
    "quote_last_updated",
] as const;

export const TOKEN_SELECTABLE_FIELDS = [...TOKEN_OPTIONAL_FIELDS, ...QUOTE_OPTIONAL_FIELDS] as const;

export const DEFAULT_TOKEN_OPTIONAL_FIELDS = [
    "price",
    "market_cap",
    "volume_24h",
    "percent_change_24h",
    "cmc_rank",
    "fully_diluted_market_cap",
    "tags",
    "date_added",
] as const;

export const QUOTE_FIELD_MAP: Record<(typeof QUOTE_OPTIONAL_FIELDS)[number], string> = {
    price: "price",
    volume_24h: "volume_24h",
    volume_change_24h: "volume_change_24h",
    cex_volume_24h: "cex_volume_24h",
    dex_volume_24h: "dex_volume_24h",
    percent_change_1h: "percent_change_1h",
    percent_change_24h: "percent_change_24h",
    percent_change_7d: "percent_change_7d",
    percent_change_30d: "percent_change_30d",
    percent_change_60d: "percent_change_60d",
    percent_change_90d: "percent_change_90d",
    market_cap: "market_cap",
    market_cap_dominance: "market_cap_dominance",
    fully_diluted_market_cap: "fully_diluted_market_cap",
    tvl: "tvl",
    quote_last_updated: "last_updated",
};

export function normalizeRequestedFields(fields?: string[] | null): string[] | null {
    const normalized = Array.from(
        new Set(
            (fields ?? [])
                .map((field) => field.trim())
                .filter((field): field is string =>
                    TOKEN_SELECTABLE_FIELDS.includes(field as (typeof TOKEN_SELECTABLE_FIELDS)[number])
                )
        )
    );

    return normalized.length ? normalized : null;
}

export function projectSymbolDataByFields(
    symbolData: Record<string, any>,
    currency: string,
    requestedFields: string[] | null
): Record<string, any> {
    if (!requestedFields?.length) {
        return symbolData;
    }

    const projected: Record<string, any> = {};

    for (const field of MANDATORY_FIELDS) {
        if (field in symbolData) {
            projected[field] = symbolData[field];
        }
    }

    for (const field of requestedFields) {
        if (TOKEN_OPTIONAL_FIELDS.includes(field as (typeof TOKEN_OPTIONAL_FIELDS)[number]) && field in symbolData) {
            projected[field] = symbolData[field];
        }
    }

    const quote = symbolData.quote?.[currency];
    if (quote && typeof quote === "object") {
        const projectedQuote: Record<string, any> = {};

        for (const field of requestedFields) {
            if (QUOTE_OPTIONAL_FIELDS.includes(field as (typeof QUOTE_OPTIONAL_FIELDS)[number])) {
                const quoteKey = QUOTE_FIELD_MAP[field as (typeof QUOTE_OPTIONAL_FIELDS)[number]];
                if (quoteKey in quote) {
                    projectedQuote[quoteKey] = quote[quoteKey];
                }
            }
        }

        if (Object.keys(projectedQuote).length) {
            projected.quote = { [currency]: projectedQuote };
        }
    }

    return projected;
}