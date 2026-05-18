import test from "node:test";
import assert from "node:assert/strict";

import { serializeBigIntValues } from "./serialization";

test("serializeBigIntValues converts nested bigint values to strings", () => {
  const input = {
    a: 1n,
    b: [2n, { c: 3n }],
    d: "ok",
    e: 42,
  };

  const result = serializeBigIntValues(input);

  assert.deepEqual(result, {
    a: "1",
    b: ["2", { c: "3" }],
    d: "ok",
    e: 42,
  });
});

test("serializeBigIntValues leaves primitive non-bigint values unchanged", () => {
  assert.equal(serializeBigIntValues("hello"), "hello");
  assert.equal(serializeBigIntValues(123), 123);
  assert.equal(serializeBigIntValues(null), null);
  assert.equal(serializeBigIntValues(undefined), undefined);
  assert.equal(serializeBigIntValues(true), true);
});
