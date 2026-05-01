import { Agent } from "./Agent/AgentConfig.js";
import type { InternalMessage } from "./Agent/messages.js";

declare const process:
  | {
      env?: Record<string, string | undefined>;
      exitCode?: number;
    }
  | undefined;

async function main() {
  const providerName = process?.env?.AI_PROVIDER ?? "openai";
  const model = process?.env?.AI_MODEL ?? "gpt-4o-mini";

  const agent = new Agent({
    name: "MinimalReasoningAgent",
    description: "Small example entrypoint for the reasoning loop",
    // capabilities: ["reasoning"],
    tools: [],
    instructions: {
      basePrompt: "You are a concise assistant. Think step by step internally and answer clearly.",
    },
  }, {
    provider: {
      name: providerName,
      model,
    },
  });

  const messages: InternalMessage[] = [
    {
      role: "user",
      content: "Explain in 3 short sentences what this assistant reasoning loop does.",
    },
  ];

  const result = await agent.run(messages);

  console.log("Final message:\n", result.finalMessage);
  console.log("\nReasoning steps:", result.reasoningSteps);
  console.log("Executed tool calls:", result.executedToolCalls.length);
}

main().catch((error) => {
  console.error("Example entrypoint failed", error);
  if (process) {
    process.exitCode = 1;
  }
});
