export async function executeCodeExecutionTool(tool: any, args: any, context: any) {
  return tool.handler(args, context);
}