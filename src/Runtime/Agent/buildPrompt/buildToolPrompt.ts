import type { ToolConfig } from "../../ToolExecutor/toolConfig";

export type PromptToolShape = {
	name: string;
	definition?: string;
	description?: string;
	readOnly?: boolean;
	requiresConfirmation?: boolean;
	riskLevel?: "low" | "medium" | "high";
	mode?: string;
	category?: string;
};

type ToolPromptInput = PromptToolShape[] | Record<string, ToolConfig>;

const mapToolConfigToPromptTool = (
	toolName: string,
	toolConfig?: ToolConfig
): PromptToolShape => {
	if (!toolConfig) {
		return { name: toolName };
	}

	return {
		name: toolConfig.tool?.name || toolName,
		...(toolConfig.info?.definition
			? { definition: toolConfig.info.definition }
			: {}),
		...(typeof toolConfig.info?.readOnly === "boolean"
			? { readOnly: toolConfig.info.readOnly }
			: {}),
		...(typeof toolConfig.info?.requiresConfirmation === "boolean"
			? { requiresConfirmation: toolConfig.info.requiresConfirmation }
			: {}),
		...(toolConfig.info?.riskLevel
			? { riskLevel: toolConfig.info.riskLevel }
			: {}),
		...(toolConfig.info?.mode ? { mode: toolConfig.info.mode } : {}),
		...(toolConfig.info?.category
			? { category: toolConfig.info.category }
			: {}),
	};
};

const normalizePromptTools = (
	input: ToolPromptInput = [],
	toolOrder: string[] = []
): PromptToolShape[] => {
	if (Array.isArray(input)) {
		return input;
	}

	const orderedNames = toolOrder.length ? toolOrder : Object.keys(input);
	return orderedNames
		.filter((toolName) => input[toolName] !== undefined)
		.map((toolName) => mapToolConfigToPromptTool(toolName, input[toolName]));
};

export function buildToolPrompt(
	toolsOrConfigs: ToolPromptInput = [],
	toolOrder: string[] = []
): string {
	const tools = normalizePromptTools(toolsOrConfigs, toolOrder);

	const lines = tools.map((tool, index) => {
		if (!tool) return `- ⚠️ Tool #${index} is undefined`;
		if (!tool.name) return `- ⚠️ Tool #${index} missing name field`;

		const flags: string[] = [];
		if (tool.readOnly) flags.push("read-only");
		if (tool.requiresConfirmation) flags.push("requires-confirmation");
		if (tool.riskLevel) flags.push(`risk:${tool.riskLevel}`);
		if (tool.mode) flags.push(`mode:${tool.mode}`);
		if (tool.category) flags.push(`category:${tool.category}`);

		const effectiveDescription =
			tool.definition?.trim() ||
			tool.description?.trim() ||
			"No description provided.";

		const flagText = flags.length ? ` (${flags.join(", ")})` : "";
		return `- **${tool.name}**: ${effectiveDescription}${flagText}`;
	});

	if (!lines.length) return "";

	return [
		"### 🛠️ Tools at Your Disposal",
		"You have access to the following tools. Use them when appropriate:",
		"",
		...lines,
		"",
		"When you can't answer a question but a tool can, call it instead of describing how to do it manually.",
		"",
		"Always summarize results rather than returning large amounts of data, unless the user explicitly asks for the full output.",
		"",
		"⚠️ If a tool call fails with the same error more than once, do not retry it again. Instead, try something else and report the error and suggest a possible fix or next step.",
	].join("\n");
}
