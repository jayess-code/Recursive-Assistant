import OpenAI from "openai";

export const createOpenAIClient = (apiKey?: string, baseURL?: string) => {
  const resolvedApiKey = apiKey ?? process.env.OPENAI_API_KEY;
  if (!resolvedApiKey) {
    throw new Error(
      "OpenAI API key missing. Pass an apiKey at runtime or set OPENAI_API_KEY in your environment/.env."
    );
  }

  return new OpenAI({ apiKey: resolvedApiKey, baseURL });
};

export const createOllamaClient = (baseURL?: string, timeout?: number) => {
  return new OpenAI({
    apiKey: process.env.OLLAMA_API_KEY || "ollama",
    baseURL: baseURL || process.env.OLLAMA_BASE_URL,
    timeout,
  });
}
