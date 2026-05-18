import { ToolConfig, ToolParameters } from "../../Runtime/ToolExecutor/toolConfig";
import type { ToolResponse } from "../types/toolResponse";

const parameters: ToolParameters = {
    type: "object",
    additionalProperties: false,
    properties: {
        query: {
            type: "string",
            description: "The search query to send to the web search API.",
        },
    },
    required: ["query"],
}

interface webSearchArgs {
    query: string;
}

export const webSearchTool: ToolConfig<webSearchArgs> = {
    tool:{
        type: "function",
        name: "webSearch",
        description: "A tool that simulates a web search.",
        parameters,
        strict: true,

    handler: async (args: webSearchArgs) => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return JSON.stringify({
            success: true,
            data: { result: `Web search results for query: ${args.query}` },
        } as ToolResponse);
    }
},
info: {
    category: "search",
    riskLevel: "low",
    readOnly: true,
    access: "read",
    mode: "analyze",
    provider: "offchain",
    version: "1.0.0",
    definition: "Simulates a web search and returns results based on the input query.",}
}