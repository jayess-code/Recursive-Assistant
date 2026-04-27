import type { Agent } from "../Agent/AgentConfig.js";
import type { InternalMessage } from "../Agent/messages.js";
import { executeCodeExecutionTool } from "./executeTool/local.js";
import type { ToolConfig } from "./toolConfig.js";
import type { IToolCall } from "./types.js";


export interface ToolExecutionResult {
    toolMessages: InternalMessage[];
    toolCalls: IToolCall[];
}

export class ToolExecutor {
    constructor(
        private readonly agent: Agent,
        private readonly availableTools: Record<string, ToolConfig> = {},
    ) {}

    private async executeSingleToolCall(toolCall: IToolCall): Promise<IToolCall> {
        try {
            const registeredTool = this.availableTools[toolCall.name]?.tool;
            if (registeredTool?.handler) {
                return {
                    ...toolCall,
                    status: "completed",
                    result: await registeredTool.handler(toolCall.args, {
                        availableTools: Object.keys(this.availableTools),
                    }),
                };
            }

            switch (toolCall.name) {
                case "mcp":
                    return {
                        ...toolCall,
                        status: "completed",
                        result: { success: true, result: "MCP tool execution result" },
                    };
                case "webSearch":
                    return {
                        ...toolCall,
                        status: "completed",
                        result: { success: true, result: "Web Search tool execution result" },
                    };
                case "codeExecution":
                    return {
                        ...toolCall,
                        status: "completed",
                        result: await executeCodeExecutionTool(toolCall as any, toolCall.args, this.agent),
                    };
                default:
                    return {
                        ...toolCall,
                        status: "failed",
                        result: { error: `Unknown tool: ${toolCall.name}` },
                    };
            }
        } catch (error) {
            return {
                ...toolCall,
                status: "failed",
                result: {
                    error: error instanceof Error ? error.message : "Tool execution failed",
                },
            };
        }
    }

    async run(toolCalls: IToolCall[]): Promise<ToolExecutionResult> {
        const executedCalls: IToolCall[] = [];
        const toolMessages: InternalMessage[] = [];

        for (const toolCall of toolCalls) {
            const executedCall = await this.executeSingleToolCall(toolCall);
            executedCalls.push(executedCall);
            toolMessages.push({
                role: "tool",
                toolName: executedCall.name,
                toolCallId: executedCall.callId,
                result: executedCall.result,
            });
        }

        return {
            toolMessages,
            toolCalls: executedCalls,
        };
    }
}