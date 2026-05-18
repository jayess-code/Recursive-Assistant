import type { LLMProvider } from "../types/index";
import { AnthropicProvider } from "./anthropic/AnthropicProvider";
import { DeepSeekProvider } from "./deepseek/deepseekProvider";
import { LocalProvider } from "./local/LocalProvider";
import { OllamaProvider } from "./ollama/OllamaProvider";
import { OpenAIProvider } from "./openai/OpenAIProvider";


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
