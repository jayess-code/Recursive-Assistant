import type { ToolConfig, ToolParameters } from "../../../../ToolExecutor/toolConfig.js";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "fields"],
  properties: {
    queries: {
      type: "array",
      minimum: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chain"],
        properties: {
          chain: {
            type: "string",
            description: "The blockchain network to query your wallet address from",
          },
        },
      },
      description:
        "One or more wallet address queries. Use a single-item array for one chain or multiple items to fetch wallet addresses for several chains in one tool call.",
    },
    fields: {
      type: "array",
      minimum: 1,
      items: {
        type: "string",
      },
    //   items: {
    //         type: "string",
    //         enum: [...WALLET_ADDRESS_FIELDS],
    //       },
      description: "Optional list of output fields to include per chain. Leave null to return the full wallet address payload.",
    },
    },
};

export const getWalletAddressTool: ToolConfig<{ chain: string }> = {
  tool: {
    type: "function",
    name: "get_wallet_address",
    description: "Fetch the wallet address for a given blockchain network.",
    parameters,
    strict: true,
    handler: async ({ chain }: { chain: string }) => {
      return {
        chain,
        address: null,
        message: "Wallet address lookup is not implemented yet.",
      };
    },
  },
  info: {
    category: "crypto",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "offchain",
    version: "1.0.0",
    definition: "Returns the wallet address for a specified blockchain network.",
  },
};
