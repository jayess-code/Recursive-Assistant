import type { LLMContext } from "./llm/types/index.js";

export const EXAMPLE_CONTEXT: LLMContext = {
  assistant: {
    id: "example-assistant",
    model: "qwen2.5:7b",
    instructions: {
      basePrompt: "You are a helpful assistant.",
    },
    tools: [],
    newToolNamesArray: [],
    provider: "ollama",
  },
  messages: [],
};
