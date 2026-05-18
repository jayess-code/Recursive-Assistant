import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { sendTransaction, SendTransactionArgs } from "./sendTransaction";

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: [ "chain", "to", "value", "data", "nonce", "gasPrice", "accessList", "factoryDeps", "paymaster", "paymasterInput", "dryRun"],
  properties: {
    chain: { type: "string", description: "Blockchain network" },
    to: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$", description: "Recipient address" },
    value: { type: "string", description: "Amount of ETH to send (in Ether)", nullable: true, default: null },
    data: { type: "string", pattern: "^0x[a-fA-F0-9]*$", description: "Contract data", nullable: true, default: null },
    nonce: { type: "number", description: "Transaction nonce", nullable: true, default: null },
    gasPrice: { type: "string", description: "Gas price in Gwei", nullable: true, default: null },
    accessList: {
      type: "array",
      description: "EIP-2930 access list",
      nullable: true,
      default: null,
      items: {
        type: "object",
        properties: {
          address: { type: "string" },
          storageKeys: { type: "array", items: { type: "string" } },
        },
        required: ["address", "storageKeys"],
        additionalProperties: false,
      },
    },
    factoryDeps: { type: "array", items: { type: "string", pattern: "^0x[a-fA-F0-9]*$" }, nullable: true, default: null },
    paymaster: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$", nullable: true, default: null },
    paymasterInput: { type: "string", pattern: "^0x[a-fA-F0-9]*$", nullable: true, default: null },
    dryRun: {
      type: "boolean",
      description: "If true, estimate and simulate without sending",
      nullable: true,
      default: false,
    },
  },
};


export const sendTransactionTool: ToolConfig<SendTransactionArgs> = {
  tool: {
    type: "function",
    name: "send_transaction",
    description: "Send or simulate a transaction using the agent wallet configured via NEO_PRIVATE_KEY",
    parameters,
    strict: true,
  handler: async (args) => {
        return sendTransaction(args);
      },
    },

  info: {
    category: "wallet",
    riskLevel: "high",
    readOnly: false,
    access: "write",
    mode: "execute",
    requiresConfirmation: true,
    provider: "onchain",
    version: "v1.0.0",
    definition:
      "Sends a state-changing on-chain transaction using the agent wallet from NEO_PRIVATE_KEY (never request user private keys in chat). Use this tool only when the user explicitly asks to transfer funds or execute a contract write. For planning or previews, set dryRun=true first and report estimatedGas before execution. Before sending, confirm chain, recipient, value/data, and any advanced fields (nonce, gasPrice, accessList, paymaster). Never claim a transaction was sent unless this tool returns success=true and a transaction hash.",
  },
};