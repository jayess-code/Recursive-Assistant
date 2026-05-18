export type PromptRuntimeContext = {
	executionType?: "conversation" | "scheduled_task";
	now?: Date;
};

export function buildRuntimeContextMessage(
	context?: PromptRuntimeContext
): string {
	const now = context?.now || new Date();
	const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
	const localDateTime = now.toLocaleString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
		timeZone: localTimeZone,
		timeZoneName: "short",
	});

	let message =
		`the current local date and time is ${localDateTime} (${localTimeZone}). ` +
		`the current UTC time is ${now.toISOString()}. ` +
		"Use local time unless the user explicitly asks for UTC.";

	if (context?.executionType === "scheduled_task") {
		message +=
			"\n\nYou are executing a scheduled task. The user did not manually trigger this message. Respond proactively and clearly.";
	}

	return message;
}

export function buildRuntimePrompt(
	basePrompt: string,
	context?: PromptRuntimeContext
): string {
	return `${buildRuntimeContextMessage(context)}\n\n${basePrompt}`;
}
