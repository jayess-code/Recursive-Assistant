import type { InternalMessage } from "../Agent/messages";

export interface IToolCall {
  name: string;
  args: any;
  result?: any;
  status?: "pending" | "completed" | "failed";
  
//   timestamp: Date;
  callId: string;
}

export interface ToolExecutionContext {
  assistantId: string;
  conversationId?: string;
}

export interface ToolExecutionResult {
  toolMessages: InternalMessage[];
  toolCalls: IToolCall[];
}

export interface ToolCallRunner {
  run(toolCalls: IToolCall[]): Promise<ToolExecutionResult>;
}
