import { extractTextAndToolCallsFromResponse } from "../shared/adapterUtils";

export function extractTextAndToolCalls(response: any) {
	return extractTextAndToolCallsFromResponse(response, {
		includeChoices: true,
		includeOutput: true,
	});
}