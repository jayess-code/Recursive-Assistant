import type { ToolConfig, ToolParameters } from "../../../../Runtime/ToolExecutor/toolConfig";
import { SwapDetectToolArgs, swapDetect } from "./swap";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: [
    "chain",
    "tokenIn",
    "tokenOut",
    "amount",
    "tradeType",
    "sender",
    "recipient",
    "abi",
    "quoterAddress",
    "dexId",
    "routerAddress",
  ],
  properties: {
    chain: {
      type: "string",
      description: "Target chain key.",
    },
    dexId: {
      type: "string",
      nullable: true,
      default: null,
      description: "Normalized DEX identifier (e.g. 'quickswap', 'uniswap', 'sushiswap'). Use this to auto-resolve routerAddress from the registry instead of providing it directly. Known values: quickswap, quickswap-v3, uniswap, uniswap-v3, quickswap-v2, sushiswap, 0x, zerox.",
    },
    routerAddress: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$ || null",
      description: "Leave null to auto-resolve from dexId. Router contract address to classify. Must be a router contract, not a pair/pool address. Optional if dexId is provided — the registry will resolve it automatically.",
      nullable: true,
      default: null,
    },
    tokenIn: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional token-in context for detection probes.",
    },
    tokenOut: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional token-out context for detection probes.",
    },
    amount: {
      type: "string",
      nullable: true,
      default: null,
      description: "Optional raw amount used for detection context.",
    },
    tradeType: {
      type: "string",
      nullable: true,
      default: null,
      enum: ["exact_in", "exact_out"],
      description: "Optional trade direction used for detection context.",
    },
    sender: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional sender address used for detection context.",
    },
    recipient: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional recipient address used for detection context.",
    },
    abi: {
      type: "array",
      nullable: true,
      default: null,
      description: "Optional ABI fragments used for selector-based family detection.",
      items: { type: "object", additionalProperties: false, properties: {} },
    },
    quoterAddress: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional quoter override for V3/Algebra detection context.",
    },
  },
};

export const swapDetectTool: ToolConfig<SwapDetectToolArgs> = {
  tool: {
    type: "function",
    name: "swap_detect",
    description:
      "Classify a candidate router into deterministic swap execution families (Uniswap V2, Uniswap V3, Algebra, or 0x aggregator) using registry, ABI methods, and function selectors. Use this to verify router executability before swap_quote/swap_build. Leave routerAddress null to auto-resolve from dexId when possible. Pair/pool addresses are expected to fail detection and return non-executable classifications.",
    parameters,
    strict: true,
    handler: async (args) => swapDetect(args),
  },
  info: {
    category: "defi",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "onchain",
    version: "1.0.0",
    definition: "Detects router execution family and confidence for a router contract address. Pair/pool contracts are expected to fail or return non-executable classifications. Use when router is unknown or you want an explicit classification/confidence check first.",
  },
};
