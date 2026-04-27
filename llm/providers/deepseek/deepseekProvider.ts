import OpenAI from "openai";
import { BaseProvider } from "../base/baseProvider.js";
import type { LLMContext, LLMProvider, LLMResponse } from "../../types/index.js";
import type { InternalMessage } from "../../../Agent/messages.js";


export class DeepSeekProvider extends BaseProvider implements LLMProvider {
  name = "deepseek";

  async send(
    context: LLMContext & {
      apiKey?: string;
      stream?: boolean;
      onToken?: (token: string) => void;
    }
  ): Promise<LLMResponse> {
    const apiKey = context.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY not provided");

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
    });

    // Normalize tools (strip handlers)
    const deepseekTools = (context.assistant.tools || [])
      .map((tc: any) => (tc.tool ? tc.tool : tc))
      .filter(Boolean);

    // Normalize messages
    const chatMessages = context.messages.map((msg: InternalMessage) => ({
      role: msg.role === "tool" ? "system" : msg.role,
      content:
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
          ? msg.content.map((c: any) =>
              typeof c === "string" ? c : c.value || ""
            ).join(" ")
          : "",
    }));

    let text = "";
    const toolCalls: Array<{ name: string; args: any; callId: string }> = [];
    let response: any;

    try {
      if (context.stream) {
        const stream = await client.chat.completions.create({
          model: context.assistant.model || "deepseek-chat",
          messages: chatMessages as any,
          ...(deepseekTools.length ? { tools: deepseekTools as any } : {}),
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            text += delta.content;
            context.onToken?.(delta.content);
          }

          if (delta.tool_calls) {
            for (const call of delta.tool_calls) {
              if (!call.function?.name || !call.id) continue;

              toolCalls.push({
                name: call.function.name,
                args: call.function.arguments
                  ? JSON.parse(call.function.arguments)
                  : {},
                callId: call.id,
              });
            }
          }
        }

        response = { stream: true };
      } else {
        response = await client.chat.completions.create({
          model: context.assistant.model || "deepseek-chat",
          messages: chatMessages as any,
          ...(deepseekTools.length ? { tools: deepseekTools as any } : {}),
        });

        for (const choice of response.choices) {
          if (choice.message?.content) {
            text += choice.message.content;
          }

          if (choice.message?.tool_calls) {
            for (const call of choice.message.tool_calls) {
              if (!call.function?.name || !call.id) continue;

              toolCalls.push({
                name: call.function.name,
                args: call.function.arguments
                  ? JSON.parse(call.function.arguments)
                  : {},
                callId: call.id,
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.error("❌ DeepSeek API error:", err.message);
      throw err;
    }

    return {
      content: text ? [{ kind: "text", value: text }] : [],
      toolCalls,
      raw: response,
      provider: {
        name: this.name,
        messageId: response?.id || "deepseek-response",
      },
      toolMessages: [], // Agent handles execution
    };
  }
}
