import type { InternalMessage } from "../../../Agent/messages.js";

/**
 * Unified message adapter for OpenAI-compatible providers
 * Converts InternalMessage[] to OpenAI chat format
 *
 * ✅ CRITICAL RULE: content type depends on ROLE
 * - user/system messages → type: "text"
 * - assistant messages → type: "text" (for chat.completions format)
 * - tool messages → converted to user messages with tool result text
 */
export function toOpenAICompatibleInput(messages: InternalMessage[]): Array<{ role: string; content: string | any[] }> {
  return messages.flatMap((msg) => {
    if (msg.role === "tool") {
      // Tool results are injected as user-visible text
      return [
        {
          role: "user",
          content: `Tool ${msg.toolName} returned: ${JSON.stringify(msg.result)}`,
        },
      ];
    }

    // Normalize content to string
    const contentArray = Array.isArray(msg.content) ? msg.content : [msg.content];
    const text = contentArray
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part.value) return part.value;
        return String(part);
      })
      .join("");

    return [
      {
        role: msg.role,
        content: text,
      },
    ];
  });
}

/**
 * Extract text and tool calls from OpenAI-compatible response
 * Works with responses from chat.completions endpoint
 */
export function extractTextAndToolCalls(response: any): {
  text: string;
  toolCalls: Array<{ name: string; args: any; callId: string }>;
} {
  let text = "";
  const toolCalls: Array<{ name: string; args: any; callId: string }> = [];

  // Handle chat.completions format (DeepSeek, Ollama, OpenAI chat endpoint)
  if (response.choices && Array.isArray(response.choices)) {
    const choice = response.choices[0];
    if (choice.message) {
      const message = choice.message;
      if (message.content) {
        text += message.content;
      }
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
          toolCalls.push({
            name: tc.function.name,
            args: typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments,
            callId: tc.id,
          });
        }
      }
    }
  }
  // Handle Responses API format (OpenAI Responses API)
  else if (response.output && Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "function_call") {
        toolCalls.push({
          name: item.name,
          args: item.arguments,
          callId: item.call_id,
        });
      }

      if (item.type === "message") {
        for (const content of item.content) {
          if (content.type === "output_text") {
            text += content.text;
          }
        }
      }
    }
  }

  return { text, toolCalls };
}
