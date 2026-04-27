import OpenAI from "openai";
import type { ContentPart, InternalMessage } from "../../../Agent/messages.js";

export const createOpenAIClient = (apiKey?: string, baseURL?: string) => {
  return new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY, baseURL });
};

export const createOllamaClient = (baseURL?: string, timeout?: number) => {
  return new OpenAI({
    apiKey: process.env.OLLAMA_API_KEY || "ollama",
    baseURL: baseURL || process.env.OLLAMA_BASE_URL,
    timeout,
  });
}

export const stringifyContent = (content: any): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (part && part.kind === "text") return part.value;
        return JSON.stringify(part);
      })
      .join(" ");
  }
  if (content && typeof content === "object") {
    if (content.kind === "text") return content.value;
    return JSON.stringify(content);
  }
  return String(content);
};

export const ensureContentParts = (content: any): ContentPart[] => {
  if (!content && content !== "") return [];
  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (typeof part === "string") return { kind: "text", value: part } as ContentPart;
      if (part && part.kind === "text") return part as ContentPart;
      if (part && part.value) return { kind: "text", value: part.value } as ContentPart;
      return { kind: "text", value: String(part) } as ContentPart;
    });
  }
  if (typeof content === "string") return [{ kind: "text", value: content }];
  if (content && content.value) return [{ kind: "text", value: content.value }];
  return [{ kind: "text", value: String(content) }];
};

export const makeAssistantMessage = (text: string): InternalMessage => ({
  role: "assistant",
  content: [{ kind: "text", value: text }],
});
