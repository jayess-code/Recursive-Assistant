import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { getWalletBalances, GetWalletBalancesArgs } from "./getWalletBalance";

const WALLET_BALANCE_FIELDS = ["chain", "native", "tokens", "nfts"] as const;

const AddressSchema = {
    type: "string",
    pattern: "^0x[a-fA-F0-9]{40}$",
    description: "Hexadecimal Ethereum address",
};

const ChainKeySchema = {
    type: "string",
    description: "Chain identifier key",
};

export const parameters: ToolParameters = {
    type: "object",
    additionalProperties: false,
    properties: {
        fetchOnly: {
            type: "array",
            nullable: true,
            default: null,
            description:
                "Optional list of balance categories to fetch: 'native', 'tokens', or 'nfts'. Use ['tokens'] to skip native and NFT fetches for lower latency balance checks. Leave null to fetch all categories.",
            items: {
                type: "string",
                enum: ["native", "tokens", "nfts"],
            },
        },
        fields: {
            type: "array",
            minimum: 1,
            nullable: true,
            default: null,
            description:
                "Optional list of output fields to include per chain, such as ['chain', 'tokens', 'balance']. Leave null to return the full wallet balance payload.",
            items: {
                type: "string",
                enum: [...WALLET_BALANCE_FIELDS],
            },
        },
        queries: {
            type: "array",
            minimum: 1,
            description: "List of chains and optional token addresses to query",
            items: {
                type: "object",
                properties: {
                    walletAddress: AddressSchema,
                    chain: ChainKeySchema,
                    tokens: {
                        type: "array",
                        minimum: 0,
                        items: AddressSchema,
                        description: "ERC20 token addresses to query",
                        default: [],  
                    }

                },
                required: ["chain", "tokens","walletAddress"],
                additionalProperties: false,
            },
        },
    },
    required: ["queries", "fields", "fetchOnly"],
};

export const getWalletBalancesTool: ToolConfig<GetWalletBalancesArgs> = {
    tool: {
        type: "function",
        name: "get_wallet_balances",
        description:
            "Fetch native, ERC20 token, and NFT balances across one or more chains. Supports optional field projection to reduce payload size.",
        parameters,
        strict: true,
        exampleCalls: [
            {
                queries: [
                    {
                        walletAddress: "0x0000000000000000000000000000000000000001",
                        chain: "base",
                        tokens: ["0x0000000000000000000000000000000000000002"],
                    },
                ],
                fields: ["chain", "tokens"],
                fetchOnly: ["tokens"],
            },
            {
                queries: [
                    {
                        walletAddress: "0x0000000000000000000000000000000000000001",
                        chain: "arbitrum",
                        tokens: [],
                    },
                ],
                fields: ["chain", "native", "tokens"],
                fetchOnly: ["native", "tokens"],
            },
            {
                queries: [
                    {
                        walletAddress: "0x0000000000000000000000000000000000000001",
                        chain: "ethereum",
                        tokens: [],
                    },
                ],
                fields: null,
                fetchOnly: null,
            },
        ],
        handler: async (args) => getWalletBalances(args),
    },
    info: {
        category: "crypto",
        subcategory: "wallet",
        tags: ["wallet", "balances"],
        riskLevel: "low",
        readOnly: true,
        access: "read",
        mode: "analyze",
        provider: "onchain",
        version: "2.1.0",
        definition:
            "Aggregates native, ERC20 token, and NFT balances by chain for one or more wallets. Supports fetchOnly parameter to skip unnecessary balance fetches for lower latency and optional top-level field projection per chain entry.",
    },
};