import type { IToolCall } from "../../../ToolExecutor/types.js";
import { parseToolArgs } from "./ollamaMessageUtils.js";
import { toOllamaAIInput } from "./ollamaMessageAdapter.js";

function buildOllamaOptions(config: any, maxTokens?: number) {
  return {
    num_ctx: Number(config?.numCtx || 2048),
    ...(typeof maxTokens === "number" ? { num_predict: maxTokens } : {}),
  };
}

function buildOllamaRequest(params: {
  policy: any;
  chatMessages: any[];
  config?: any;
  stream: boolean;
  maxTokens?: number;
  includeTools?: boolean;
}) {
  const { policy, chatMessages, config, stream, maxTokens, includeTools = true } = params;

  return {
    model: policy.activeModel,
    messages: chatMessages,
    stream,
    keep_alive: config?.keepAlive || "30m",
    options: buildOllamaOptions(config, maxTokens),
    ...(includeTools && policy.toolsForRequest.length
      ? { tools: policy.toolsForRequest }
      : {}),
  };
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Ollama request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function extractFromOllamaMessage(message: any): { text: string; toolCalls: IToolCall[] } {
  const text = typeof message?.content === "string" ? message.content : "";
  const toolCalls: IToolCall[] = [];

  const rawToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  for (let index = 0; index < rawToolCalls.length; index++) {
    const toolCall = rawToolCalls[index];
    const fn = toolCall?.function;
    const name = String(fn?.name || "").trim();
    if (!name) continue;

    const args = parseToolArgs(fn?.arguments);
    const callId =
      String(toolCall?.id || "").trim() || `ollama-tool-${name}-${index}`;

    toolCalls.push({ name, args, callId });
  }

  return { text, toolCalls };
}

export function buildOllamaChatMessages(systemPrompt: string, boundedMessages: any[]) {
  return [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...toOllamaAIInput(boundedMessages as any),
  ];
}

export async function executeStreamingRequest({
  client,
  policy,
  chatMessages,
  context,
  config,
  startTime,
  selectedModel,
  debugLog,
}: {
  client: any;
  policy: any;
  chatMessages: any[];
  context: any;
  config: any;
  startTime: number;
  selectedModel: string;
  debugLog: (label: string, payload?: Record<string, any>) => void;
}): Promise<{ text: string; toolCalls: IToolCall[]; firstTokenAt: number | null; response: any }> {
  debugLog("stream.request.start", {
    model: policy.activeModel,
    tools: policy.toolsForRequest.length,
    messages: chatMessages.length,
    maxTokens: policy.activeMaxTokens,
  });

  let text = "";
  let firstTokenAt: number | null = null;
  let firstChunkAt: number | null = null;
  const toolCalls: IToolCall[] = [];

  const abortController = new AbortController();
  const firstTokenTimeoutMs = Number(config.firstTokenTimeoutMs || 0);
  const firstTokenTimer =
    firstTokenTimeoutMs > 0
      ? setTimeout(() => {
          if (!firstTokenAt) {
            debugLog("stream.first_token_timeout", {
              timeoutMs: firstTokenTimeoutMs,
              model: selectedModel,
            });
            abortController.abort();
          }
        }, firstTokenTimeoutMs)
      : null;

  const stream = await runWithTimeout(
    client.chat(
      buildOllamaRequest({
        policy,
        chatMessages,
        config,
        stream: true,
        maxTokens: policy.activeMaxTokens,
      })
    ),
    Number(config?.timeoutMs || 0)
  );

  debugLog("stream.open", {
    model: policy.activeModel,
    openedMs: Date.now() - startTime,
  });

  const toolCallAccumulator = new Map<
    number,
    { id: string; name: string; argsText: string }
  >();

  for await (const chunk of stream as any) {
    if (!firstChunkAt) {
      firstChunkAt = Date.now();
      debugLog("stream.first_chunk", {
        firstChunkMs: firstChunkAt - startTime,
        model: selectedModel,
      });
    }

    const chunkText = String(chunk?.message?.content || "");
    if (chunkText) {
      const token = chunkText;
      if (!firstTokenAt) {
        firstTokenAt = Date.now();
        if (firstTokenTimer) clearTimeout(firstTokenTimer);
        debugLog("stream.first_token", {
          firstTokenMs: firstTokenAt - startTime,
        });
      }
      text += token;
      context.onToken?.(token);
    }

    if (Array.isArray(chunk?.message?.tool_calls)) {
      for (const [index, tc] of chunk.message.tool_calls.entries()) {
        const current = toolCallAccumulator.get(index) || {
          id: tc?.id || `ollama-tool-${index}`,
          name: tc?.function?.name || "",
          argsText: "",
        };

        if (tc?.id) current.id = tc.id;
        if (tc?.function?.name) current.name = tc.function.name;

        if (typeof tc?.function?.arguments === "string") {
          current.argsText += tc.function.arguments;
        } else if (tc?.function?.arguments && typeof tc.function.arguments === "object") {
          current.argsText = JSON.stringify(tc.function.arguments);
        }

        toolCallAccumulator.set(index, current);
      }
    }
  }

  if (firstTokenTimer) clearTimeout(firstTokenTimer);

  for (const accumulated of toolCallAccumulator.values()) {
    toolCalls.push({
      name: accumulated.name,
      args: parseToolArgs(accumulated.argsText),
      callId: accumulated.id,
    });
  }

  debugLog("stream.complete", {
    durationMs: Date.now() - startTime,
    firstChunkMs: firstChunkAt ? firstChunkAt - startTime : null,
    firstTokenMs: firstTokenAt ? firstTokenAt - startTime : null,
    textLength: text.length,
    toolCalls: toolCalls.length,
    model: selectedModel,
  });

  return {
    text,
    toolCalls,
    firstTokenAt,
    response: { stream: true },
  };
}

export async function executeNonStreamingRequest({
  client,
  policy,
  chatMessages,
  config,
  debugLog,
}: {
  client: any;
  policy: any;
  chatMessages: any[];
  config?: any;
  debugLog?: (label: string, payload?: Record<string, any>) => void;
}): Promise<{ text: string; toolCalls: IToolCall[]; response: any }> {
  const startedAt = Date.now();
  debugLog?.("non_stream.request.start", {
    model: policy.activeModel,
    tools: policy.toolsForRequest.length,
    messages: chatMessages.length,
    maxTokens: policy.activeMaxTokens,
  });

  const waitHeartbeat = setInterval(() => {
    debugLog?.("non_stream.waiting", {
      elapsedMs: Date.now() - startedAt,
      model: policy.activeModel,
      tools: policy.toolsForRequest.length,
    });
  }, 5000);

  try {
    const response: any = await runWithTimeout(
      client.chat(
        buildOllamaRequest({
          policy,
          chatMessages,
          config,
          stream: false,
          maxTokens: policy.activeMaxTokens,
        })
      ),
      Number(config?.timeoutMs || 0)
    );

    const parsed = extractFromOllamaMessage(response?.message);
    debugLog?.("non_stream.complete", {
      durationMs: Date.now() - startedAt,
      textLength: parsed.text.length,
      toolCalls: parsed.toolCalls.length,
      model: policy.activeModel,
      responseId: response?.created_at,
    });
    return {
      text: parsed.text,
      toolCalls: parsed.toolCalls,
      response,
    };
  } finally {
    clearInterval(waitHeartbeat);
  }
}

export async function executeRetryNonStream({
  client,
  policy,
  chatMessages,
  config,
  debugLog,
}: {
  client: any;
  policy: any;
  chatMessages: any[];
  config?: any;
  debugLog?: (label: string, payload?: Record<string, any>) => void;
}): Promise<{ text: string; toolCalls: IToolCall[]; response: any }> {
  const startedAt = Date.now();
  debugLog?.("retry_non_stream.request.start", {
    model: policy.activeModel,
    tools: policy.toolsForRequest.length,
    messages: chatMessages.length,
    maxTokens: policy.activeMaxTokens,
  });

  const waitHeartbeat = setInterval(() => {
    debugLog?.("retry_non_stream.waiting", {
      elapsedMs: Date.now() - startedAt,
      model: policy.activeModel,
      tools: policy.toolsForRequest.length,
    });
  }, 5000);

  try {
    const retryResponse: any = await runWithTimeout(
      client.chat(
        buildOllamaRequest({
          policy,
          chatMessages,
          config,
          stream: false,
          maxTokens: policy.activeMaxTokens,
        })
      ),
      Number(config?.timeoutMs || 0)
    );

    const retryParsed = extractFromOllamaMessage(retryResponse?.message);
    debugLog?.("retry_non_stream.complete", {
      durationMs: Date.now() - startedAt,
      textLength: retryParsed.text.length,
      toolCalls: retryParsed.toolCalls.length,
      model: policy.activeModel,
      responseId: retryResponse?.created_at,
    });
    return {
      text: retryParsed.text,
      toolCalls: retryParsed.toolCalls,
      response: retryResponse,
    };
  } finally {
    clearInterval(waitHeartbeat);
  }
}

export async function executeRetryWithoutTools({
  client,
  policy,
  chatMessages,
  maxTokens,
  config,
  debugLog,
}: {
  client: any;
  policy: any;
  chatMessages: any[];
  maxTokens: number;
  config?: any;
  debugLog?: (label: string, payload?: Record<string, any>) => void;
}): Promise<{ text: string; response: any }> {
  const startedAt = Date.now();
  debugLog?.("retry_without_tools.request.start", {
    model: policy.activeModel,
    messages: chatMessages.length,
    maxTokens,
  });

  const waitHeartbeat = setInterval(() => {
    debugLog?.("retry_without_tools.waiting", {
      elapsedMs: Date.now() - startedAt,
      model: policy.activeModel,
    });
  }, 5000);

  try {
    const fallbackResponse: any = await runWithTimeout(
      client.chat(
        buildOllamaRequest({
          policy,
          chatMessages,
          config,
          stream: false,
          maxTokens,
          includeTools: false,
        })
      ),
      Number(config?.timeoutMs || 0)
    );

    const parsed = extractFromOllamaMessage(fallbackResponse?.message);
    debugLog?.("retry_without_tools.complete", {
      durationMs: Date.now() - startedAt,
      textLength: parsed.text.length,
      model: policy.activeModel,
      responseId: fallbackResponse?.created_at,
    });
    return {
      text: parsed.text,
      response: fallbackResponse,
    };
  } finally {
    clearInterval(waitHeartbeat);
  }
}

export function streamTextByChunks(text: string, onToken?: (token: string) => void) {
  if (!text || !onToken) return;
  const chunks = text.split(/(\s+)/).filter(Boolean);
  for (const chunk of chunks) {
    onToken(chunk);
  }
}
