import type { IToolCall } from "../ToolExecutor/types";
import type { InternalMessage } from "./messages";

export interface AgentRunResult {
    reasoningSteps: string[];
    finalMessage: string;
    executedToolCalls: IToolCall[];
    messages: InternalMessage[];
}

export type AssistantInstructionShape = {
	basePrompt: string;
    systemPrompt?: string;
    personaHeader?: string;
    keyPrinciples?: string[];
    personalityTraits?: string[];
    workflow?: string;
    safety?: string;
    meta?: string;
    voice?: string;
    tools?: string[];
};
