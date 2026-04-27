export async function executeMCP(tool: any, args: any, context: any) {
  const res = await fetch(`${tool.mcp.server}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: tool.mcp.toolName,
      arguments: args,
      context,
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP error ${res.status}`);
  }

  return res.json();
}