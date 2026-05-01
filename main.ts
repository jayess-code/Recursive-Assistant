import "dotenv/config";
import readline from "readline";
import { Agent } from "./Agent/AgentConfig.js";
import { AgentTyrone } from "./Agent/AgentPresets.js";
import type { InternalMessage } from "./Agent/messages.js";
import { localTools } from "./Tools/index.js";

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
    const agent = new Agent(AgentTyrone, {
        provider: {
            name: process.env.AI_PROVIDER ?? "openai",
            model: process.env.AI_MODEL ?? "gpt-4o-mini",
        },
        toolRegistry: localTools,
        promptRuntimeContext: {executionType:"conversation"},
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

        const result = await agent.run(messages);
        messages = result.messages;

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