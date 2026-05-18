
import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { executeReadContract, ReadContractHandlerArgs, READ_CONTRACT_RESULT_FIELDS } from "./readContract";


const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    contract: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "The contract address to read from",
      nullable: true,
      default: null,
    },
    functionName: {
      type: "string",
      description:
        "The exact name of the function to call. It must match a function present in the supplied ABI fragment.",
      nullable: true,
      default: null,
    },
    args: {
      type: "array",
      description:
        "Optional simple arguments for the function call. Use this only for flat argument lists. Do not place JSON text for nested arrays or tuples inside args. The args must match the ABI inputs exactly in count, order, and primitive value types.",
      items: { type: "string" },
      nullable: true,
      default: null,
    },
    argsJson: {
      type: "string",
      description:
        "Optional JSON-stringified full argument array for nested ABI inputs such as address[] paths or tuple values. Use this instead of args whenever any ABI input is itself an array or object.",
      nullable: true,
      default: null,
    },
    abi: {
      type: "string",
      description:
        "A JSON-stringified ABI array or minimal ABI fragment containing the exact function signature requested by functionName.",
      nullable: true,
      default: null,
    },
    chain: {
      type: "string",
      description: "The chain to use for reading the contract",
      nullable: true,
      default: null,
    },
    queries: {
      type: "array",
      minimum: 1,
      nullable: true,
      description:
        "Optional batched read requests. When you need more than one contract read in the same turn, use one read_contract call with a queries array instead of making repeated single read_contract calls. Each query must keep functionName, abi, and args aligned exactly.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["contract", "functionName", "args", "argsJson", "abi", "chain"],
        properties: {
          contract: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "The contract address to read from.",
          },
          functionName: {
            type: "string",
            description: "The exact name of the function to call for this query.",
          },
          args: {
            type: "array",
            items: { type: "string" },
            nullable: true,
            default: null,
            description:
              "Optional simple function arguments for this query. Use this only for flat argument lists and do not place JSON text for nested values inside args.",
          },
          argsJson: {
            type: "string",
            nullable: true,
            default: null,
            description:
              "Optional JSON-stringified full argument array for this query. Use this when any ABI argument is itself an array or tuple.",
          },
          abi: {
            type: "string",
            description:
              "A JSON-stringified ABI array or minimal ABI fragment containing the exact function signature for this query.",
          },
          chain: {
            type: "string",
            description: "The chain to use for this contract read.",
          },
        },
      },
    },
    fields: {
      type: "array",
      minimum: 1,
      nullable: true,
      default: null,
      description:
        "Optional response fields to include for batched results, such as ['chain', 'functionName', 'result'] or ['contract', 'error', 'warnings']. Leave null to return the full batched payload.",
      items: {
        type: "string",
        enum: [...READ_CONTRACT_RESULT_FIELDS],
      },
    },
  },
  required: ["contract", "functionName", "args", "argsJson", "abi", "chain", "queries", "fields"],
};

export const readContractTool: ToolConfig<ReadContractHandlerArgs> = {
  tool: {
    type: "function",
    name: "read_contract",
    description: "Read data from a smart contract. Use one batched queries call when multiple reads are needed in the same turn.",
    parameters,
    strict: true,
    handler: async (args) => executeReadContract(args),
    exampleCalls: [
      {
        contract: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
        functionName: "factory",
        args: [],
        argsJson: null,
        abi: '[{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]',
        chain: "base",
      },
      {
        queries: [
          {
            contract: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
            functionName: "WETH",
            args: [],
            argsJson: null,
            abi: '[{"inputs":[],"name":"WETH","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]',
            chain: "base",
          },
          {
            contract: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
            functionName: "factory",
            args: [],
            argsJson: null,
            abi: '[{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]',
            chain: "base",
          },
          {
            contract: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
            functionName: "getAmountsOut",
            args: null,
            argsJson: '["1000000000000000000", ["0x4200000000000000000000000000000000000006", "0xB5a1302273B94D616D57DAB3e098D27333eCec9D"]]',
            abi: '[{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"}],"name":"getAmountsOut","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"view","type":"function"}]',
            chain: "base",
          },
        ],
        fields: ["chain", "functionName", "result", "error"],
      },
      {
        contract: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
        functionName: "getAmountsOut",
        args: null,
        argsJson: '["1000000000000000000", ["0x4200000000000000000000000000000000000006", "0xB5a1302273B94D616D57DAB3e098D27333eCec9D"]]',
        abi: '[{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"}],"name":"getAmountsOut","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"view","type":"function"}]',
        chain: "base",
      },
    ],
  },
  info: {
    category: "utility",
    subcategory: "contracts",
    tags: ["utility", "contracts", "read"],
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "offchain",
    version: "v1.2.0",
    definition:
      "Reads on-chain contract state via a view or pure function call. Use this tool when the user asks for balances, config, allowances, ownership, router constants, quotes, or other read-only contract data. If you need more than one read in the same turn, batch them into a single read_contract call with a queries array instead of making repeated single calls. For every read, functionName must exactly match a function present in the supplied ABI fragment. Use args only for simple flat argument lists, and use argsJson for nested ABI inputs such as address[] paths or tuple values. If the ABI fragment or argument shape does not match, stop and refetch or rebuild the call instead of guessing. Never present guessed values as confirmed on-chain results.",
  },
};

