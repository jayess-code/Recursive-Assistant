import type { InternalMessage } from "../../../Agent/messages.js";
import type { ResponseInputItem } from "openai/resources/responses/responses.js";
import { mapInternalMessagesToResponseInput } from "../shared/adapterUtils.js";

/**
 * Convert InternalMessage[] → OpenAI Responses API input
 * 
 * ✅ CRITICAL RULE: content type depends on ROLE, not source
 * - user/system messages → type: "input_text"
 * - assistant messages → type: "output_text"
 * - tool messages → converted to user messages with "input_text"
 */
export function toOpenAIInput(messages: InternalMessage[]): ResponseInputItem[] {
  return mapInternalMessagesToResponseInput(messages);
}
