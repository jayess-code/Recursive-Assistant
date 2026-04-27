export type ContentPart = {
  kind: "text" | string;
  value: string;
};

export type InternalMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | ContentPart[];
    }
  | {
      role: "tool";
      toolName: string;
      toolCallId: string;
      result: unknown;
      content?: string | ContentPart[];
    };