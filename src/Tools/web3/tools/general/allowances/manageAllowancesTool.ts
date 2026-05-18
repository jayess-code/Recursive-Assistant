import type { ToolConfig, ToolParameters } from "../../../../../Runtime/ToolExecutor/toolConfig";
import { manageAllowances, ManageAllowancesArgs } from "./manageAllowances";

const ALLOWANCE_FIELDS = [
  "chain",
  "tokenAddress",
  "ownerAddress",
  "spenderAddress",
  "action",
  "amount",
  "allowance",
  "txHash",
  "dryRun",
] as const;

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "dryRun", "fields"],
  properties: {
    queries: {
      type: "array",
      minimum: 1,
      description: "One or more allowance operations to perform.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chain", "tokenAddress", "ownerAddress", "spenderAddress", "amount", "action"],
        properties: {
          chain: {
            type: "string",
            description: "Chain the token lives on.",
          },
          tokenAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "ERC20 token contract address.",
          },
          ownerAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "Wallet address that owns the tokens. Required for read.",
          },
          spenderAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "Contract or address being granted or checked for allowance.",
          },
          amount: {
            type: "string",
            nullable: true,
            default: null,
            description: "Token amount in display units. Required for approve, ignored for revoke and read.",
          },
          action: {
            type: "string",
            enum: ["approve", "revoke", "read"],
            description: "Operation to perform.",
          },
        },
      },
    },
    dryRun: {
      type: "boolean",
      nullable: true,
      default: false,
      description: "When true, validate inputs and return a preview without submitting any transaction.",
    },
    fields: {
      type: "array",
      minimum: 1,
      nullable: true,
      default: null,
      description: "Optional list of output fields to include per result. Leave null to return the full payload.",
      items: {
        type: "string",
        enum: [...ALLOWANCE_FIELDS],
      },
    },
  },
};

export const manageAllowancesTool: ToolConfig<ManageAllowancesArgs> = {
  tool: {
    type: "function",
    name: "manage_allowances",
    description:
      "Approve, revoke, or read ERC20 token allowances for one or more spender addresses. Supports dryRun for safe previewing before submitting writes and optional field projection to reduce response payload.",
    parameters,
    strict: true,
    exampleCalls: [
      {
        queries: [{ chain: "base", tokenAddress: "0xabc...123", ownerAddress: "0xowner...", spenderAddress: "0xspender...", amount: null, action: "read" }],
        dryRun: null,
        fields: ["chain", "allowance"],
      },
      {
        queries: [{ chain: "base", tokenAddress: "0xabc...123", ownerAddress: "0xowner...", spenderAddress: "0xspender...", amount: "100", action: "approve" }],
        dryRun: true,
        fields: null,
      },
      {
        queries: [{ chain: "arbitrum", tokenAddress: "0xabc...123", ownerAddress: "0xowner...", spenderAddress: "0xspender...", amount: null, action: "revoke" }],
        dryRun: false,
        fields: ["chain", "txHash"],
      },
    ],
    handler: async (args) => {
      return manageAllowances(args);
    },
  },
  info: {
    category: "crypto",
    subcategory: "defi",
    tags: ["defi", "allowances", "manage"],
    riskLevel: "high",
    readOnly: false,
    access: "write",
    mode: "execute",
    provider: "onchain",
    version: "2.0.0",
    definition:
      "Manages ERC20 token allowances. Supports approve, revoke, and read actions across multiple queries in one call. Use dryRun to validate inputs before submitting. Write actions require a private key via NEO_PRIVATE_KEY env var.",
  },
};