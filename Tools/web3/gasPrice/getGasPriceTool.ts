import type { ToolConfig, ToolParameters } from "../../../ToolExecutor/toolConfig.js";
import { getGasPrice } from "./getGasPrice.js";
// import { getPublicClient } from "../../../../viem/client/getPublicClient";


interface GasPriceQuery {
  chain: string;
  amountNative?: string | null;
  amountETH?: string | null;
}

const GAS_PRICE_FIELDS = [
  "protocol",
  "chain",
  "chainId",
  "nativeSymbol",
  "nativeDecimals",
  "gasPriceWei",
  "gasPriceGwei",
  "gasLevel",
  "advice",
  "baseFeePerGasWei",
  "baseFeePerGasGwei",
  "maxFeePerGasWei",
  "maxFeePerGasGwei",
  "maxPriorityFeePerGasWei",
  "maxPriorityFeePerGasGwei",
  "amountNative",
  "estimatedFeeNative",
  "totalAmountWithFeeNative",
] as const;

export interface GetGasPriceArgs {
  chain?: string | null;
  amountNative?: string | null;
  amountETH?: string | null;
  queries?: GasPriceQuery[] | null;
  fields?: string[] | null;
}

const parameters: ToolParameters = {
  type: "object",
      required: ["queries", "fields"],
      additionalProperties: false,
      properties: {
        fields: {
          type: "array",
          minimum: 1,
          nullable: true,
          default: null,
          description:
            "Optional list of output fields to include per chain, such as ['chain', 'gasPriceGwei', 'gasLevel', 'advice']. Leave null to return the full gas payload.",
          items: {
            type: "string",
            enum: [...GAS_PRICE_FIELDS],
          },
        },
        queries: {
          type: "array",
          minimum: 1,
          description:
            "One or more gas queries. Use a single-item array for one chain or multiple items to fetch gas prices for several chains in one tool call.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["chain", "amountNative", "amountETH"],
            properties: {
              chain: {
                type: "string",
                description: "Chain to query gas price for.",
              },
              amountNative: {
                type: "string",
                description:
                  "Optional native-token amount to estimate transfer cost, expressed in display units for the selected chain (e.g. '0.5').",
                nullable: true,
                default: null,
              },
              amountETH: {
                type: "string",
                description:
                  "Deprecated alias for amountNative. Optional native-token amount to estimate transfer cost.",
                nullable: true,
                default: null,
              },
            },
          },
        },
      },
    };

export const getGasPriceTool: ToolConfig<GetGasPriceArgs> = {
  tool: {
    type: "function",
    name: "get_gas_price",
    description:
      "Fetch current gas price and provide human-readable execution advice for one or more chains using a queries array. Supports optional field projection so callers can request compact summaries or full fee detail.",
    parameters,
    strict: true,

    exampleCalls: [
      {
        queries: [
          { chain: "base", amountNative: null, amountETH: null },
          { chain: "arbitrum", amountNative: null, amountETH: null },
          { chain: "polygon", amountNative: null, amountETH: null },
        ],
        fields: ["chain", "gasPriceGwei", "gasLevel", "advice"],
      },
      {
        queries: [{ chain: "base", amountNative: "0.5", amountETH: null }],
        fields: ["chain", "gasPriceGwei", "estimatedFeeNative", "totalAmountWithFeeNative"],
      },
    ],
handler: async (args) => {
      return getGasPrice(args);
    },
  },

  info: {
    category: "crypto",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "offchain",
    version: "1.6.0",
    definition:
      "Returns current gas price for one or more queried chains, includes protocol, chainId, native currency symbol and decimals, and when available also returns EIP-1559 fee hints such as baseFeePerGas, maxFeePerGas, and maxPriorityFeePerGas. Assistant-facing calls should use the queries array, and multi-chain responses are keyed by chain to mirror wallet balance lookups. Use the optional fields projection to request only the gas fields needed for the current task.",
  },
};

