import { InternalMessage } from "../../../../Agent/messages";
import { mapInternalMessagesToChatInput } from "../shared/adapterUtils";
import type { ChatInputMessage } from "../shared/adapterUtils";

export function toOllamaAIInput(messages: InternalMessage[]): ChatInputMessage[] {
    return mapInternalMessagesToChatInput(messages);
}
