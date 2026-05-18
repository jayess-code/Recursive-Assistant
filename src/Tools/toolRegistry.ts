import type { ToolConfig } from "../Runtime/ToolExecutor/toolConfig";

export class ToolRegistry {
  constructor(private allTools: Record<string, ToolConfig>) {}

  resolve(toolNames: string[]) {
    return Object.fromEntries(
      toolNames
        .map((name) => {
          const tool = this.allTools[name];
          if (!tool) return null;
          return [name, tool];
        })
        .filter(Boolean) as [string, ToolConfig][]
    );
  }
}
