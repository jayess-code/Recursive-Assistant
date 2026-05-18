import { IToolCall } from "../../../../ToolExecutor/types";
import type { LLMContext, LLMProvider, LLMResponse } from "../../types/index";
import { BaseProvider } from "../base/baseProvider";
import ollama from "ollama";
import { loadOllamaRuntimeConfig } from "./ollamaConfig";
import { getLatestToolResult, isPlaceholderToolResponse, normalizeAssistantTools } from "./ollamaMessageUtils";
import { buildOllamaRequestPolicy, buildOllamaSystemPrompt } from "./ollamaRequestPolicy";
import { buildOllamaChatMessages, executeNonStreamingRequest, executeRetryNonStream, executeRetryWithoutTools, executeStreamingRequest, streamTextByChunks } from "./ollamaSendHelpers";


/**
 * Ollama Provider - Local inference via OpenAI-compatible API
 * Ollama: https://ollama.ai/
 * 
 * Setup:
 * 1. Download Ollama: https://ollama.ai/download
 * 2. Run: ollama pull mistral (or your preferred model)
 * 3. Start: ollama serve (defaults to http://localhost:11434)
 */
export class OllamaProvider extends BaseProvider implements LLMProvider {
  name = "ollama";
  private modelToolSupport = new Map<string, boolean>();

  private isRetryableOllamaError(error: any): boolean {
    const message = String(error?.message || "").toLowerCase();
    return (
      message.includes("aborted") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      error?.name === "AbortError"
    );
  }

  private isToolsUnsupportedError(error: any): boolean {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("does not support tools");
  }

  private maybeRewritePlaceholderText(text: string, boundedMessages: any[]): string {
    if (!isPlaceholderToolResponse(text)) {
      return text;
    }

    const latestToolResult = getLatestToolResult(boundedMessages);
    if (!latestToolResult) {
      return text;
    }

    return latestToolResult;
  }

  async send(context: LLMContext): Promise<LLMResponse> {
    const config = loadOllamaRuntimeConfig(process.env);
    const allowSimulatedStreamFallback =
      process.env.OLLAMA_SIMULATE_STREAM_FALLBACK === "true";

    process.env.OLLAMA_HOST = config.host;
    const client = ollama;

    // new OpenAI({
    //   apiKey: "ollama",
    //   baseURL: `${config.host}/v1`,
    //   timeout: config.timeoutMs,
    // });

    const allOllamaTools = normalizeAssistantTools(context.assistant.tools || []);
    const policy = buildOllamaRequestPolicy({
      context,
      config,
      allTools: allOllamaTools,
      modelToolSupport: this.modelToolSupport,
    });

    const requestMessages = policy.requestMessages;
    const systemPrompt = buildOllamaSystemPrompt({
      mode: policy.mode,
      hasTools: policy.toolsForRequest.length > 0,
      isSimpleFastPathTurn: policy.isSimpleFastPathTurn,
      assistantBasePrompt: context.assistant.instructions?.basePrompt,
      enableLocalModelToolPrompt: config.enableLocalModelToolPrompt,
      ...(config.localModelPrompt
        ? { localModelPrompt: config.localModelPrompt }
        : {}),
    });

    this.debugLog("request.policy", {
      model: policy.activeModel,
      selectedModel: policy.selectedModel,
      mode: policy.mode,
      simpleFastPath: policy.isSimpleFastPathTurn,
      tools: policy.toolsForRequest.length,
      maxMessages: requestMessages.length,
      maxTokens: policy.activeMaxTokens,
      stream: policy.shouldStream,
    });

    const chatMessages: any[] = buildOllamaChatMessages(systemPrompt, requestMessages);

    const startTime = Date.now();
    let text = "";
    const toolCalls: IToolCall[] = [];
    let response: any;

    try {
      if (policy.shouldStream) {
        const streamResult = await executeStreamingRequest({
          client,
          policy,
          chatMessages,
          context,
          config,
          startTime,
          selectedModel: policy.selectedModel,
          debugLog: this.debugLog.bind(this),
        });
        text = streamResult.text;
        toolCalls.push(...streamResult.toolCalls);
        response = streamResult.response;

        text = this.maybeRewritePlaceholderText(
          text,
          requestMessages
        );

      } else {
      const nonStreamResult = await executeNonStreamingRequest({
        client,
        policy,
        chatMessages,
        config,
        debugLog: this.debugLog.bind(this),
      });
      response = nonStreamResult.response;
      text = nonStreamResult.text;
      toolCalls.push(...nonStreamResult.toolCalls);

      text = this.maybeRewritePlaceholderText(
        text,
        requestMessages
      );

      }
    } catch (error: any) {
      console.error("❌ Ollama API error:", error.message);
      this.debugLog("request.error", {
        durationMs: Date.now() - startTime,
        message: error?.message,
        status: error?.status,
        code: error?.code,
        type: error?.type,
        responseError: error?.error,
      });

      if (
        config.retryNonStreamOnError &&
        policy.shouldStream &&
        this.isRetryableOllamaError(error)
      ) {
        this.debugLog("fallback.retry_non_stream.start", {
          model: policy.selectedModel,
          tools: policy.toolsForRequest.length,
        });

        try {
          const retryResult = await executeRetryNonStream({
            client,
            policy,
            chatMessages,
            config,
            debugLog: this.debugLog.bind(this),
          });
          let retryText = retryResult.text;
          const retryToolCalls = retryResult.toolCalls;

          if (context.stream && retryText && allowSimulatedStreamFallback) {
            streamTextByChunks(retryText, context.onToken);
          }
          retryText = this.maybeRewritePlaceholderText(
            retryText,
            requestMessages
          );

          this.debugLog("fallback.retry_non_stream.success", {
            durationMs: Date.now() - startTime,
            textLength: retryText.length,
            toolCalls: retryToolCalls.length,
            responseId: retryResult.response?.id,
          });

          return {
            content: retryText ? [{ kind: "text", value: retryText }] : [],
            toolCalls: retryToolCalls,
            raw: retryResult.response,
            provider: {
              name: this.name,
              messageId: retryResult.response?.id || "ollama-retry-non-stream-response",
            },
            toolMessages: [],
          };
        } catch (retryNonStreamError: any) {
          this.debugLog("fallback.retry_non_stream.error", {
            message: retryNonStreamError?.message,
            status: retryNonStreamError?.status,
            code: retryNonStreamError?.code,
            type: retryNonStreamError?.type,
          });
        }
      }

      if (
        config.retryWithoutTools &&
        policy.toolsForRequest.length > 0 &&
        (this.isRetryableOllamaError(error) ||
          this.isToolsUnsupportedError(error))
      ) {
        if (this.isToolsUnsupportedError(error)) {
          this.modelToolSupport.set(policy.selectedModel, false);
          this.debugLog("tools.unsupported_for_model", {
            model: policy.selectedModel,
            message: error?.message,
          });
        }

        this.debugLog("fallback.retry_without_tools.start", {
          streamRequested: Boolean(context.stream),
          model: policy.selectedModel,
        });

        try {
          const fallbackResult = await executeRetryWithoutTools({
            client,
            policy,
            chatMessages: buildOllamaChatMessages(systemPrompt, requestMessages),
            maxTokens: Math.min(config.maxTokens, 96),
            config,
            debugLog: this.debugLog.bind(this),
          });
          const fallbackText = this.maybeRewritePlaceholderText(
            fallbackResult.text,
            requestMessages
          );

          if (context.stream && fallbackText && allowSimulatedStreamFallback) {
            streamTextByChunks(fallbackText, context.onToken);
          }

          this.debugLog("fallback.retry_without_tools.success", {
            durationMs: Date.now() - startTime,
            textLength: fallbackText.length,
            responseId: fallbackResult.response?.id,
          });

          return {
            content: fallbackText ? [{ kind: "text", value: fallbackText }] : [],
            toolCalls: [],
            raw: fallbackResult.response,
            provider: {
              name: this.name,
              messageId: fallbackResult.response?.id || "ollama-fallback-response",
            },
            toolMessages: [],
          };
        } catch (fallbackError: any) {
          this.debugLog("fallback.retry_without_tools.error", {
            message: fallbackError?.message,
            status: fallbackError?.status,
            code: fallbackError?.code,
            type: fallbackError?.type,
          });
        }
      }

      throw error;
    }

    return {
      content: text ? [{ kind: "text", value: text }] : [],
      toolCalls,
      raw: response,
      provider: {
        name: this.name,
        messageId: response?.id || "ollama-response",
      },
      toolMessages: [], // Agent handles execution
    };
  }
}

