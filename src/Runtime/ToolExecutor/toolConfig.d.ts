// import { Response } from "openai/resources/responses/responses";
// import { SecureType, ToolHandlerContext } from "./secure-types";
// import { ServiceType } from "./services-types";
// import { ComputerRuntime } from "@/context/ComputerUse/ComputerRuntime";
export interface ToolHandlerContext {
  availableTools?: string[];
}
interface BaseTool {
    // description: string;
    type: string;

}

// export type ToolType = ToolFunction | ComputerUseToolType;
export type ToolType = ToolFunction | ComputerUseToolType;

export type ToolConfig<TArgs = any, TResult = any> = {
    tool: ToolFunction;
    info: ToolInfo;
};

/** --- Execution-related properties --- */
export interface ToolFunction<TArgs = any, TResult = any> {
    type: "function";
    name: string;
    description: string;

    /** JSON schema for function arguments */
    parameters: ToolParameters;

    /** If true, extra properties are not allowed in args */
    strict: boolean;

    /** The actual function that executes the tool logic */
    handler: (args: TArgs, context: ToolHandlerContext) => Promise<TResult>;

    /** Optional execution metadata */
    exampleCalls?: TArgs[];
    env?: { type: String },
    display_width?: { type: Number },
    display_height?: { type: Number },
    source?: string;
    schemaVersion?: "2025-10";
    validate?: (args: TArgs) => boolean | Promise<boolean>;
}

export type JSONSchema = {
  type: string | string[];
  description?: string;
  pattern?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  format?: string;
  default?: any;
  nullable?: boolean;

  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchema;
};

export type ToolParameters =
  | {
      type: "object";
      additionalProperties: false;
    } // zero-argument function
  | {
      type: "object";
      properties: Record<string, JSONSchema>;
      required?: string[];
      additionalProperties: boolean;
    };


export interface ComputerUseToolType extends BaseTool {
    type: "computer_use_preview";
    environment: "browser";
    display_width: number;
    display_height: number;
}

export type ToolSourceType = "local" | "mcp" | "webhook" | "queue";

export type ToolCategory =
|"mcp"
|"search"
  | "general"
  | "system"
  | "utility"
  | "jobs"
  | "storage"
  | "crypto"
  | "infra"
  | "defi"
  | "wallet"
  | "market-data"
  | "smartcontract";


export interface MCPToolConfig {
  server: string;
  toolName: string;
  namespace?: string;
}


/** --- Metadata / informational properties --- */
interface BaseToolInfo {
  version?: string;
  category?: ToolCategory;
  riskLevel?: "low" | "medium" | "high";
  readOnly?: boolean;
  requiresConfirmation?: boolean;
  access?: "read" | "write" | "admin";
  provider?: string;
  mode?: "execute" | "analyze" | "simulate" | "audit" | "builder";
  definition?: string;
  metadata?: Record<string, any>;
  isEnabled?: boolean;
}

export interface LocalToolInfo extends BaseToolInfo {
  source?: "local";
}

export interface MCPToolInfo extends BaseToolInfo {
  source: "mcp";
  mcp: {
    server: string;
    toolName: string;
    namespace?: string;
  };
}

export interface WebhookToolInfo extends BaseToolInfo {
  source: "webhook";
  webhook: {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    headers?: Record<string, string>;
    timeout?: number;
  };
}

export interface QueueToolInfo extends BaseToolInfo {
  source: "queue";
}

export type ToolInfo = LocalToolInfo | MCPToolInfo | WebhookToolInfo | QueueToolInfo;

export interface AssistantToolLink {
  tool: string; // ObjectId string (unresolved) or populated ToolConfig
  enabled: boolean;
}
