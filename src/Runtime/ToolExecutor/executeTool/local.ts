import type { ToolExecutionContext } from "../types";

export async function executeCodeExecutionTool(tool: any, args: any, context: ToolExecutionContext) {
  return tool.handler(args, context);
}