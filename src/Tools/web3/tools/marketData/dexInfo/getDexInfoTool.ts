import type { ToolConfig, ToolParameters } from "../../../../../Runtime/ToolExecutor/toolConfig";
import { getDexInfo, GetDexInfoArgs } from "./getDexInfo";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: [
    "dexId",
    "chain",
    "tokenAddress",
    "pairAddress",
    "routerAddress",
    "includeOnchainVerification",
    "includeSecondaryHints",
    "includeRouterCandidates",
    "includeFactoryHints",
    "limit",
  ],
  properties: {
    dexId: {
      type: "string",
      nullable: true,
      default: null,
      description: "Optional DEX identifier (for example dexscreener dexId).",
    },
    chain: {
      type: "string",
      nullable: true,
      default: null,
      description: "Optional chain key filter (ethereum, base, arbitrum, polygon).",
    },
    tokenAddress: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional token address used to discover related DEX pairs and metadata.",
    },
    pairAddress: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional LP/pool pair address used as a direct DEX discovery hint.",
    },
    routerAddress: {
      type: "string",
      nullable: true,
      default: null,
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Optional explicit router candidate to evaluate and cache.",
    },
    includeOnchainVerification: {
      type: "boolean",
      nullable: true,
      default: true,
      description: "Verify candidate routers by checking that bytecode exists onchain.",
    },
    includeSecondaryHints: {
      type: "boolean",
      nullable: true,
      default: true,
      description: "Include optional secondary offchain hint sources (such as DEXTools) when configured.",
    },
    includeRouterCandidates: {
      type: "boolean",
      nullable: true,
      default: true,
      description: "Include and rank router candidates in the response.",
    },
    includeFactoryHints: {
      type: "boolean",
      nullable: true,
      default: true,
      description: "Include lightweight factory hints when available.",
    },
    limit: {
      type: "number",
      nullable: true,
      default: 10,
      minimum: 1,
      maximum: 25,
      description: "Maximum number of DEX entries returned.",
    },
  },
};

export const getDexInfoTool: ToolConfig<GetDexInfoArgs> = {
  tool: {
    type: "function",
    name: "get_dex_info",
    description:
      "Discover DEX execution metadata and candidate routers from market hints, then optionally verify and cache router candidates for swap-family detection.",
    parameters,
    strict: true,
    handler: async (args, context) => getDexInfo(args, context),
  },
  info: {
    category: "market-data",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "dexscreener",
    version: "1.0.0",
    definition:
      "Returns DEX metadata, inferred protocol family, and candidate router/quoter addresses with verification and provenance to support deterministic swap detection.",
  },
};
