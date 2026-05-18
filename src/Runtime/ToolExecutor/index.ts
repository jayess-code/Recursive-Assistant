import type { InternalMessage } from "../Agent/messages";
import { inspect } from "node:util";
import { executeCodeExecutionTool } from "./executeTool/local";
import type { ToolConfig } from "./toolConfig";
import type {
    IToolCall,
    ToolCallRunner,
    ToolExecutionContext,
    ToolExecutionResult,
} from "./types";

export class ToolExecutor implements ToolCallRunner {
    constructor(
        private readonly executionContext: ToolExecutionContext,
        private readonly availableTools: Record<string, ToolConfig> = {},
    ) {}

    private buildToolLogContext(toolCall: IToolCall, extra: Record<string, unknown> = {}) {
        return {
            assistantId: this.executionContext.assistantId,
            conversationId: this.executionContext.conversationId,
            callId: toolCall.callId,
            toolName: toolCall.name,
            ...extra,
        };
    }

    private logToolInput(toolCall: IToolCall) {
        console.log("🛠️ [ToolExecutor] Incoming tool call:", {
      name: toolCall.name,
      callId: toolCall.callId,
      rawArgs: JSON.stringify(toolCall.args, null, 2),
      argsType: typeof toolCall.args,
    });
    }

    private logToolOutput(
        toolCall: IToolCall,
        status: NonNullable<IToolCall["status"]>,
        result: unknown,
        durationMs: number,
    ) {
        const log = status === "failed" ? console.warn : console.log;
        log(
            "🔧 [Tool] Output",
            inspect(this.buildToolLogContext(toolCall, { status, result, durationMs }), {
                depth: null,
                colors: false,
                compact: false,
            }),
        );
    }

    private async executeSingleToolCall(toolCall: IToolCall): Promise<IToolCall> {
        const startedAt = Date.now();
        this.logToolInput(toolCall);

        try {
            const registeredTool = this.availableTools[toolCall.name]?.tool;
            if (registeredTool?.handler) {
                const completedCall: IToolCall = {
                    ...toolCall,
                    status: "completed",
                    result: await registeredTool.handler(toolCall.args, {
                        availableTools: Object.keys(this.availableTools),
                    }),
                };

                this.logToolOutput(
                    completedCall,
                    "completed",
                    completedCall.result,
                    Date.now() - startedAt,
                );

                return completedCall;
            }

            switch (toolCall.name) {
                case "mcp":
                    {
                        const completedCall: IToolCall = {
                        ...toolCall,
                        status: "completed",
                        result: { success: true, result: "MCP tool execution result" },
                    };

                        this.logToolOutput(
                            completedCall,
                            "completed",
                            completedCall.result,
                            Date.now() - startedAt,
                        );

                        return completedCall;
                    }
                case "webSearch":
                    {
                        const completedCall: IToolCall = {
                        ...toolCall,
                        status: "completed",
                        result: { success: true, result: "Web Search tool execution result" },
                    };

                        this.logToolOutput(
                            completedCall,
                            "completed",
                            completedCall.result,
                            Date.now() - startedAt,
                        );

                        return completedCall;
                    }
                case "codeExecution":
                    {
                        const completedCall: IToolCall = {
                        ...toolCall,
                        status: "completed",
                        result: await executeCodeExecutionTool(toolCall as any, toolCall.args, this.executionContext),
                    };

                        this.logToolOutput(
                            completedCall,
                            "completed",
                            completedCall.result,
                            Date.now() - startedAt,
                        );

                        return completedCall;
                    }
                default:
                    {
                        const failedCall: IToolCall = {
                        ...toolCall,
                        status: "failed",
                        result: { error: `Unknown tool: ${toolCall.name}` },
                    };

                        this.logToolOutput(
                            failedCall,
                            "failed",
                            failedCall.result,
                            Date.now() - startedAt,
                        );

                        return failedCall;
                    }
            }
        } catch (error) {
            const failedCall: IToolCall = {
                ...toolCall,
                status: "failed",
                result: {
                    error: error instanceof Error ? error.message : "Tool execution failed",
                },
            };

            this.logToolOutput(failedCall, "failed", failedCall.result, Date.now() - startedAt);

            return failedCall;
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