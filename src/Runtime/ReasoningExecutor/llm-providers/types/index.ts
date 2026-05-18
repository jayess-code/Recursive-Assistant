import type { InternalMessage } from "../../../Agent/messages";
import type { ToolFunction } from "../../../ToolExecutor/toolConfig";
import type { IToolCall } from "../../../ToolExecutor/types";

export interface LLMContentBlock {
  kind: "text" | "tool_output" | "image" | string;
  value: string;
}

export interface LLMResponse {
  content: LLMContentBlock[];
  reasoningSteps?: string[];
  toolCalls?: IToolCall[];
  raw?: unknown;
  provider: {
    name: string;
    messageId: string;
  };
  toolMessages?: unknown[];
}

export interface AssistantContext {
  id: string;
  model: string;
  instructions: {
    basePrompt: string;
  };
  tools: ToolFunction[];
  newToolNamesArray: string[];
  provider: string;
}

export type LLMContext = {
  assistant: AssistantContext;
  messages: InternalMessage[];
  stream?: boolean;
  onToken?: (token: string) => void;
  apiKey?: string;
}

export interface LLMProvider {
  name: string;
  send(context: LLMContext): Promise<LLMResponse>;
}