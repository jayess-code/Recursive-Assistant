type BuildBasePromptInput = {
	name: string;
	description: string;
	basePrompt?: string;
    systemPrompt?: string;
	personaHeader?: string;
	keyPrinciples?: string[];
	personalityTraits?: string[];
	workflow?: string;
	safety?: string;
	meta?: string;
};


const formatList = (title: string, items: string[] = []) => {
	const cleanItems = items.map((item) => item?.trim()).filter(Boolean);
	if (!cleanItems.length) return "";
	return `${title}:\n${cleanItems.map((item) => `- ${item}`).join("\n")}`;
};

export function buildBasePrompt(input: BuildBasePromptInput): string {
	const assistantName = input.name?.trim() || "Assistant";
	const identityBlock = [
		`You are ${assistantName}.`,
		input.description?.trim() ? `Primary role: ${input.description.trim()}` : "",
		input.personaHeader?.trim() || "",
	]
		.filter(Boolean)
		.join("\n");

	const behaviorBlock = [
		input.basePrompt?.trim() || "",
		formatList("Key principles", input.keyPrinciples),
		formatList("Personality traits", input.personalityTraits),
		input.workflow?.trim() ? `Workflow:\n${input.workflow.trim()}` : "",
		input.safety?.trim() ? `Safety:\n${input.safety.trim()}` : "",
		input.meta?.trim() ? `Meta:\n${input.meta.trim()}` : "",
	]
		.filter(Boolean)
		.join("\n\n");

	return [identityBlock, behaviorBlock].filter(Boolean).join("\n\n").trim();
}
