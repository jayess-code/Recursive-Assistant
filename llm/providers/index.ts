import type { LLMProvider } from "../types/index.js";
import { AnthropicProvider } from "./anthropic/AnthropicProvider.js";
import { DeepSeekProvider } from "./deepseek/deepseekProvider.js";
import { LocalProvider } from "./local/LocalProvider.js";
import { OllamaProvider } from "./ollama/OllamaProvider.js";
import { OpenAIProvider } from "./openai/OpenAIProvider.js";


const providers: Record<string, LLMProvider> = {
  openai: new OpenAIProvider(),
  deepseek: new DeepSeekProvider(),
  anthropic: new AnthropicProvider(),
  local: new LocalProvider(),
  ollama: new OllamaProvider(),
};

export const getProvider = (name: string): LLMProvider => {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Provider "${name}" not registered`);
  }
  return provider;
};
