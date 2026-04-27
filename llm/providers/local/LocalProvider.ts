import type { LLMContext, LLMProvider, LLMResponse } from "../../types/index.js";
import type { InternalMessage } from "../../../Agent/messages.js";
import type { IToolCall } from "../../../ToolExecutor/types.js";

export class LocalProvider implements LLMProvider {
  name = "local";

  async send(context: LLMContext): Promise<LLMResponse> {
    const toolCalls: IToolCall[] = context.messages
      .filter((msg): msg is Extract<InternalMessage, { role: "tool" }> => msg.role === "tool")
      .map((toolMsg, index) => ({
        name: toolMsg.toolName,
        args: {},
        result: toolMsg.result,
        status: "completed",
        callId: toolMsg.toolCallId || `local-tool-${index}`,
      }));

    return {
      // content: text ? [{ kind: "text", value: text }] : [],
      content:  [],
      toolCalls,
      raw: null,
      provider: {
        name: this.name,
        messageId: "local-response",
      },
      toolMessages: [], // Agent handles execution
    };
  }
}
