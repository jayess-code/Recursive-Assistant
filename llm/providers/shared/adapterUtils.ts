import type { InternalMessage } from "../../../Agent/messages.js";
import type { ResponseInputItem } from "openai/resources/responses/responses.js";

export type ChatInputMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
};

export type ExtractedToolCall = {
  name: string;
  args: any;
  callId: string;
};

export function safeParseToolArgs(rawArgs: any): any {
  if (typeof rawArgs === "string") {
    try {
      return JSON.parse(rawArgs || "{}");
    } catch {
      return {};
    }
  }

  return rawArgs || {};
}

export function mapInternalMessagesToResponseInput(
  messages: InternalMessage[]
): ResponseInputItem[] {
  return messages.flatMap((msg) => {
    if (msg.role === "tool") {
      return [
        {
          role: "user" as const,
          content: [
            {
              type: "input_text" as const,
              text: `Tool ${msg.toolName} returned: ${JSON.stringify(msg.result)}`,
            },
          ],
        },
      ];
    }

    const contentType =
      msg.role === "assistant"
        ? ("output_text" as const)
        : ("input_text" as const);
    const contentArray = Array.isArray(msg.content) ? msg.content : [msg.content];

    return [
      {
        role: msg.role as any,
        content: contentArray.map((part: any) => {
          const text =
            typeof part === "string"
              ? part
              : typeof part === "object"
                ? part.value
                : String(part);

          return {
            type: contentType,
            text,
          };
        }),
      } as ResponseInputItem,
    ];
  });
}

export function mapInternalMessagesToChatInput(
  messages: InternalMessage[]
): ChatInputMessage[] {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      const toolContent =
        typeof msg.result === "string"
          ? msg.result
          : JSON.stringify(msg.result ?? {});

      return {
        role: "tool",
        content: toolContent,
        tool_call_id: msg.toolCallId,
      };
    }

    const contentArray = Array.isArray(msg.content) ? msg.content : [msg.content];
    const text = contentArray
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && typeof part?.value === "string") {
          return part.value;
        }
        return String(part ?? "");
      })
      .join(" ")
      .trim();

    return {
      role: msg.role,
      content: text,
    };
  });
}

export function extractTextAndToolCallsFromResponse(response: any, options?: {
  includeChoices?: boolean;
  includeOutput?: boolean;
}) {
  const includeChoices = options?.includeChoices ?? true;
  const includeOutput = options?.includeOutput ?? true;

  let text = "";
  const toolCalls: ExtractedToolCall[] = [];

  if (includeChoices) {
    for (const choice of response?.choices || []) {
      const message = choice?.message;

      if (typeof message?.content === "string") {
        text += message.content;
      }

      for (const toolCall of message?.tool_calls || []) {
        const fn = toolCall?.function;
        if (!fn?.name) continue;

        toolCalls.push({
          name: fn.name,
          args: safeParseToolArgs(fn.arguments),
          callId: toolCall?.id || `tool-${toolCalls.length}`,
        });
      }
    }
  }

  if (includeOutput) {
    for (const item of response?.output || []) {
      if (item?.type === "function_call") {
        toolCalls.push({
          name: item.name,
          args: safeParseToolArgs(item.arguments),
          callId: item.call_id || `tool-${toolCalls.length}`,
        });
      }

      if (item?.type === "message") {
        for (const content of item?.content || []) {
          if (content?.type === "output_text" && typeof content?.text === "string") {
            text += content.text;
          }
        }
      }
    }
  }

  return { text, toolCalls };
}
