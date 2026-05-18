import test from "node:test";
import assert from "node:assert/strict";

import {
  extractTextAndToolCallsFromResponse,
  mapInternalMessagesToChatInput,
  mapInternalMessagesToResponseInput,
  safeParseToolArgs,
} from "./adapterUtils";

test("mapInternalMessagesToResponseInput maps tool/user/assistant roles correctly", () => {
  const messages: any[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: [{ kind: "text", value: "hi" }] },
    { role: "tool", toolName: "get_weather", result: { temp: 70 }, toolCallId: "tc_1" },
  ];

  const mapped = mapInternalMessagesToResponseInput(messages as any);

  assert.equal(mapped.length, 3);
  assert.equal((mapped[0] as any).role, "user");
  assert.equal((mapped[0] as any).content[0].type, "input_text");
  assert.equal((mapped[1] as any).content[0].type, "output_text");
  assert.match((mapped[2] as any).content[0].text, /Tool get_weather returned/);
});

test("mapInternalMessagesToChatInput maps tool messages with tool_call_id", () => {
  const messages: any[] = [
    { role: "system", content: "rules" },
    { role: "tool", toolName: "search", result: { ok: true }, toolCallId: "call_123" },
  ];

  const mapped = mapInternalMessagesToChatInput(messages as any);

  assert.equal(mapped.length, 2);
  assert.equal(mapped[0]!.role, "system");
  assert.equal(mapped[0]!.content, "rules");
  assert.equal(mapped[1]!.role, "tool");
  assert.equal(mapped[1]!.tool_call_id, "call_123");
  assert.match(mapped[1]!.content, /"ok":true/);
});

test("safeParseToolArgs parses JSON strings and falls back safely", () => {
  assert.deepEqual(safeParseToolArgs('{"a":1}'), { a: 1 });
  assert.deepEqual(safeParseToolArgs("not-json"), {});
  assert.deepEqual(safeParseToolArgs(undefined), {});
});

test("extractTextAndToolCallsFromResponse handles choices and output formats", () => {
  const response = {
    choices: [
      {
        message: {
          content: "choice-text",
          tool_calls: [
            {
              id: "tc_1",
              function: {
                name: "get_weather",
                arguments: '{"location":"london"}',
              },
            },
          ],
        },
      },
    ],
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: " output-text" }],
      },
      {
        type: "function_call",
        name: "fetch_json",
        arguments: { url: "https://example.com" },
        call_id: "fc_2",
      },
    ],
  };

  const parsed = extractTextAndToolCallsFromResponse(response, {
    includeChoices: true,
    includeOutput: true,
  });

  assert.equal(parsed.text, "choice-text output-text");
  assert.equal(parsed.toolCalls.length, 2);
  assert.deepEqual(parsed.toolCalls[0], {
    name: "get_weather",
    args: { location: "london" },
    callId: "tc_1",
  });
  assert.deepEqual(parsed.toolCalls[1], {
    name: "fetch_json",
    args: { url: "https://example.com" },
    callId: "fc_2",
  });
});
