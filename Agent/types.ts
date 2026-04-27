import type { IToolCall } from "../ToolExecutor/types.js";
import type { InternalMessage } from "./messages.js";

export interface AgentRunResult {
    reasoningSteps: string[];
    finalMessage: string;
    executedToolCalls: IToolCall[];
    messages: InternalMessage[];
}

