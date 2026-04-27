import type { IToolCall } from "../../../ToolExecutor/types.js";
import { extractTextAndToolCalls } from "./openaiOutputAdapter.js";


export async function executeOpenAIStreamingRequest({
  client,
  context,
  input,
  model,
  instructions,
  tools,
}: {
  client: any;
  context: any;
  input: any;
  model: string;
  instructions: string;
  tools: any[];
}): Promise<{ text: string; toolCalls: IToolCall[]; finalResponse: any }> {
  const stream = await client.responses.create({
    model,
    instructions,
    input,
    tools,
    stream: true,
  } as any);

  let text = "";
  const toolCalls: IToolCall[] = [];
  let finalResponse: any = null;

  for await (const event of stream as any) {
    if (event?.type === "response.output_text.delta" && event.delta) {
      const token = String(event.delta);
      text += token;
      context.onToken?.(token);
    }

    if (event?.type === "response.output_item.done" && event?.item?.type === "function_call") {
      toolCalls.push({
        name: event.item.name,
        args: event.item.arguments,
        callId: event.item.call_id,
      });
    }

    if (event?.type === "response.completed" && event.response) {
      finalResponse = event.response;
    }
  }

  if (finalResponse) {
    const parsed = extractTextAndToolCalls(finalResponse);

    for (const call of parsed.toolCalls) {
      const exists = toolCalls.some((tc) => tc.callId === call.callId);
      if (!exists) {
        toolCalls.push(call);
      }
    }

    if (parsed.text && !text.includes(parsed.text)) {
      text += parsed.text;
    }
  }

  return { text, toolCalls, finalResponse };
}

export async function executeOpenAINonStreamingRequest({
  client,
  input,
  model,
  instructions,
  tools,
}: {
  client: any;
  input: any;
  model: string;
  instructions: string;
  tools: any[];
}): Promise<{ text: string; toolCalls: IToolCall[]; response: any }> {
  const response = await client.responses.create({
    model,
    instructions,
    input,
    tools,
  });

  const parsed = extractTextAndToolCalls(response);
  return {
    text: parsed.text,
    toolCalls: parsed.toolCalls,
    response,
  };
}
