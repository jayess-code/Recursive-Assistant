import type { ToolHandlerContext as BaseToolHandlerContext } from "../../../../Runtime/ToolExecutor/toolConfig";

export interface ToolExecutionPolicy {
  maxDeployCostETH?: number;
  allowedChains?: string[];
  dryRun?: boolean;
}

export interface SecretResolver {
  getEvmPrivateKey(input: {
    chain: string;
    purpose: "deploy_contract" | "read_contract" | "transfer" | "admin";
  }): Promise<`0x${string}`>;
  getApiKey(input: {
    provider: string;
    label?: string;
    envVar?: string;
  }): Promise<string>;
}

export interface ToolHandlerContext extends BaseToolHandlerContext {
  secrets?: SecretResolver;
  assistantId?: string;
  conversationId?: string;
  userId?: string;
  policy?: ToolExecutionPolicy;
  metadata?: Record<string, any>;
}
