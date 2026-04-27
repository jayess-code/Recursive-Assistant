import type { ToolConfig, ToolParameters } from "../../ToolExecutor/toolConfig.js";

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
        return { success: true, result: `Web search results for query: ${args.query}` };
    }
},
info: {
    category: "search",

}
}