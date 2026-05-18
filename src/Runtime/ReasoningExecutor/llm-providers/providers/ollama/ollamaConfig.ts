export type OllamaRuntimeConfig = {
  host: string;
  defaultModel: string;
  timeoutMs?: number;
  firstTokenTimeoutMs?: number;
  keepAlive: string;
  numCtx: number;
  enableLocalModelToolPrompt: boolean;
  localModelPrompt?: string;
  enableSimpleFastPath: boolean;
  fastPathMaxTokens: number;
  fastPathMaxMessages: number;
  enableTools: boolean;
  streamWithTools: boolean;
  toolLimit: number;
  retryWithoutTools: boolean;
  retryNonStreamOnError: boolean;
  enablePostToolMinimalContext: boolean;
  postToolMaxMessages: number;
  postToolMaxTokens: number;
  maxTokens: number;
  maxMessages: number;
  toolPlanningMaxTokens: number;
  toolPlanningMaxMessages: number;
  toolPlanningModel: string;
};

export function loadOllamaRuntimeConfig(env: NodeJS.ProcessEnv): OllamaRuntimeConfig {
  return {
    host: env.OLLAMA_HOST || "http://localhost:11434",
    defaultModel: env.OLLAMA_DEFAULT_MODEL || "llama3.1",
    timeoutMs: Number(env.OLLAMA_TIMEOUT_MS || 120000),
    firstTokenTimeoutMs: Number(env.OLLAMA_FIRST_TOKEN_TIMEOUT_MS || 45000),
    keepAlive: env.OLLAMA_KEEP_ALIVE || "30m",
    numCtx: Math.max(256, Number(env.OLLAMA_NUM_CTX || 2048)),
    enableLocalModelToolPrompt:
      env.OLLAMA_ENABLE_LOCAL_MODEL_TOOL_PROMPT !== "false",
    localModelPrompt: env.OLLAMA_LOCAL_MODEL_PROMPT?.trim() || "",
    enableSimpleFastPath: env.OLLAMA_ENABLE_SIMPLE_FAST_PATH !== "false",
    fastPathMaxTokens: Math.max(16, Number(env.OLLAMA_FAST_PATH_MAX_TOKENS || 80)),
    fastPathMaxMessages: Math.max(
      1,
      Number(env.OLLAMA_FAST_PATH_MAX_MESSAGES || 3)
    ),
    enableTools: env.OLLAMA_ENABLE_TOOLS === "true",
    streamWithTools: env.OLLAMA_STREAM_WITH_TOOLS !== "false",
    toolLimit: Math.max(0, Number(env.OLLAMA_TOOL_LIMIT || 4)),
    retryWithoutTools: env.OLLAMA_RETRY_WITHOUT_TOOLS !== "false",
    retryNonStreamOnError: env.OLLAMA_RETRY_NON_STREAM_ON_ERROR !== "false",
    enablePostToolMinimalContext:
      env.OLLAMA_ENABLE_POST_TOOL_MINIMAL_CONTEXT !== "false",
    postToolMaxMessages: Math.max(
      1,
      Number(env.OLLAMA_POST_TOOL_MAX_MESSAGES || 2)
    ),
    postToolMaxTokens: Math.max(
      32,
      Number(env.OLLAMA_POST_TOOL_MAX_TOKENS || 200)
    ),
    maxTokens: Math.max(32, Number(env.OLLAMA_MAX_TOKENS || 200)),
    maxMessages: Math.max(1, Number(env.OLLAMA_MAX_MESSAGES || 20)),
    toolPlanningMaxTokens: Math.max(
      16,
      Number(env.OLLAMA_TOOL_PLANNING_MAX_TOKENS || 64)
    ),
    toolPlanningMaxMessages: Math.max(
      1,
      Number(env.OLLAMA_TOOL_PLANNING_MAX_MESSAGES || 3)
    ),
    toolPlanningModel: env.OLLAMA_TOOL_PLANNING_MODEL?.trim() || "",
  };
}
