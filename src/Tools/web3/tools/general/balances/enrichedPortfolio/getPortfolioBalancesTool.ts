import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { getEnrichedPortfolioBalances, GetPortfolioBalancesArgs } from "./getEnrichedPortfolioBalances";

const PORTFOLIO_FIELDS = ["chain", "native", "tokens", "nfts"] as const;

const AddressSchema = {
    type: "string",
    pattern: "^0x[a-fA-F0-9]{40}$",
    description: "Hexadecimal Ethereum address",
    nullable: true,
    default: null,
};

const ChainKeySchema = {
    type: "string",
    description: "Chain identifier key",
};

export const parameters: ToolParameters = {
    type: "object",
    additionalProperties: false,
    properties: {
        fields: {
            type: "array",
            nullable: true,
            default: null,
            description:
                "Optional list of output fields to include per chain. Leave null to return the full enriched portfolio payload.",
            items: {
                type: "string",
                enum: [...PORTFOLIO_FIELDS],
            },
        },
        includeDexPrices: {
            type: "boolean",
            nullable: true,
            default: true,
            description:
                "Whether to enrich token balances with live DexScreener price and market data. Defaults to true.",
        },
        queries: {
            type: "array",
            minimum: 1,
            description: "List of wallets and chains to fetch a full enriched portfolio for. Leaving null or empty token filter will return all tokens for the specified wallet and chain.",
            items: {
                type: "object",
                properties: {
                    walletAddress: AddressSchema,
                    chain: ChainKeySchema,
                    tokens: {
                        type: "array",
                        items: {
                            type: "string",
                            pattern: "^0x[a-fA-F0-9]{40}$",
                            description: "Hexadecimal token address",
                            nullable: true,
                            default: null,
                        },
                        description:
                            "Optional ERC20 token addresses to filter by. Leave empty to return all discovered tokens for the specified wallet and chain.",
                        default: [],
                    },
                },
                required: ["walletAddress", "chain", "tokens"],
                additionalProperties: false,
            },
        },
    },
    required: ["queries", "fields", "includeDexPrices"],
};

export const getPortfolioBalancesTool: ToolConfig<GetPortfolioBalancesArgs> = {
    tool: {
        type: "function",
        name: "get_portfolio_balances",
        description:
            "Fetch a full enriched portfolio for one or more wallets across chains, including native, ERC20 token, and NFT balances. Token balances are optionally enriched with live DexScreener price and market cap data.",
        parameters,
        strict: true,
        exampleCalls: [
            {
                queries: [
                    {
                        walletAddress: "0x0000000000000000000000000000000000000001",
                        chain: "base",
                        tokens: [],
                    },
                ],
                fields: null,
                includeDexPrices: true,
            },
            {
                queries: [
                    {
                        walletAddress: "0x0000000000000000000000000000000000000001",
                        chain: "ethereum",
                        tokens: ["0x0000000000000000000000000000000000000002"],
                    },
                ],
                fields: ["chain", "tokens"],
                includeDexPrices: false,
            },
        ],
        handler: async (args) => getEnrichedPortfolioBalances(args),
    },
    info: {
        category: "crypto",
        subcategory: "wallet",
        tags: ["wallet", "portfolio", "balances"],
        riskLevel: "low",
        readOnly: true,
        access: "read",
        mode: "analyze",
        provider: "onchain",
        version: "1.0.0",
        definition:
            "Returns a full enriched portfolio by chain for one or more wallets, including native balances, ERC20 token holdings with optional DexScreener price data, and NFT balances.",
    },
};
