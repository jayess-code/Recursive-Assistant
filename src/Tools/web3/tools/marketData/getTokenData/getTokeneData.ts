import { MANDATORY_FIELDS, normalizeRequestedFields, projectSymbolDataByFields, QUOTE_FIELD_MAP, QUOTE_OPTIONAL_FIELDS, TOKEN_OPTIONAL_FIELDS, TOKEN_SELECTABLE_FIELDS } from "./TokenDataFields";

export interface TokenDataArgs {
    symbols?: string[] | null; // e.g., ['BTC', 'ETH']
    ids?: number[] | null; // e.g., [38769, 1027]
    currency?: string | null; // e.g., 'USD'
    fields?: string[] | null;
}

type TokenDataQuery = {
    key: string;
    queryParam: string;
    currency: string;
};

function extractTokenDataEntries(rawEntry: unknown): Record<string, any>[] {
    if (!rawEntry) {
        return [];
    }

    if (Array.isArray(rawEntry)) {
        return rawEntry.filter((entry): entry is Record<string, any> => Boolean(entry) && typeof entry === "object");
    }

    if (typeof rawEntry === "object") {
        return [rawEntry as Record<string, any>];
    }

    return [];
}

function projectTokenDataEntries(
    entries: Record<string, any>[],
    currency: string,
    requestedFields: string[] | null
): Record<string, any>[] {
    return entries.map((entry) => projectSymbolDataByFields(entry, currency, requestedFields));
}


export async function getCexTokenDataBatch(args: TokenDataArgs, context?: string): Promise<Record<string, any>> {
    const currency = args.currency || "USD";
    const hasIds = Boolean(args.ids?.length);
    const hasSymbols = Boolean(args.symbols?.length);

    if (!hasIds && !hasSymbols) {
        throw new Error("At least one symbol or id is required.");
    }

    const queries: TokenDataQuery[] = hasIds
        ? (args.ids ?? []).map((id) => ({
              key: String(id),
              queryParam: String(id),
              currency,
          }))
        : (args.symbols ?? []).map((symbol) => ({
              key: symbol,
              queryParam: symbol,
              currency,
          }));

    const apiKey =  process.env.COINMARKETCAP_API_KEY;
    if (!apiKey) throw new Error("CoinMarketCap API key is not set");

    const lookupParamName = hasIds ? "id" : "symbol";
    const lookupParamValue = Array.from(new Set(queries.map((query) => query.queryParam))).join(",");
    const currencyParam = queries[0]?.currency || currency;

    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?${lookupParamName}=${lookupParamValue}&convert=${currencyParam}`;

    // Here you would call fetch(url, ...) to get real data instead of mock
    const response = await fetch(url, {
        headers: { 
            "X-CMC_PRO_API_KEY": apiKey, 
            Accept: "application/json" },
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error fetching data: ${response.statusText}. Details: ${errText}`);
    }

    const data = await response.json();
    const requestedFields = normalizeRequestedFields(args.fields);
    const result: Record<string, any> = {};
    for (const { key, queryParam, currency } of queries) {
        const rawEntry = data.data?.[queryParam] ?? data.data?.[key];
        const symbolDataEntries = extractTokenDataEntries(rawEntry);

        if (!symbolDataEntries.length) {
            result[key] = { [currency]: null };
        } else {
            const projectedEntries = projectTokenDataEntries(symbolDataEntries, currency, requestedFields);
            result[key] = {
                [currency]: hasIds ? projectedEntries[0] : projectedEntries,
            };
        }
    }

    return result;
}