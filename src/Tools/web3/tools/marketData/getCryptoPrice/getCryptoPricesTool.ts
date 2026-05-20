import { ToolConfig, ToolParameters } from "@/Runtime/ToolExecutor/toolConfig";
import { CryptoPriceArgs, getCexCryptoPricesBatch } from "./getCryptoPrices";

const parameters: ToolParameters = {
    type: "object",
    properties: {
        symbols: {
            type: "array",
            description: "List of cryptocurrency symbols to fetch (e.g., ['BTC', 'ETH', 'DOGE'])",
            items: { type: "string" },
            minimum: 1,
            maximum: 10,
        },
        currency: {
            type: "string",
            description: "Target currency symbol for price conversion (e.g., 'USD', 'EUR')",
            nullable: true,
            default: "USD",
        },
    },
    required: ["symbols", "currency"],
    additionalProperties: false,
};

export const CexCryptoPriceTool: ToolConfig<CryptoPriceArgs> = {
    tool: {
        type: "function",
        name: "cex_crypto_prices_tool",
        description:
            "Fetches current prices and market data for a customizable list of cryptocurrency symbols in a chosen fiat or crypto currency.",
        parameters,
        strict: true,
        handler: async (args) => {
           
            return await getCexCryptoPricesBatch(args);
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
            "Fetches latest centralized exchange market quotes from CoinMarketCap for one or more symbols. Use this for price discovery and comparison, not as proof of executable on-chain swap output.",
    },
};