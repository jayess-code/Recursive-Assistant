import type { ToolConfig, ToolParameters } from "../../../../Runtime/ToolExecutor/toolConfig";
import { bridgeQuote, BridgeQuoteToolArgs } from "./bridge";
import { BRIDGE_FIELD_ENUM } from "./bridgeFields";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: [
    "fromChain",
    "toChain",
    "token",
    "amount",
    "recipient",
    "srcTokenAddress",
    "dstTokenAddress",
    "slippageBps",
    "transportMode",
    "routeStrategy",
    "fields",
    "includeRawStepData",
  ],
  properties: {
    fromChain: {
      type: "string",
      description: "Source chain key.",
    },
    toChain: {
      type: "string",
      description: "Destination chain key.",
    },
    token: {
      type: "string",
      description: "Token symbol or token hint.",
    },
    amount: {
      type: "string",
      description: "Amount in base units expected by provider matching.",
    },
    recipient: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Destination recipient address.",
    },
    srcTokenAddress: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional explicit source token address.",
    },
    dstTokenAddress: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional explicit destination token address.",
    },
    slippageBps: {
      type: "number",
      nullable: true,
      default: null,
      minimum: 0,
      maximum: 10_000,
      description: "Optional slippage in basis points.",
    },
    transportMode: {
      type: "string",
      nullable: true,
      default: null,
      enum: ["taxi", "bus"],
      description: "Optional Stargate V2 transport mode.",
    },
    routeStrategy: {
      type: "string",
      nullable: true,
      default: "auto",
      enum: ["auto", "v1", "v2", "v1_pool", "v2_adapter", "v2_asset0", "v2_oft", "v2_router"],
      description: "Optional strategy override.",
    },
    fields: {
      type: "array",
      nullable: true,
      default: null,
      description: "Optional bridge response field projection.",
      items: {
        type: "string",
        enum: [...BRIDGE_FIELD_ENUM],
      },
    },
    includeRawStepData: {
      type: "boolean",
      nullable: true,
      default: false,
      description: "Include raw step calldata and ABI args in plan output.",
    },
  },
};

export const bridgeQuoteTool: ToolConfig<BridgeQuoteToolArgs> = {
  tool: {
    type: "function",
    name: "bridge_quote",
    description:
      "Discover and simulate the best bridge route using auto provider selection, returning route status, summary, approval requirements, and execution plan preview.",
    parameters,
    strict: true,
    handler: async (args) => bridgeQuote(args),
  },
  info: {
    category: "crypto",
    subcategory: "defi",
    tags: ["bridge", "quote"],
    riskLevel: "medium",
    readOnly: true,
    access: "read",
    mode: "simulate",
    provider: "onchain",
    version: "1.0.0",
    definition: "Bridge quote and simulation tool for V1/V2 Stargate-aware route discovery.",
  },
};
