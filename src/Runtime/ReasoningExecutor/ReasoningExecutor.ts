import type { InternalMessage } from "../Agent/messages";
import type { LLMContext, LLMResponse } from "./llm-providers/types/index";
import type { IToolCall, ToolCallRunner } from "../ToolExecutor/types";


export interface ReasoningContext {
  provider: { send: (context: LLMContext) => Promise<LLMResponse> };
  toolExecutor?: ToolCallRunner;
  maxIterations?: number;
  outputOptions?: {
    includeReasoningSteps?: boolean;
    includeExecutedToolCalls?: boolean;
  };
}

export class ReasoningEngine {
  private readonly provider: ReasoningContext["provider"];
  private readonly toolExecutor: ToolCallRunner | undefined;
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

        console.log("🔧 [Tool Batch] Start", {
          iteration,
          toolCount: response.toolCalls.length,
          toolNames: response.toolCalls.map((toolCall) => toolCall.name),
          toolCallIds: response.toolCalls.map((toolCall) => toolCall.callId),
        });

        const { toolMessages, toolCalls } = await this.toolExecutor.run(response.toolCalls);

        console.log("🔧 [Tool Batch] Complete", {
          iteration,
          toolCount: toolCalls.length,
          completed: toolCalls.filter((toolCall) => toolCall.status === "completed").length,
          failed: toolCalls.filter((toolCall) => toolCall.status === "failed").length,
        });

        messages.push(...toolMessages);
        executedToolCalls.push(...toolCalls);
      } catch (error) {
        const systemErrorMessage = this.buildRecoverableSystemErrorMessage(error);

        console.error("❌ [Reasoning] Iteration failed", {
          iteration,
          durationMs: Date.now() - iterationStart,
          messageCount: messages.length,
          stream: Boolean(context.stream),
          recoverable: Boolean(systemErrorMessage),
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : error,
        });

        if (systemErrorMessage) {
          messages.push({
            role: "system",
            content: systemErrorMessage,
          });

          return {
            finalText: systemErrorMessage,
            messages,
            reasoningSteps,
            executedToolCalls,
          };
        }

        throw error;
      }
    }

    throw new Error("Max reasoning iterations reached");
  }

  private buildRecoverableSystemErrorMessage(error: unknown): string | null {
    const errorLike = error as {
      code?: unknown;
      type?: unknown;
      message?: unknown;
      status?: unknown;
    };

    const code = typeof errorLike?.code === "string" ? errorLike.code : "";
    const type = typeof errorLike?.type === "string" ? errorLike.type : "";
    const status = typeof errorLike?.status === "number" ? errorLike.status : undefined;
    const message =
      error instanceof Error
        ? error.message
        : typeof errorLike?.message === "string"
          ? errorLike.message
          : "";

    const isServerSide =
      code === "server_error" ||
      type === "server_error" ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504;

    const hasRetryHint = /retry your request|help\.openai\.com/i.test(message);

    if (!isServerSide && !hasRetryHint) {
      return null;
    }

    return [
      "[SYSTEM] The model provider returned a temporary server error.",
      "Your workflow can continue. Please retry the same command.",
      message ? `Details: ${message}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
}