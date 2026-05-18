import type { ToolConfig, ToolParameters } from "../../../../Runtime/ToolExecutor/toolConfig";
import { BridgeDiscoveryArgs, BridgeDiscoveryResponse, bridgeDiscovery } from "./bridgeDiscovery";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["sourceChain", "sourceTokenAddress"],
  properties: {
    sourceChain: {
      type: "string",
      description:
        "Source blockchain network key (e.g., 'polygon', 'ethereum', 'arbitrum', 'base'). Must be a LayerZero-supported chain.",
    },
    sourceTokenAddress: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description:
        "Contract address of the source ERC-20 token on the source chain (e.g., '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' for USDC on Polygon)",
    },
  },
};

export const bridgeDiscoveryTool: ToolConfig = {
  tool: {
    type: "function",
    name: "bridge_discovery",
    description:
      "Discover which tokens and chains a given ERC-20 token can be bridged to using LayerZero. Queries the LayerZero Value Transfer API to show all destination chains and token variants available for a source token.",
    parameters,
    strict: true,
    handler: async (args: unknown): Promise<BridgeDiscoveryResponse> =>
      bridgeDiscovery(args as BridgeDiscoveryArgs),
  },
  info: {
    category: "defi",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "layerzero",
    version: "1.0.0",
    definition:
      "Bridge token discovery tool using LayerZero Value Transfer API.",
  },
};
