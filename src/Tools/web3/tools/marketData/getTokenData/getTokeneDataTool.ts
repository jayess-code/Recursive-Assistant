import { ToolConfig, ToolParameters } from "@/Runtime/ToolExecutor/toolConfig";
import { TokenDataArgs, getCexTokenDataBatch } from "./getTokeneData";
import { TOKEN_SELECTABLE_FIELDS } from "./TokenDataFields";

const parameters: ToolParameters = {
    type: "object",
    properties: {
        queries: {
            type: "array",
            description:
                "One or more token lookup queries. Prefer id when known. When id is missing, provide symbol and optionally name to disambiguate symbol collisions.",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    // id: {
                    //     type: "integer",
                    //     nullable: true,
                    //     default: null,
                    //     description: "Optional CoinMarketCap token id which you will provide if known. Id lookup is preferred when available but not required and can be left null.",
                    // },
                    symbol: {
                        type: "string",
                        nullable: true,
                        default: null,
                        description: "Optional token symbol (e.g. BTC, DOGE) used when id is not provided.",
                    },
                    name: {
                        type: "string",
                        nullable: true,
                        default: null,
                        description: "Optional token name used to narrow symbol matches (e.g. Dogecoin).",
                    },
                    platform: {
                        type: ["string", "array"],
                        items: { type: "string" },
                        nullable: true,
                        default: null,
                        description: "Platform/chain slug (e.g. ethereum, solana, base) or array of slugs to filter results."
                    },
                    address: {
                        type: ["string", "array"],
                        items: { type: "string" },
                        nullable: true,
                        default: null,
                        description: "Contract address used to disambiguate tokens on the same platform. Should be provided as a last resort when id, symbol, name, and platform are not sufficient to identify the token."
                    },
                },
                required: [
                    // "id",
                     "symbol", "name", "platform", "address"],
            },
            minimum: 1,
            maximum: 10,
            nullable: true,
            default: null,
        },
        currency: {
            type: "string",
            description: "Target currency symbol for price conversion (e.g., 'USD', 'EUR')",
            nullable: true,
            default: "USD",
        },
        fields: {
            type: "array",
            minimum: 1,
            description:
                "Optional list of output fields to include for each token. Core identity fields are always returned. Leave null to return the full CoinMarketCap token payload.",
            items: { type: "string", enum: [...TOKEN_SELECTABLE_FIELDS] },
            nullable: true,
            default: null,
        },
    },
    required: ["queries", "currency", "fields"],
    additionalProperties: false,
};

export const TokenDataTool: ToolConfig<TokenDataArgs> = {
    tool: {
        type: "function",
        name: "cex_token_data_tool",
        description:
            "Fetch centralized-exchange token metadata and quote data from CoinMarketCap for one or more token queries. Each query can include id, symbol, and optional name for symbol disambiguation. Ids are preferred when available. Returns an ordered queries array aligned with input order.",
        parameters,
        strict: true,
        handler: async (args) => {
           
            return await getCexTokenDataBatch(args);
        },
    },
    info: {
        category: "crypto",
        riskLevel: "low",
        provider: "CoinMarketCap",
        readOnly: true,
        access: "read",
        mode: "analyze",
        version: "1.0.0",
        definition:
            "Fetches CoinMarketCap token metadata and latest centralized-exchange quote data for one or more token queries in a selected quote currency. Each query supports id, symbol, and optional name; id-based lookup should be preferred, while symbol+name narrows ambiguous symbols. Supports optional field projection for compact responses. Returns a structured payload: provider, currency, timestamp, and queries[] where each item includes input, lookupBy, currency, resultCount, and data (object for id lookups, array for symbol lookups, or null when no match). Use this for price discovery and market comparison, not as proof of executable on-chain swap output.",
    },
};
