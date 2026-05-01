import type { InternalMessage } from "../Agent/messages.js";
import type { LLMContext, LLMResponse } from "../llm/types/index.js";
import type { ToolExecutor } from "../ToolExecutor/index.js";
import type { IToolCall } from "../ToolExecutor/types.js";


export interface ReasoningContext {
  provider: { send: (context: LLMContext) => Promise<LLMResponse> };
  toolExecutor?: ToolExecutor;
  maxIterations?: number;
  outputOptions?: {
    includeReasoningSteps?: boolean;
    includeExecutedToolCalls?: boolean;
  };
}

export class ReasoningEngine {
  private readonly provider: ReasoningContext["provider"];
  private readonly toolExecutor: ToolExecutor | undefined;
  private readonly maxIterations: number;
  private readonly outputOptions: ReasoningContext["outputOptions"];
  constructor(context: ReasoningContext) {
    this.provider = context.provider;
    this.toolExecutor = context.toolExecutor;
    this.maxIterations = context.maxIterations ?? 6;
    this.outputOptions = context.outputOptions;
  }

  async run(context: LLMContext): Promise<{
    finalText: string;
    messages: InternalMessage[];
    reasoningSteps: string[];
    executedToolCalls: IToolCall[];
  }> {
    const messages: InternalMessage[] = [...context.messages];
    const executedToolCalls: IToolCall[] = [];
    const reasoningSteps: string[] = [];

    let iteration = 0;
    let finalText = "";

    while (iteration < this.maxIterations) {
      iteration++;
      const iterationStart = Date.now();
      console.log("🧠 [Reasoning] Iteration start", { iteration, messageCount: messages.length });

      try {
        const requestContext: LLMContext = {
          ...context,
          messages,
          ...(typeof context.stream === "boolean" ? { stream: context.stream } : {}),
          ...(context.onToken ? { onToken: context.onToken } : {}),
        };

        const response = await this.provider.send(requestContext);
        console.log("🧠 [Reasoning] Iteration response", {
          iteration,
          durationMs: Date.now() - iterationStart,
          toolCalls: response.toolCalls?.length || 0,
          contentParts: response.content?.length || 0,
        });

        finalText = response.content
          .filter((c: LLMResponse["content"][number]) => c.kind === "text")
          .map((c: LLMResponse["content"][number]) => c.value)
          .join("\n");
        if (this.outputOptions?.includeReasoningSteps) {
          reasoningSteps.push(`iteration_${iteration}`);
        }

        messages.push({
          role: "assistant",
          content: response.content,
        });

        if (!response.toolCalls?.length) {
          return { finalText, messages, reasoningSteps, executedToolCalls };
        }

        if (!this.toolExecutor) {
          throw new Error("Tool calls were requested but no tool executor is configured");
        }

        const { toolMessages, toolCalls } = await this.toolExecutor.run(response.toolCalls);

        messages.push(...toolMessages);
        executedToolCalls.push(...toolCalls);
      } catch (error) {
        console.error("❌ [Reasoning] Iteration failed", {
          iteration,
          durationMs: Date.now() - iterationStart,
          messageCount: messages.length,
          stream: Boolean(context.stream),
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : error,
        });
        throw error;
      }
    }

    throw new Error("Max reasoning iterations reached");
  }
}