import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { getAvailableChains, GetAvailableChainsBooleanArgs } from "./getAvailableChains";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    chain: {
      type: "string",
      description: "Exact chain key to check for availability (e.g. 'base', 'polygon', 'mainnet').",
    },
  },
  required: ["chain"],
};

export const getAvailableChainsBooleanTool: ToolConfig<GetAvailableChainsBooleanArgs, boolean> = {
  tool: {
    type: "function",
    name: "get_available_chains",
    description: "Check whether an exact chain key exists in the supported chain registry and return only true or false. Only exact key matches are considered — use the chain metadata tool for fuzzy or partial searches.",
    parameters,
    strict: true,
    handler: async (args) => getAvailableChains(args),
    exampleCalls: [
      { chain: "base" },
      { chain: "polygon" },
      { chain: "mainnet" },
    ],
  },
  info: {
    category: "infra",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "onchain",
    version: "v1.0.0",
    definition: "Returns a boolean indicating whether the requested chain is supported by the current chain registry.",
  },
};
