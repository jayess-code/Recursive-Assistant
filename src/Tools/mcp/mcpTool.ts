import type { ToolParameters } from "../../Runtime/ToolExecutor/toolConfig";

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