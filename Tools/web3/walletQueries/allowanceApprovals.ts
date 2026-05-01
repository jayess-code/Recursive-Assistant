import type { ToolParameters } from "../../../ToolExecutor/toolConfig.js";

export const parameters: ToolParameters = {
    type: "object",
    additionalProperties: false,
    properties: {
        queries:{
            type: "array",
            minimum: 1,
            description: "Approve, revoke, or request allowance for an ERC20 token spender",
            items: {
                type: "object",
                properties: {
                    walletAddress: {
                        type: "string",
                        pattern: "^0x[a-fA-F0-9]{40}$",
                        description: "Hexadecimal Ethereum address",
                    },
                    tokenAddress: {
                        type: "string",
                        pattern: "^0x[a-fA-F0-9]{40}$",
                        description: "ERC20 token address",
                    },
                    spenderAddress: {
                        type: "string",
                        pattern: "^0x[a-fA-F0-9]{40}$",
                        description: "ERC20 token spender address",
                    },
                    action: {
                        type: "string",
                        enum: ["approve", "revoke", "request"],
                        description: "Action to perform on the allowance",
                    },
                },
                required: ["walletAddress", "tokenAddress", "spenderAddress", "action"],
                additionalProperties: false,
            },

        },
        fields: {
            type: "array",  
            minimum: 1,
            nullable: true,
            default: null,
            description:
                "Optional list of output fields to include per chain, such as ['chain', 'tokens', 'balance']. Leave null to return the full allowance approval payload.",
            items: {
                type: "string",
            },
        },
    },
    required: ["queries","fields"],
};