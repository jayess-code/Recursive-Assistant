import type { LLMContext, LLMResponse } from "../../types/index";
import { BaseProvider } from "../base/baseProvider";
import { createOpenAIClient } from "../shared/providerUtils";
import { toOpenAIInput } from "./openaiMessageAdapter";
import { executeOpenAINonStreamingRequest, executeOpenAIStreamingRequest } from "./openaiSendHelpers";



export class OpenAIProvider extends BaseProvider {
  name = "openai";
  private readonly defaultModel = "gpt-4o-mini";

  async send(context: LLMContext): Promise<LLMResponse> {
    try {
      const client = createOpenAIClient(context.apiKey);

      const input = toOpenAIInput(context.messages);
      const instructions = context.assistant.instructions.basePrompt;

      if (context.stream) {
        const streamResult = await executeOpenAIStreamingRequest({
          client,
          context,
          input,
          model: context.assistant.model || this.defaultModel,
          instructions,
          tools: context.assistant.tools,
        });

        return {
          content: streamResult.text ? [{ kind: "text", value: streamResult.text }] : [],
          toolCalls: streamResult.toolCalls,
          raw: streamResult.finalResponse,
          provider: {
            name: this.name,
            messageId: streamResult.finalResponse?.id ?? Date.now().toString(),
          },
          toolMessages: [],
        };
      }

      const nonStreamResult = await executeOpenAINonStreamingRequest({
        client,
        input,
        model: context.assistant.model || this.defaultModel,
        instructions,
        tools: context.assistant.tools,
      });

      return {
        content: nonStreamResult.text ? [{ kind: "text", value: nonStreamResult.text }] : [],
        toolCalls: nonStreamResult.toolCalls,
        raw: nonStreamResult.response,
        provider: {
          name: this.name,
          messageId: nonStreamResult.response.id,
        },
        toolMessages: [],
      };
    } catch (error) {
      console.error("❌ [OpenAIProvider.send] Provider request failed", {
        model: context.assistant.model || this.defaultModel,
        stream: Boolean(context.stream),
        messageCount: context.messages?.length ?? 0,
        toolsCount: context.assistant?.tools?.length ?? 0,
        assistantId: (context as any)?.assistant?.assistantId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      });
      throw error;
    }
  }
}

