import { MANDATORY_FIELDS, normalizeRequestedFields, projectSymbolDataByFields, QUOTE_FIELD_MAP, QUOTE_OPTIONAL_FIELDS, TOKEN_OPTIONAL_FIELDS, TOKEN_SELECTABLE_FIELDS } from "./TokenDataFields";

export interface TokenDataArgs {
    queries?: Array<{
        id?: number | null;
        symbol?: string | null;
        name?: string | null;
        platform?: string | string[] | null;
        address?: string | string[] | null;
    }> | null;
    currency?: string | null; // e.g., 'USD'
    fields?: string[] | null;
}

type TokenDataQuery = {
    input: {
        id?: number | null;
        symbol?: string | null;
        name?: string | null;
        platform?: string | string[] | null;
        address?: string | string[] | null;
    };
    queryParam: string;
    currency: string;
    lookupBy: "id" | "symbol";
    nameFilter?: string;
    addressFilter?: string[];
    platformFilter?: string[];
};

type TokenDataQueryOutput = {
    input: {
        id?: number | null;
        symbol?: string | null;
        name?: string | null;
        platform?: string | string[] | null;
    };
    lookupBy: "id" | "symbol";
    currency: string;
    resultCount: number;
    data: Record<string, any>[] | Record<string, any> | null;
};

export type TokenDataBatchOutput = {
    provider: "coinmarketcap";
    currency: string;
    timestamp: string;
    queries: TokenDataQueryOutput[];
};

function normalize(value?: string | null): string {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeSymbol(value?: string | null): string {
    return String(value ?? "").trim().toUpperCase();
}

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


export async function getCexTokenDataBatch(args: TokenDataArgs, context?: string): Promise<TokenDataBatchOutput> {
    const currency = args.currency || "USD";
    const queriesInput = args.queries ?? [];

    if (!queriesInput.length) {
        throw new Error("At least one query is required.");
    }

    const queries: TokenDataQuery[] = queriesInput.map((query, index) => {
        const id = typeof query?.id === "number" && Number.isFinite(query.id) ? Math.trunc(query.id) : null;
        const symbol = normalizeSymbol(query?.symbol);
        const nameFilter = normalize(query?.name);
        const platform = query?.platform ?? null;
        const address = query?.address ?? null;
        
        // Normalize platform filter(s)
        let platformFilter: string[] = [];
        if (Array.isArray(platform)) {
            platformFilter = platform.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
        } else if (typeof platform === "string" && platform.trim()) {
            platformFilter = [platform.trim().toLowerCase()];
        }
        
        // Normalize address filter(s)
        let addressFilter: string[] = [];
        if (Array.isArray(address)) {
            addressFilter = address.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
        } else if (typeof address === "string" && address.trim()) {
            addressFilter = [address.trim().toLowerCase()];
        }
        
        const input = {
            ...(id !== null ? { id } : { id: null }),
            ...(symbol ? { symbol } : { symbol: null }),
            ...(nameFilter ? { name: String(query?.name ?? "").trim() } : { name: null }),
            ...(platform ? { platform } : { platform: null }),
            ...(address ? { address } : { address: null }),
        };

        if (id !== null) {
            return {
                input,
                queryParam: String(id),
                currency,
                lookupBy: "id",
                ...(nameFilter ? { nameFilter } : {}),
                ...(platformFilter.length ? { platformFilter } : {}),
                ...(addressFilter.length ? { addressFilter } : {}),
            };
        }

        if (!symbol) {
            throw new Error("Each query must include either id or symbol.");
        }

        return {
            input,
            queryParam: symbol,
            currency,
            lookupBy: "symbol",
            ...(nameFilter ? { nameFilter } : {}),
            ...(platformFilter.length ? { platformFilter } : {}),
            ...(addressFilter.length ? { addressFilter } : {}),
        };
    });

    const apiKey =  process.env.COINMARKETCAP_API_KEY;
    if (!apiKey) throw new Error("CoinMarketCap API key is not set");

    const idParams = Array.from(
        new Set(queries.filter((q) => q.lookupBy === "id").map((q) => q.queryParam))
    );
    const symbolParams = Array.from(
        new Set(queries.filter((q) => q.lookupBy === "symbol").map((q) => q.queryParam))
    );

    const fetchQuotes = async (lookupParamName: "id" | "symbol", values: string[]) => {
        if (!values.length) {
            return { data: {} } as Record<string, any>;
        }

        const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?${lookupParamName}=${values.join(",")}&convert=${currency}`;
        const response = await fetch(url, {
            headers: {
                "X-CMC_PRO_API_KEY": apiKey,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Error fetching data: ${response.statusText}. Details: ${errText}`);
        }

        return response.json();
    };

    const [idData, symbolData] = await Promise.all([
        fetchQuotes("id", idParams),
        fetchQuotes("symbol", symbolParams),
    ]);

    const requestedFields = normalizeRequestedFields(args.fields);
    const queryOutputs: TokenDataQueryOutput[] = [];
    for (const { input, queryParam, currency, lookupBy, nameFilter, platformFilter = [], addressFilter = [] } of queries as Array<{ input: any, queryParam: any, currency: any, lookupBy: any, nameFilter?: any, platformFilter?: any, addressFilter?: any }>) {
        const rawEntry =
            lookupBy === "id"
                ? idData.data?.[queryParam]
                : symbolData.data?.[queryParam];

        let symbolDataEntries = extractTokenDataEntries(rawEntry);

        if (lookupBy === "symbol" && nameFilter) {
            symbolDataEntries = symbolDataEntries.filter((entry) => normalize(String(entry.name ?? "")) === nameFilter);
        }

        // Platform filter (if present)
        let filteredEntries = symbolDataEntries;
        if (platformFilter.length) {
            filteredEntries = filteredEntries.filter((entry) => {
                const slug = String(entry.platform?.slug ?? "").toLowerCase();
                return platformFilter.includes(slug);
            });
        }
        
        // Address filter (if present)
        if (addressFilter.length) {
            filteredEntries = filteredEntries.filter((entry) => {
                // Check token_address field on platform object
                const tokenAddr = String(entry.platform?.token_address ?? "").trim().toLowerCase();
                return tokenAddr && addressFilter.includes(tokenAddr);
            });
        }

        if (!filteredEntries.length) {
            queryOutputs.push({
                input,
                lookupBy,
                currency,
                resultCount: 0,
                data: null,
            });
            continue;
        }

        const projectedEntries = projectTokenDataEntries(filteredEntries, currency, requestedFields);
        queryOutputs.push({
            input,
            lookupBy,
            currency,
            resultCount: projectedEntries.length,
            data: lookupBy === "id" ? projectedEntries[0] : projectedEntries,
        });
    }

    return {
        provider: "coinmarketcap",
        currency,
        timestamp: new Date().toISOString(),
        queries: queryOutputs,
    };
}