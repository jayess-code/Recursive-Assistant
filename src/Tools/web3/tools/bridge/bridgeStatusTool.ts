import type { ToolConfig, ToolParameters } from "../../../../Runtime/ToolExecutor/toolConfig";
import { bridgeStatus, BridgeStatusToolArgs } from "./bridge";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["fromChain", "txHash", "providerHint", "includeReceipt", "includeTransaction"],
  properties: {
    fromChain: {
      type: "string",
      description: "Source chain key where the bridge transaction was submitted.",
    },
    txHash: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{64}$",
      description: "Source-chain transaction hash.",
    },
    providerHint: {
      type: "string",
      nullable: true,
      default: null,
      description: "Optional provider identifier to annotate status output.",
    },
    includeReceipt: {
      type: "boolean",
      nullable: true,
      default: false,
      description: "Include normalized source-chain receipt payload.",
    },
    includeTransaction: {
      type: "boolean",
      nullable: true,
      default: false,
      description: "Include normalized source-chain transaction payload.",
    },
  },
};

export const bridgeStatusTool: ToolConfig<BridgeStatusToolArgs> = {
  tool: {
    type: "function",
    name: "bridge_status",
    description:
      "Check bridge transaction status from the source chain and return normalized lifecycle state with polling guidance.",
    parameters,
    strict: true,
    handler: async (args) => bridgeStatus(args),
  },
  info: {
    category: "defi",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "onchain",
    version: "1.0.0",
    definition: "Bridge status checker for source-chain confirmation and pending detection.",
  },
};
