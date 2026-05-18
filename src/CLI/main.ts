import "dotenv/config";
import readline from "readline";
import { AgentPresets, type AgentPresetKey } from "../Runtime/Agent/AgentPresets";
import { localTools } from "../Tools/index";
import { Agent } from "../Runtime/Agent/AgentConfig";
import { InternalMessage } from "../Runtime/Agent/messages";

// Create interface for reading from command line
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let isClosed = false;

const closeReadline = () => {
    if (!isClosed) {
        isClosed = true;
        rl.close();
    }
};

// Type-safe promise-based question function
const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, (input) => {
            resolve(input);
        });
    });
};

async function main() {
    const presetKey = (process.env.AGENT_PRESET ?? "AgentBobby") as AgentPresetKey;
    const selectedPreset = AgentPresets[presetKey];

    if (!selectedPreset) {
        throw new Error(
            `Unknown AGENT_PRESET '${presetKey}'. Valid presets: ${Object.keys(AgentPresets).join(", ")}`
        );
    }

    let streamedResponse = false;
    const agent = new Agent(selectedPreset, {
        provider: {
            name:  "openai",
            model:  "gpt-5-mini",
        },
        toolRegistry: localTools,
        promptRuntimeContext: {executionType:"conversation"},
        reasoningEngineOptions: { outputOptions: { includeReasoningSteps: true, includeExecutedToolCalls: true } },
        stream: true,
        onToken: (token) => {
            streamedResponse = true;
            process.stdout.write(token);
        },
    });
    let messages: InternalMessage[] = [];

    console.log("Welcome to the AI Agent CLI!");

    while (true) {
        const userInput = (await question("Please enter your command: ")).trim();

        if (!userInput) {
            continue;
        }

        if (userInput === "exit" || userInput === "quit") {
            break;
        }

        messages.push({
            role: "user",
            content: userInput,
        });

        streamedResponse = false;
        const result = await agent.run(messages);
        messages = result.messages;

        if (streamedResponse) {
            process.stdout.write("\n");
            continue;
        }

        console.log("Final message:\n", result.finalMessage);
    }

    closeReadline();
}

process.on("SIGINT", () => {
    closeReadline();
    process.exit(0);
});

main().catch((error) => {
    console.error("An error occurred:", error);
    closeReadline();
});