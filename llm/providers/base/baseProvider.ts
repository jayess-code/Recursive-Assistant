import type { LLMContext, LLMResponse } from "../../types/index.js";
import type { InternalMessage } from "../../../Agent/messages.js";
import type { IToolCall } from "../../../ToolExecutor/types.js";
import type { ToolExecutor } from "../../../ToolExecutor/index.js";

/**
 * BaseProvider contains common functionality shared by all LLM providers.
 * It does NOT handle reasoning loops, iteration, or tool orchestration.
 */
export abstract class BaseProvider {
  /** Unique provider name */
  abstract name: string;

  /** Max reasoning iterations (optional, can be used by Agent/ReasoningEngine) */
  protected MAX_ITERATIONS = 12;

  protected getProviderDebugEnvKey(): string {
    const normalized = String(this.name || "provider")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return `DEBUG_${normalized}_TRACE`;
  }

  protected isDebugEnabled(extraKeys: string[] = []): boolean {
    const keys = [
      "DEBUG_PROVIDER_TRACE",
      this.getProviderDebugEnvKey(),
      ...extraKeys,
    ];

    return keys.some((key) => process.env[key] === "true");
  }

  protected debugLog(label: string, payload?: Record<string, any>, extraKeys: string[] = []) {
    if (!this.isDebugEnabled(extraKeys)) return;

    const prefix = `🔎 [${this.name}] ${label}`;
    if (payload) {
      console.log(prefix, payload);
      return;
    }

    console.log(prefix);
  }

  /**
   * Execute a single LLM call and return structured response.
   * Must be implemented by concrete provider.
   */
  abstract send(
    context: LLMContext & {
      stream?: boolean;
      onToken?: (token: string) => void;
    }
  ): Promise<LLMResponse>;

  /**
   * Helper to run tool calls and append results to message array.
   * Delegates execution to ToolExecutor or runToolCalls.
   */
  protected async runAndAppendToolResults(
    toolCalls: IToolCall[],
    messages: InternalMessage[],
    toolExecutor: ToolExecutor
  ): Promise<InternalMessage[]> {
    if (!toolCalls?.length) return [];

    const { toolMessages } = await toolExecutor.run(toolCalls);

messages.push(...toolMessages);

return toolMessages;

  }
}
