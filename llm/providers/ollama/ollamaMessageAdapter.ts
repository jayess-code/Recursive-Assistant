import type { InternalMessage } from "../../../Agent/messages.js";
import { mapInternalMessagesToChatInput } from "../shared/adapterUtils.js";
import type { ChatInputMessage } from "../shared/adapterUtils.js";

export function toOllamaAIInput(messages: InternalMessage[]): ChatInputMessage[] {
    return mapInternalMessagesToChatInput(messages);
}
