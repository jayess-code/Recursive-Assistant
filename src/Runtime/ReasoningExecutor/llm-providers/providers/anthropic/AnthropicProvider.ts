import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "../base/baseProvider";
import type { LLMContext, LLMProvider, LLMResponse } from "../../types/index";
import type { ContentPart, InternalMessage } from "../../../../Agent/messages";
import type { IToolCall } from "../../../../ToolExecutor/types";

/**
 * Thin Anthropic Provider - just calls the API once
 */
export class AnthropicProvider extends BaseProvider implements LLMProvider {
  name = "anthropic";

  async send(context: LLMContext & { apiKey?: string; stream?: boolean; onToken?: (token: string) => void }): Promise<LLMResponse> {
    const apiKey = context.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not provided");

    const client = new Anthropic({ apiKey });

    // Convert messages to Anthropic format
    const chatMessages: { role: "user" | "assistant"; content: string }[] =
      context.messages.map((msg: InternalMessage) => {
        if (msg.role === "tool") {
          return {
            role: "user",
            content: `Tool ${msg.toolName} returned: ${JSON.stringify(msg.result)}`,
          };
        }

        const normalizedContent =
          typeof msg.content === "string"
            ? msg.content
            : msg.content
                .map((part: string | ContentPart) =>
                  typeof part === "string" ? part : part.value
                )
                .join(" ");

        return {
          role: msg.role === "assistant" ? "assistant" : "user",
          content: normalizedContent,
        };
      });

      // Convert internal tools to Anthropic tools
const anthropicTools = (context.assistant.tools || []).map((t: any) => ({
  name: t.name,
  description: t.description || "",
  input_schema: t.parameters || {}, // parameters -> input_schema
}));


    // Non-streaming call (streaming could be added later if needed)
    const response = await client.messages.create({
  model: context.assistant.model,
  max_tokens: 4096,
  system: context.assistant.instructions.basePrompt,
  messages: chatMessages as any,
  tools: anthropicTools, // <- fixed
});


    // Extract text & tool calls
    let text = "";
    const toolCalls: IToolCall[] = [];

    for (const contentItem of response.content) {
      if (contentItem.type === "tool_use") {
        toolCalls.push({
          name: contentItem.name,
          args: contentItem.input,
          callId: contentItem.id,
        });
      } else if (contentItem.type === "text") {
        text += contentItem.text;
      }
    }

    return {
      content: text ? [{ kind: "text", value: text }] : [],
      toolCalls,
      raw: response,
      provider: {
        name: this.name,
        messageId: response.id || "anthropic-response",
      },
      toolMessages: [], // Agent will handle executing tools
    };
  }
}
