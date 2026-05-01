import { getProvider } from "../llm/providers/index.js";
import { ReasoningEngine, type ReasoningContext } from "../ReasoningExecutor/ReasoningExecutor.js";
import { ToolExecutor } from "../ToolExecutor/index.js";
import type { ToolConfig, ToolFunction } from "../ToolExecutor/toolConfig.js";
import { ToolRegistry } from "../ToolExecutor/toolRegistry.js";
import { buildAssistantSystemPrompt } from "./buildPrompt/index.js";
import {
    buildRuntimeContextMessage,
    type PromptRuntimeContext,
} from "./buildPrompt/buildRuntimePrompt.js";
import type { InternalMessage } from "./messages.js";
import type { AgentRunResult, AssistantInstructionShape } from "./types.js";


export interface AgentDefinition {
  id?: string;
  name: string;
  description: string;
  tools: string[];
  instructions: AssistantInstructionShape;
}

export interface AgentRuntime {
  provider: {
    name: string;
    model: string;
  };
  maxIterations?: number;
  apiKey?: string;
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
            console.warn("[Agent] Some declared tools are not registered", {
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
        const providerTools: ToolFunction[] = Object.values(resolvedTools).map((toolConfig) => toolConfig.tool);
        const toolExecutor = new ToolExecutor(this, resolvedTools);
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

        const engine = new ReasoningEngine({
            ...runtime.reasoningEngineOptions,
            provider,
            toolExecutor,
            maxIterations: runtime.maxIterations ?? runtime.reasoningEngineOptions?.maxIterations ?? 6,
        });

        

        const reasoningResult = await engine.run({
            assistant: {
                id: this.definition.id ?? this.definition.name,
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