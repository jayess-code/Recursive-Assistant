import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { getAvailableChains, GetAvailableChainsArgs } from "./chainMetadata";

const CHAIN_METADATA_FIELDS = [
    "key",
    "id",
    "chainId",
    "name",
    "nativeCurrency",
    "nativeCurrency.name",
    "nativeCurrency.symbol",
    "nativeCurrency.decimals",
    "rpcUrls",
    "rpcUrls.default",
    "rpcUrls.default.http",
    "testnet"
] as const;

const parameters: ToolParameters = {
    type: "object",
      properties: {
        filters: {
          type: "array",
          items: { type: "string" },
          minimum: 1,
          description:
            "Optional list of filter strings to evaluate in one call. Use this for batched lookups like [\"base\", \"arbitrum\", \"polygon\"].",
          nullable: true,
          default: null,
        },
        exactOnly: {
          type: "boolean",
          description:
            "When true, only return exact matches on chain key or chain name. Use this to avoid fuzzy matches like testnets or similarly named networks.",
          nullable: true,
          default: null,
        },
        topN: {
          type: "number",
          minimum: 1,
          description:
            "Optional cap for fuzzy search results. When exactOnly is false, returns only the top N highest-confidence chain matches.",
          nullable: true,
          default: null,
        },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: [
             ...CHAIN_METADATA_FIELDS
            ]
          },
          minimum: 1,
          description:
            "Optional list of fields to include in each chain object, e.g. [\"key\", \"name\", \"nativeCurrency.symbol\"].",
          nullable: true,
          default: null,
        },
      },
      required: [ "filters", "fields", "exactOnly", "topN" ],
      additionalProperties: false,
}

export const getAvailableChainsTool: ToolConfig<GetAvailableChainsArgs> = {
  tool: {
    type: "function",
    name: "get_available_chains",
    description:
      "Return filtered blockchain network info. Supports batched filters, exact chain matching for canonical chains like base/arbitrum/polygon, and optional field projection to reduce payload size.",
    parameters,
    strict: true,
    exampleCalls: [
      {},
      { filters: ["eth", "matic"] },
      { filters: ["arb"], exactOnly: false, topN: 3 },
      { filters: ["base", "arbitrum", "polygon"], exactOnly: true, fields: ["key", "name"] },
      { filters: ["testnet"] },
      { fields: ["key", "name", "chainId", "nativeCurrency.symbol"] },
      { filters: ["eth"], fields: ["key", "chainId", "rpcUrls.default.http"] },
    ],
    
    handler: async (args) => {
        return getAvailableChains(args);
      },
  },
  info: {
    category: "infra",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "onchain",
    version: "v1.4.0",
    definition:
      "Lists supported chains with batched filter support, optional exact matching by chain key or chain name, optional topN capping for fuzzy matches, and optional field projection. Use filters plus exactOnly=true for precise checks like base, arbitrum, and polygon without pulling in similarly named testnets or related networks. Supports both id and chainId for the same network identifier so callers can use the clearer alias without breaking older consumers.",
  },
};