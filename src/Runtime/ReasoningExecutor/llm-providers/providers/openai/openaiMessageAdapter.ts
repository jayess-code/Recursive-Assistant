import { InternalMessage } from "../../../../Agent/messages";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { mapInternalMessagesToResponseInput } from "../shared/adapterUtils";

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
