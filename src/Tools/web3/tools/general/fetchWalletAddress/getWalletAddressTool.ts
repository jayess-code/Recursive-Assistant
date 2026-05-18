import type { ToolConfig, ToolParameters } from "../../../../../Runtime/ToolExecutor/toolConfig";
import { fetchWalletAddress, GetWalletAddressArgs } from "./fetchWalletAddress";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["queries"],
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
    },
};

export const getWalletAddressTool: ToolConfig<GetWalletAddressArgs> = {
  tool: {
    type: "function",
    name: "get_crypto_wallet_address",
    description: "Fetch your crypto wallet address for a given blockchain network.",
    parameters,
    strict: true,
    handler: async (args: GetWalletAddressArgs) => fetchWalletAddress(args),
  },
  info: {
    category: "crypto",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "offchain",
    version: "1.0.0",
    definition: "You have a crypto wallet you can use to interact with blockchain networks and this tool fetches your wallet address for a specified chain.",
  },
};
