// import { buildToolPrompt, PromptToolShape } from "./buildToolPrompt";
// import { buildVoicePrompt } from "./buildVoicePrompt";

import type { AgentDefinition } from "../AgentConfig.js";
import type { ToolConfig } from "../../ToolExecutor/toolConfig.js";
import { buildBasePrompt } from "./buildBasePrompt.js";
import { buildToolPrompt, type PromptToolShape } from "./buildToolPrompt.js";

type AssistantInstructionShape = {
	basePrompt?: string;
	personaHeader?: string;
	workflow?: string;
	safety?: string;
	meta?: string;
	keyPrinciples?: string[];
	personalityTraits?: string[];
	voice?: string;
};

const mapToolNamesToPromptTools = (tools: string[] = []): PromptToolShape[] => {
	return tools
		.map((toolName) => toolName?.trim())
		.filter(Boolean)
		.map((name) => ({ name }));
};

export function buildAssistantSystemPrompt(
	input: AgentDefinition,
	promptTools?: PromptToolShape[] | Record<string, ToolConfig>
): string {
	const instructions = input.instructions || {};
	const toolsForPrompt = promptTools ?? mapToolNamesToPromptTools(input.tools || []);
	const basePromptInput = {
		name: input.name,
		description: input.description,
		...(instructions.basePrompt ? { basePrompt: instructions.basePrompt } : {}),
		...(instructions.personaHeader ? { personaHeader: instructions.personaHeader } : {}),
		...(instructions.keyPrinciples?.length
			? { keyPrinciples: instructions.keyPrinciples }
			: {}),
		...(instructions.personalityTraits?.length
			? { personalityTraits: instructions.personalityTraits }
			: {}),
		...(instructions.workflow ? { workflow: instructions.workflow } : {}),
		...(instructions.safety ? { safety: instructions.safety } : {}),
		...(instructions.meta ? { meta: instructions.meta } : {}),
	};

	const sections = [
		buildBasePrompt(basePromptInput),
		// buildVoicePrompt({
		// 	voice: instructions.voice,
		// }),
		buildToolPrompt(toolsForPrompt, input.tools || []),
	]
		.filter(Boolean)
		.join("\n\n");

	return sections.trim();
}

