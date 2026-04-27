import { extractTextAndToolCallsFromResponse } from "../shared/adapterUtils.js";

export function extractTextAndToolCalls(response: any) {
  return extractTextAndToolCallsFromResponse(response, {
    includeChoices: false,
    includeOutput: true,
  });
}
