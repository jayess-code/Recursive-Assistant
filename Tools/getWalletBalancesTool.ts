import type { ToolParameters } from "../ToolExecutor/toolConfig.js";

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
        fields: {
            type: "array",
            minimum: 1,
            nullable: true,
            default: null,
            description:
                "Optional list of output fields to include per chain, such as ['chain', 'tokens', 'balance']. Leave null to return the full wallet balance payload.",
            items: {
                type: "string",
            },
        //     items: {
        //     type: "string",
        //     enum: [...WALLET_BALANCE_FIELDS],
        //   },
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
                        default: [],  // default empty array
                    }

                },
                required: ["chain", "tokens","walletAddress"],
                additionalProperties: false,
            },
        },
    },
    required: ["queries","fields"],
};