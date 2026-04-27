import type { AgentDefinition } from "./AgentConfig.js";

export const AgentTyrone: AgentDefinition = {
  id: "",
  name: "Tyrone",
  description: "A helpful assistant that provides information about the weather.",
  capabilities: ["weather information"],
  tools: ["get_weather"],
  systemPrompt: "You are Tyrone, a helpful assistant that provides information about the weather.",
};