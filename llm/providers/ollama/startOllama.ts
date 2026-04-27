import ollama, { AbortableAsyncIterator } from "ollama";
import type { ChatResponse, Tool } from "ollama";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fetchWeather } from "../../../Api/utils/toolHelpers/general/fetchWeatherData.js";
import { EXAMPLE_CONTEXT } from "../../../exampleCall.js";

const normalizeContent = (content: any) => {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .filter((c) => c.kind === "text")
      .map((c) => c.value)
      .join("\n");
  }

  return String(content);
};

const toOllamaTools = (tools: any[] = []): Tool[] => {
  return tools
    .filter((tool) => Boolean(tool?.name))
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.parameters || {
          type: "object",
          properties: {},
          required: [],
        },
      },
    }));
};

const parseToolArguments = (raw: unknown): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
};

const synthesizeFinalAnswer = async ({
  model,
  messages,
  userInput,
  toolResult,
}: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  userInput: string;
  toolResult: string;
}): Promise<string> => {
  const synthesisPrompt = [
    "Use the tool result to answer the user naturally and concisely.",
    "If the user asked for additional info not covered by the tool result, mention what is missing briefly.",
    "Do not output raw JSON unless explicitly requested.",
    "",
    `User question: ${userInput}`,
    `Tool result: ${toolResult}`,
  ].join("\n");

  const synthesis = await ollama.chat({
    model,
    stream: false,
    messages: [
      ...messages,
      {
        role: "user",
        content: synthesisPrompt,
      },
    ],
  });

  console.log("\n🧠 Synthesis response:", synthesis.logprobs);

  return synthesis.message?.content?.trim() || toolResult;
};

const startOllama = async () => {
  const rl = readline.createInterface({ input, output });
  const model = "qwen2.5:7b";
  const tools = toOllamaTools(EXAMPLE_CONTEXT.assistant.tools as any[]);
  const messages = EXAMPLE_CONTEXT.messages.map((msg: any) => ({
    role: msg.role,
    content: normalizeContent(msg.content),
  }));

  console.log("🦙 Ollama chat started. Type 'exit' or 'quit' to stop.\n");

  try {
    while (true) {
      const prompt = await rl.question("You: ");
      const userInput = prompt.trim();

      if (!userInput) continue;
      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        break;
      }

      messages.push({ role: "user", content: userInput });

      const response = await ollama.chat({
        model,
        stream: true,
        tools,
        messages,
      });

      let assistantText = "";
      const toolCalls: Array<{ name?: string; arguments?: any }> = [];
      process.stdout.write("Percy: ");

      for await (const chunk of response as AbortableAsyncIterator<ChatResponse>) {
        if (chunk.message?.content) {
          assistantText += chunk.message.content;
          process.stdout.write(chunk.message.content);
        }

        const chunkToolCalls = (chunk as any)?.message?.tool_calls;
        if (Array.isArray(chunkToolCalls)) {
          for (const toolCall of chunkToolCalls) {
            toolCalls.push({
              name: toolCall?.function?.name,
              arguments: toolCall?.function?.arguments,
            });
          }
        }

        if (chunk.done) {
          process.stdout.write("\n\n");
        }
      }

      if (!assistantText && toolCalls.length) {
        let toolResult = "";

        for (const toolCall of toolCalls) {
          const toolName = toolCall.name || "";
          const args = parseToolArguments(toolCall.arguments);

          console.log(`\n🔧 Tool called: ${toolName} with arguments:`, args);
          if (toolName === "get_weather") {
            const location = String(args.location || "").trim();
            const weather = await fetchWeather(
              location,
              process.env.OPENWEATHER_API
            );
            toolResult = weather;
            console.log(`\n🌤️ Tool result: ${toolResult}`);
            break;
          }
        }

        if (toolResult) {
          assistantText = await synthesizeFinalAnswer({
            model,
            messages,
            userInput,
            toolResult,
          });
          process.stdout.write(`Percy: ${assistantText}\n\n`);
        } else {
          assistantText = "I called a tool but couldn't map the result in this demo.";
          process.stdout.write(`Percy: ${assistantText}\n\n`);
        }
      }

      if (!assistantText && !toolCalls.length) {
        assistantText = "I didn't receive any text output for that turn.";
        process.stdout.write(`Percy: ${assistantText}\n\n`);
      }

      messages.push({ role: "assistant", content: assistantText || "" });
    }
  } finally {
    rl.close();
  }
};

export default startOllama;