import type { ToolParameters } from "../ToolExecutor/toolConfig.js";

interface AllowanceQuery {
  chain: string;
  tokenAddress: string;
  spenderAddress: string;
  amount?: string | null;
  action: "approve" | "revoke" | "request";
}

export interface BatchAllowanceArgs {
  queries: AllowanceQuery[];
  dryRun?: boolean | null;
}

export const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "dryRun"],
  properties: {
    queries: {
      type: "array",
      minimum: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chain", "tokenAddress", "spenderAddress", "amount", "action"],
        properties: {
          chain: { type: "string" },
          tokenAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          spenderAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          amount: {
            type: "string",
            nullable: true,
            default: null,
            description: "Required for approve/request, ignored for revoke",
          },
          action: {
            type: "string",
            enum: ["approve", "revoke", "request"],
          },
        },
      },
    },
    dryRun: {
      type: "boolean",
      nullable: true,
      default: false,
    },
  },
};