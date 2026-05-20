import { ToolConfig, ToolParameters } from "@/Runtime/ToolExecutor/toolConfig";
import { TokenDataArgs, getCexTokenDataBatch } from "./getTokeneData";
import { TOKEN_SELECTABLE_FIELDS } from "./TokenDataFields";

const parameters: ToolParameters = {
    type: "object",
    properties: {
        ids: {
            type: "array",
            description:
                "Optional list of CoinMarketCap token IDs to fetch. Use this when symbols may collide; ids take precedence over symbols.",
            items: { type: "integer" },
            minimum: 1,
            nullable: true,
            default: null,
        },
        symbols: {
            type: "array",
            description:
                "Optional list of cryptocurrency symbols to fetch (e.g., ['BTC', 'ETH', 'DOGE']). Ignored when ids are provided.",
            items: { type: "string" },
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
    required: ["currency", "fields"],
    anyOf: [
        { type: "object", required: ["symbols"] },
        { type: "object", required: ["ids"] },
    ],
    additionalProperties: false,
};

export const TokenDataTool: ToolConfig<TokenDataArgs> = {
    tool: {
        type: "function",
        name: "cex_token_data_tool",
        description:
            "Fetch centralized-exchange token metadata and quote data from CoinMarketCap for one or more symbols or CoinMarketCap ids, with optional field projection for a compact response. Ids are preferred when provided to avoid symbol collisions.",
        parameters,
        // @ts-ignore
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
            "Fetches CoinMarketCap token metadata and latest centralized-exchange quote data for one or more symbols or CoinMarketCap ids in a selected quote currency. Supports optional field projection for compact responses while retaining core identity fields. Id-based lookup should be preferred when symbols may collide. Use this for price discovery and market comparison, not as proof of executable on-chain swap output.",
    },
};
