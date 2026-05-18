
import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import {
  estimateContractDeployment,
  EstimateContractDeploymentArgs,
} from "./estimateContractDeployment";

const parameters: ToolParameters = {
  type: "object",
  required: ["chain", "bytecode", "abi", "constructorArgs"],
  additionalProperties: false,
  properties: {
    chain: { type: "string", description: "Chain to estimate deployment on" },
    bytecode: { type: "string", description: "Contract bytecode" },
    abi: { type: "array", description: "Contract ABI" },
    constructorArgs: {
      type: "array",
      description: "Optional constructor arguments",
      nullable: true,
      default: null,
    },
  },
};


export const estimateContractDeploymentTool: ToolConfig<EstimateContractDeploymentArgs> = {
  tool: {
    type: "function",
    name: "estimate_contract_deployment",
    description:
      "Estimate the ETH cost to deploy a smart contract on a given chain without executing the deployment.",
    parameters,
    strict: true,
    handler: async (args) => estimateContractDeployment(args),
  },

  info: {
    category: "crypto",
    subcategory: "contracts",
    tags: ["crypto", "contracts", "estimate", "deployment"],
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "onchain",
    version: "1.0.0",
    definition:
      "Estimates gas and ETH cost required to deploy a contract from bytecode/ABI without broadcasting. Use this before deployment recommendations or when the user asks for expected deployment cost.",
  },
};
