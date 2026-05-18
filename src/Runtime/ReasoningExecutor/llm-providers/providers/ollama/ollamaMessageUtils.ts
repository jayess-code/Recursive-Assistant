import { IToolCall } from "../../../../ToolExecutor/types";

export function parseToolArgs(rawArgs: any): any {
  if (typeof rawArgs === "string") {
    try {
      return JSON.parse(rawArgs || "{}");
    } catch {
      return {};
    }
  }

  return rawArgs || {};
}

export function normalizeContent(content: any): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part?.value === "string") return part.value;
        if (typeof part?.text?.value === "string") return part.text.value;
        return "";
      })
      .join(" ")
      .trim();
  }

  return "";
}

export function isPlaceholderToolResponse(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  const pseudoToolCallRegexes = [
    /<\|python_tag\|>/,
    /\bget_weather\s*\(/,
    /\b[a-z0-9_]+\s*\([^)]*\)/,
  ];

  if (pseudoToolCallRegexes.some((regex) => regex.test(normalized))) {
    return true;
  }

  const metaToolRegexes = [
    /\btool\b.*\bwas used\b.*\b(fetch|retrieve)\b.*\b(information|data)\b/,
    /\btool\b.*\breturned this information\b/,
    /\bi used\b.*\btool\b/,
    /^\(?called\s+[a-z0-9_:-]+\s+tool\)?\.?$/,
    /^\(?[a-z0-9_:-]+\s+was\s+called\)?\.?$/,
    /^\(?[a-z0-9_:-]+\s+tool\s+was\s+used\)?\.?$/,
    /^\(?the tool returned this information\)?\.?$/,
  ];

  if (metaToolRegexes.some((regex) => regex.test(normalized))) {
    return true;
  }

  return (
    normalized.includes("tool returned this information") ||
    normalized.includes("the `get_weather` tool returned") ||
    normalized.includes("i used the get_weather tool") ||
    normalized.startsWith("(called ") ||
    normalized.startsWith("called ") ||
    normalized.endsWith(" was called)") ||
    normalized.endsWith(" tool was used)") ||
    normalized.endsWith(" was called") ||
    normalized.endsWith(" tool was used") ||
    normalized === "(the tool returned this information)" ||
    normalized === "the tool was used to fetch the information." ||
    normalized === "the tool `get_weather` was used to fetch the information."
  );
}

export function getLatestToolResult(messages: any[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== "tool") continue;

    const result = message?.result;
    if (typeof result === "string" && result.trim()) {
      return result.trim();
    }

    if (result && typeof result === "object") {
      try {
        return JSON.stringify(result);
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function normalizeAssistantTools(tools: any[]): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}> {
  return (tools || [])
    .map((tc: any) => {
      const raw = tc?.tool ? tc.tool : tc;
      const fn = raw?.function ? raw.function : raw;

      if (!fn?.name) {
        return null;
      }

      return {
        type: "function" as const,
        function: {
          name: fn.name,
          description: fn.description || "",
          parameters: fn.parameters || {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      };
    })
    .filter((tool): tool is {
      type: "function";
      function: { name: string; description: string; parameters: any };
    } => Boolean(tool));
}

export function collectToolCallsFromResponse(response: any): IToolCall[] {
  const toolCalls: IToolCall[] = [];

  for (const choice of response?.choices || []) {
    if (choice?.message?.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        const functionCall = (toolCall as any)?.function;
        if (!functionCall?.name) continue;
        toolCalls.push({
          name: functionCall.name,
          args: parseToolArgs(functionCall.arguments),
          callId: (toolCall as any)?.id || `ollama-tool-${toolCalls.length}`,
        });
      }
    }
  }

  return toolCalls;
}

export function collectTextFromResponse(response: any): string {
  let text = "";
  for (const choice of response?.choices || []) {
    if (choice?.message?.content) {
      text += choice.message.content;
    }
  }
  return text;
}
