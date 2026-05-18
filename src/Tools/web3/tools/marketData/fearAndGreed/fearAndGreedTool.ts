import type { ToolConfig, ToolParameters } from "../../../../../Runtime/ToolExecutor/toolConfig";
import { getFearAndGreed, GetFearAndGreedArgs } from "./fearAndGreed";



const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "start", "limit"],
  properties: {
    mode: {
      type: "string",
      enum: ["latest", "historical"],
      default: "latest",
      nullable: true,
      description: "Use 'latest' for current index value or 'historical' for paginated history.",
    },
    start: {
      type: "number",
      minimum: 1,
      default: 1,
      nullable: true,
      description: "Historical pagination start index (1-based). Ignored in latest mode.",
    },
    limit: {
      type: "number",
      minimum: 1,
      maximum: 500,
      default: 50,
      nullable: true,
      description: "Historical page size. Ignored in latest mode.",
    },
  },
};


export const getFearAndGreedTool: ToolConfig<GetFearAndGreedArgs> = {
  tool: {
    type: "function",
    name: "get_fear_and_greed",
    description:
      "Get CoinMarketCap Crypto Fear and Greed Index (latest or historical). Useful for market sentiment context.",
    parameters,
    strict: true,
    handler: async (args: GetFearAndGreedArgs) => {
    return getFearAndGreed(args);
    },
  },
  info: {
    definition:
      "Returns CoinMarketCap Crypto Fear and Greed sentiment data. Use mode='latest' for current sentiment and mode='historical' for trend analysis. This is sentiment context only and should not be treated as direct execution confirmation for swaps/trades.",
    category: "crypto",
    subcategory: "market-data",
    tags: ["market-data", "sentiment", "fear", "greed"],
    riskLevel: "low",
    readOnly: true,
    provider: "coinmarketcap",
    mode: "analyze",
    version: "1.0.0",
  },
};
