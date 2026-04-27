import type { ToolParameters } from "../../ToolExecutor/toolConfig.js";

export const parameters: ToolParameters = {
    additionalProperties: false,
     type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The query to send to the MCP API.",
                },
            },
            required: ["query"],
}