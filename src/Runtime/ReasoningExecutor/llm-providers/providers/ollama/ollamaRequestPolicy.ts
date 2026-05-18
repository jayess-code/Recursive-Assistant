import type { LLMContext } from "../../types/index";
import type { OllamaRuntimeConfig } from "./ollamaConfig";

function buildPostToolMinimalMessages(messages: any[], maxMessages: number): any[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  let latestToolIndex = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "tool") {
      latestToolIndex = index;
      break;
    }
  }

  if (latestToolIndex < 0) {
    return messages.slice(-Math.max(1, maxMessages));
  }

  let latestUserBeforeToolIndex = -1;
  for (let index = latestToolIndex - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") {
      latestUserBeforeToolIndex = index;
      break;
    }
  }

  const selected: any[] = [];
  if (latestUserBeforeToolIndex >= 0) {
    selected.push(messages[latestUserBeforeToolIndex]);
  }
  selected.push(messages[latestToolIndex]);

  return selected.slice(-Math.max(1, maxMessages));
}

function normalizeUserText(message: any): string {
  if (!message || message.role !== "user") return "";
  const content = message.content;

  if (typeof content === "string") {
    return content.trim().toLowerCase();
  }

  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part?.value === "string") return part.value;
        return "";
      })
      .join(" ")
      .trim()
      .toLowerCase();
  }

  return "";
}

function shouldUseToolPlanningMode(latestMessage: any): boolean {
  const text = normalizeUserText(latestMessage);
  if (!text) return false;

  const toolIntentRegex =
    /\b(weather|temperature|forecast|time|date|datetime|price|prices|crypto|coin|token|market|btc|eth|sol|xrp|doge|ada|portfolio|balance|wallet|jobs?|search|task|chains?)\b/i;

  if (toolIntentRegex.test(text)) {
    return true;
  }

  if (/^(try|check|get|fetch|show)\b/i.test(text)) {
    return true;
  }

  return false;
}

function shouldUseSimpleFastPath(latestMessage: any): boolean {
  const text = normalizeUserText(latestMessage);
  if (!text) return false;

  if (text.length > 48) return false;

  const simpleRegex =
    /^(hi|hello|hey|yo|sup|good\s(morning|afternoon|evening)|thanks?|thank you|ok|okay|cool|nice|who are you|what can you do|help)$/i;

  const likelyToolRegex =
    /\b(weather|temperature|forecast|time|date|datetime|price|prices|crypto|coin|token|market|btc|eth|sol|xrp|doge|ada|portfolio|balance|wallet|jobs?|search|task|chains?)\b/i;

  return simpleRegex.test(text) && !likelyToolRegex.test(text);
}

export type OllamaRequestPolicy = {
  selectedModel: string;
  activeModel: string;
  modelSupportsTools: boolean;
  toolsAllowedForModel: boolean;
  isPostToolAnswerTurn: boolean;
  isToolPlanningTurn: boolean;
  isSimpleFastPathTurn: boolean;
  activeMaxMessages: number;
  activeMaxTokens: number;
  toolsForRequest: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
  requestMessages: any[];
  shouldStream: boolean;
  mode: "tool_planning" | "post_tool_answer" | "standard";
};

export function buildOllamaRequestPolicy(params: {
  context: LLMContext;
  config: OllamaRuntimeConfig;
  allTools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
  modelToolSupport: Map<string, boolean>;
}): OllamaRequestPolicy {
  const { context, config, allTools, modelToolSupport } = params;

  const requestedModel = String(context.assistant.model || "").trim();
  const selectedModel =
    !requestedModel || requestedModel.toLowerCase() === "ollama"
      ? config.defaultModel
      : requestedModel;
  const modelSupportsTools = modelToolSupport.get(selectedModel) !== false;
  const toolsAllowedForModel = config.enableTools && modelSupportsTools;
  const ollamaTools = toolsAllowedForModel
    ? allTools.slice(0, config.toolLimit)
    : [];

  const latestMessage = context.messages[context.messages.length - 1] as any;
  const isPostToolAnswerTurn = latestMessage?.role === "tool";
  const isSimpleFastPathTurn =
    config.enableSimpleFastPath &&
    latestMessage?.role === "user" &&
    shouldUseSimpleFastPath(latestMessage);
  const recentMessagesForPlanning = context.messages.slice(
    -config.toolPlanningMaxMessages
  );
  const hasRecentToolResult = recentMessagesForPlanning.some(
    (message: any) => message?.role === "tool"
  );
  const likelyNeedsTool = shouldUseToolPlanningMode(latestMessage);
  const isToolPlanningTurn =
    !isSimpleFastPathTurn &&
    ollamaTools.length > 0 &&
    latestMessage?.role === "user" &&
    !hasRecentToolResult &&
    likelyNeedsTool;

  const activeMaxMessages = isSimpleFastPathTurn
    ? Math.min(config.maxMessages, config.fastPathMaxMessages)
    : isToolPlanningTurn
    ? config.toolPlanningMaxMessages
    : config.maxMessages;
  const activeMaxTokens = isSimpleFastPathTurn
    ? Math.min(config.maxTokens, config.fastPathMaxTokens)
    : isToolPlanningTurn
    ? Math.min(config.maxTokens, config.toolPlanningMaxTokens)
    : isPostToolAnswerTurn
    ? Math.min(config.maxTokens, config.postToolMaxTokens)
    : config.maxTokens;

  const activeModel =
    isToolPlanningTurn && config.toolPlanningModel
      ? config.toolPlanningModel
      : selectedModel;
  const boundedMessages = context.messages.slice(-activeMaxMessages);

  const requestMessages =
    isPostToolAnswerTurn && config.enablePostToolMinimalContext
      ? buildPostToolMinimalMessages(context.messages, config.postToolMaxMessages)
      : boundedMessages;

  const toolsForRequest =
    isPostToolAnswerTurn || isSimpleFastPathTurn ? [] : ollamaTools;
  const shouldStream =
    Boolean(context.stream) &&
    (isSimpleFastPathTurn ||
      isToolPlanningTurn ||
      toolsForRequest.length === 0 ||
      config.streamWithTools);

  const mode = isToolPlanningTurn
    ? "tool_planning"
    : isPostToolAnswerTurn
    ? "post_tool_answer"
    : "standard";

  return {
    selectedModel,
    activeModel,
    modelSupportsTools,
    toolsAllowedForModel,
    isPostToolAnswerTurn,
    isToolPlanningTurn,
    isSimpleFastPathTurn,
    activeMaxMessages,
    activeMaxTokens,
    toolsForRequest,
    requestMessages,
    shouldStream,
    mode,
  };
}

export function buildOllamaSystemPrompt(params: {
  mode: "tool_planning" | "post_tool_answer" | "standard";
  hasTools: boolean;
  isSimpleFastPathTurn?: boolean;
  assistantBasePrompt?: string;
  enableLocalModelToolPrompt?: boolean;
  localModelPrompt?: string;
}): string {
  const {
    mode,
    hasTools,
    isSimpleFastPathTurn,
    assistantBasePrompt,
    enableLocalModelToolPrompt,
    localModelPrompt,
  } = params;

  const fastPathPrompt = isSimpleFastPathTurn
    ? [
        "FAST PATH:",
        "- Respond in 1-2 short sentences.",
        "- Be direct and avoid extra explanation.",
        "- Do not call tools for simple greetings/chitchat.",
      ].join("\n")
    : "";

  const localBehaviorPrompt = enableLocalModelToolPrompt
    ? (localModelPrompt?.trim() ||
      [
        "LOCAL MODEL TOOL RULES:",
        "- If a tool can answer, call exactly one best tool immediately.",
        "- Never describe intended tool calls in prose.",
        "- Tool arguments must be valid and minimal.",
        "- After a tool result exists, answer only from that tool result.",
        "- Never infer facts not present in the tool result.",
        "- Do not mix locations/entities from earlier turns unless present in current tool result.",
        "- If requested info is missing from tool output, state what is missing and ask to fetch it.",
        "- Do not repeat raw JSON unless the user explicitly asks for full raw output.",
      ].join("\n"))
    : "";

  if (mode === "tool_planning") {
    return [
      "You are a tool router.",
      "Select the single best tool and call it immediately.",
      "Return only a tool call with valid arguments.",
      "No prose.",
    ].join("\n");
  }

  const toolUsePrompt = hasTools
    ? [
        "When a tool can answer the question:",
        "- DO NOT explain how to do it",
        "- DO NOT describe external APIs",
        "- CALL THE TOOL immediately",
        "If tools are available and relevant, prefer tool calls over prose.",
        "After tool execution, provide the final user-facing answer directly.",
        "Never output placeholders like '(The tool returned this information)'.",
      ].join("\n")
    : mode === "post_tool_answer"
    ? [
        "A tool has already been executed.",
        "Provide the final user-facing answer directly using only the tool result.",
        "Do not hallucinate or fill in missing fields.",
        "Do not output pseudo-calls like '(called <tool> tool)'.",
      ].join("\n")
    : "";

  return [assistantBasePrompt?.trim(), toolUsePrompt, fastPathPrompt, localBehaviorPrompt]
    .filter(Boolean)
    .join("\n\n");
}
