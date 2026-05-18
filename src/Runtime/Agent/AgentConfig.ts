import { getProvider } from "../ReasoningExecutor/llm-providers/providers/index";
import { ReasoningEngine, type ReasoningContext } from "../ReasoningExecutor/ReasoningExecutor";
import { ToolExecutor } from "../ToolExecutor/index";
import type { ToolConfig, ToolFunction } from "../ToolExecutor/toolConfig";
import type { ToolExecutionContext } from "../ToolExecutor/types";
import { ToolRegistry } from "../../Tools/toolRegistry";
import { buildAssistantSystemPrompt } from "./buildPrompt/index";
import {
    buildRuntimeContextMessage,
    type PromptRuntimeContext,
} from "./buildPrompt/buildRuntimePrompt";
import type { InternalMessage } from "./messages";
import type { AgentRunResult, AssistantInstructionShape } from "./types";


export interface AgentDefinition {
  id?: string;
  name: string;
  description: string;
  tools: string[];
  auth?:{
    wallets?: Array<{
    name?: string;
    description?: string;
    protocol: string;
    address?: `0x${string}`;
    /**
     * privatekey will be encrypted using bcrypt and stored securely, 
    * and decrypted only when needed, never logged or exposed in plaintext
    */ 
    // privatekey: string;
  }>;
  apiKeys?: Array<{
    name: string;
    description?: string;
    key: string;
  }>;
  passwords?: Array<{
    name: string;
    description?: string;
    value: string;
  }>;
  };
  
  instructions: AssistantInstructionShape;
}

export interface AgentRuntime {
  provider: {
    name: string;
    model: string;
  };
  maxIterations?: number;
  toolRegistry?: Record<string, ToolConfig>;
  promptRuntimeContext?: PromptRuntimeContext;
  reasoningEngineOptions?: Partial<ReasoningContext>;
  stream?: boolean;
    onToken?: (token: string) => void;
}

export class Agent {
    private readonly definition: AgentDefinition;
    private readonly runtime: AgentRuntime;

    constructor(definition: AgentDefinition, runtime: AgentRuntime) {
        this.definition = definition;
        this.runtime = runtime;
    }

    getDefinition(): AgentDefinition {
        return this.definition;
    }

    getRuntime(): AgentRuntime {
        return this.runtime;
    }

    private resolveTools(runtime: AgentRuntime): Record<string, ToolConfig> {
        const registry = new ToolRegistry(runtime.toolRegistry ?? {});
        const resolvedTools = registry.resolve(this.definition.tools);
        const missingTools = this.definition.tools.filter((toolName) => !resolvedTools[toolName]);

        if (missingTools.length > 0) {
            console.warn(`[Agent \`${this.definition.name}\`] Some declared tools are not registered`, {
                agent: this.definition.name,
                missingTools,
            });
        }

        return resolvedTools;
    }

    async run(
        initialMessages: InternalMessage[],
        runtimeOverrides?: Partial<AgentRuntime>,
): Promise<AgentRunResult> {
        const runtime: AgentRuntime = {
            ...this.runtime,
            ...runtimeOverrides,
            provider: {
                ...this.runtime.provider,
                ...runtimeOverrides?.provider,
            },
        };

        const provider = getProvider(runtime.provider.name);
        const resolvedTools = this.resolveTools(runtime);
        const assistantId = this.definition.id ?? this.definition.name;
        const toolExecutionContext: ToolExecutionContext = {
            assistantId,
        };
        const providerTools: ToolFunction[] = Object.values(resolvedTools).map((toolConfig) => toolConfig.tool);
        const toolExecutor = new ToolExecutor(toolExecutionContext, resolvedTools);
        const runtimeSystemMessage: InternalMessage | null = runtime.promptRuntimeContext
            ? {
                role: "system",
                content: buildRuntimeContextMessage(runtime.promptRuntimeContext),
            }
            : null;
        const messages: InternalMessage[] = runtimeSystemMessage
            ? [runtimeSystemMessage, ...initialMessages]
            : [...initialMessages];
        const assistantBasePrompt = buildAssistantSystemPrompt({
            name: this.definition.name,
            description: this.definition.description,
            instructions: this.definition.instructions,
            tools: this.definition.tools,
        }, resolvedTools);
// console.log("[Agent] Starting run with context", {
//     agentName: this.definition.name,
//     provider: runtime.provider,
//     assistantBasePrompt
// });
        const engine = new ReasoningEngine({
            ...runtime.reasoningEngineOptions,
            provider,
            toolExecutor,
            maxIterations: runtime.maxIterations ?? runtime.reasoningEngineOptions?.maxIterations ?? 6,
        });

        

        const reasoningResult = await engine.run({
            assistant: {
                id: assistantId,
                model: runtime.provider.model,
                instructions: { basePrompt: assistantBasePrompt },
                tools: providerTools,
                newToolNamesArray: this.definition.tools,
                provider: runtime.provider.name,
            },
            messages,
            ...(typeof runtime.stream === "boolean" ? { stream: runtime.stream } : {}),
            ...(runtime.onToken ? { onToken: runtime.onToken } : {}),
        });

        return {
            finalMessage: reasoningResult.finalText,
            reasoningSteps: reasoningResult.reasoningSteps,
            executedToolCalls: reasoningResult.executedToolCalls,
            messages: reasoningResult.messages,
        };
    }
}