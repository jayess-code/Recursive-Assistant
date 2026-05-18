import "dotenv/config";
import { Agent } from "../Runtime/Agent/AgentConfig";
import type { InternalMessage } from "../Runtime/Agent/messages";
import { AgentSamantha } from "../Runtime/Agent/AgentPresets";
import { localTools } from "../Tools/index";

async function main() {
  const providerName = "openai";
  const model = "gpt-4o-mini";

  const agent = new Agent(AgentSamantha, {
    provider: {
      name: providerName,
      model,
    },
    toolRegistry: localTools,
  });

  const messages: InternalMessage[] = [
    {
      role: "user",
      content: "get the weather in haiti and tell me if it would be a good day for a picnic.",
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
