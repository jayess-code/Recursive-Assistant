/**
 * encodeMultihopPath.test.ts
 *
 * Pure unit tests for encodeV3Path and encodeAlgebraPath.
 * No RPC calls — all assertions are on deterministic byte encoding.
 *
 * Run:
 *   node --test --require tsx/cjs Tools/web3Tools/engines/swap/shared/encodeMultihopPath.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { encodeAlgebraPath, encodeV3Path } from "./encodeMultihopPath";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN_A = "0x0000000000000000000000000000000000000001" as const;
const TOKEN_B = "0x0000000000000000000000000000000000000002" as const;
const TOKEN_C = "0x0000000000000000000000000000000000000003" as const;

// Real Polygon addresses (checksummed) — exercise getAddress normalisation
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
const WPOL = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as const;
const SHIB = "0x6f8a06447Ff6FcF75d803135a7de15CE88C1d4ec" as const;

// ---------------------------------------------------------------------------
// encodeAlgebraPath — no fee bytes, just concatenated addresses
// ---------------------------------------------------------------------------

test("encodeAlgebraPath: 2-token path → 80 hex chars (2 × 20 bytes)", () => {
  const result = encodeAlgebraPath([TOKEN_A, TOKEN_B]);
  assert.ok(result.startsWith("0x"), "result must start with 0x");
  assert.equal(result.length - 2, 80, "2 addresses × 40 hex chars each = 80");
});

test("encodeAlgebraPath: 3-token path → 120 hex chars (3 × 20 bytes)", () => {
  const result = encodeAlgebraPath([TOKEN_A, TOKEN_B, TOKEN_C]);
  assert.equal(result.length - 2, 120);
});

test("encodeAlgebraPath: real 3-hop Polygon path → 120 hex chars", () => {
  const result = encodeAlgebraPath([USDC, WPOL, SHIB]);
  assert.equal(result.length - 2, 120);
});

test("encodeAlgebraPath: result is lowercase hex only (0x + [a-f0-9]+)", () => {
  const result = encodeAlgebraPath([TOKEN_A, TOKEN_B, TOKEN_C]);
  assert.match(result, /^0x[0-9a-f]+$/);
});

test("encodeAlgebraPath: token bodies appear in order in packed output", () => {
  const result = encodeAlgebraPath([TOKEN_A, TOKEN_B]);
  // TOKEN_A body = 0000000000000000000000000000000000000001 (40 chars)
  assert.ok(result.toLowerCase().includes("0000000000000000000000000000000000000001"));
  assert.ok(result.toLowerCase().includes("0000000000000000000000000000000000000002"));
  const posA = result.toLowerCase().indexOf("0000000000000000000000000000000000000001");
  const posB = result.toLowerCase().indexOf("0000000000000000000000000000000000000002");
  assert.ok(posA < posB, "TOKEN_A body must precede TOKEN_B body");
});

test("encodeAlgebraPath: throws for single-token path", () => {
  assert.throws(() => encodeAlgebraPath([TOKEN_A]), /at least two/i);
});

test("encodeAlgebraPath: throws for empty path", () => {
  // empty array → length < 2
  assert.throws(() => encodeAlgebraPath([]), /at least two/i);
});

// ---------------------------------------------------------------------------
// encodeV3Path — address + uint24 fee interleaved
// ---------------------------------------------------------------------------

test("encodeV3Path: 2-token path → 86 hex chars (20 + 3 + 20 bytes)", () => {
  // 40 + 6 + 40 = 86
  const result = encodeV3Path([TOKEN_A, TOKEN_B], [3000]);
  assert.ok(result.startsWith("0x"));
  assert.equal(result.length - 2, 86);
});

test("encodeV3Path: 3-token path → 132 hex chars (20+3+20+3+20 bytes)", () => {
  // 40 + 6 + 40 + 6 + 40 = 132
  const result = encodeV3Path([TOKEN_A, TOKEN_B, TOKEN_C], [500, 3000]);
  assert.equal(result.length - 2, 132);
});

test("encodeV3Path: real 3-hop Polygon path → 132 hex chars", () => {
  const result = encodeV3Path([USDC, WPOL, SHIB], [500, 3000]);
  assert.equal(result.length - 2, 132);
});

test("encodeV3Path: fee 3000 encodes as 000bb8 (uint24 big-endian)", () => {
  const result = encodeV3Path([TOKEN_A, TOKEN_B], [3000]);
  // 3000 decimal = 0x000BB8
  assert.match(result, /000bb8/i);
});

test("encodeV3Path: fee 500 encodes as 0001f4", () => {
  const result = encodeV3Path([TOKEN_A, TOKEN_B], [500]);
  assert.match(result, /0001f4/i);
});

test("encodeV3Path: fee 100 encodes as 000064", () => {
  const result = encodeV3Path([TOKEN_A, TOKEN_B], [100]);
  assert.match(result, /000064/i);
});

test("encodeV3Path: fee 10000 encodes as 002710", () => {
  const result = encodeV3Path([TOKEN_A, TOKEN_B], [10000]);
  assert.match(result, /002710/i);
});

test("encodeV3Path: fee bytes appear between token bodies in 3-hop path", () => {
  const result = encodeV3Path([TOKEN_A, TOKEN_B, TOKEN_C], [500, 3000]);
  const body = result.slice(2).toLowerCase();
  // Expected layout: <TOKEN_A 40><fee0 6><TOKEN_B 40><fee1 6><TOKEN_C 40>
  const tokenA = "0000000000000000000000000000000000000001";
  const tokenB = "0000000000000000000000000000000000000002";
  const tokenC = "0000000000000000000000000000000000000003";
  const fee0 = "0001f4"; // 500
  const fee1 = "000bb8"; // 3000
  assert.equal(body, `${tokenA}${fee0}${tokenB}${fee1}${tokenC}`);
});

test("encodeV3Path: throws when feeTiers.length !== tokens.length - 1 (too few)", () => {
  // 3 tokens require 2 fee tiers
  assert.throws(() => encodeV3Path([TOKEN_A, TOKEN_B, TOKEN_C], [3000]), /fee tiers/i);
});

test("encodeV3Path: throws when feeTiers.length !== tokens.length - 1 (too many)", () => {
  assert.throws(() => encodeV3Path([TOKEN_A, TOKEN_B], [3000, 500]), /fee tiers/i);
});

test("encodeV3Path: throws for empty feeTiers with 2-token path", () => {
  assert.throws(() => encodeV3Path([TOKEN_A, TOKEN_B], []), /fee tiers/i);
});

test("encodeV3Path: throws for single-token path", () => {
  assert.throws(() => encodeV3Path([TOKEN_A], []), /at least two/i);
});

test("encodeV3Path: throws for fee tier of 0 (below uint24 floor)", () => {
  assert.throws(() => encodeV3Path([TOKEN_A, TOKEN_B], [0]), /invalid fee tier/i);
});

test("encodeV3Path: throws for fee tier above uint24 max (0xFFFFFF + 1)", () => {
  assert.throws(() => encodeV3Path([TOKEN_A, TOKEN_B], [0xffffff + 1]), /invalid fee tier/i);
});

test("encodeV3Path: throws for non-integer fee tier", () => {
  assert.throws(() => encodeV3Path([TOKEN_A, TOKEN_B], [1500.5]), /invalid fee tier/i);
});
