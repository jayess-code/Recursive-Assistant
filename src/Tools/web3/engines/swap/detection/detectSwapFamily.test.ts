import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectSwapFamily } from "./detectSwapFamily";
import type { SwapExecutionRequest } from "../core/SwapTypes";
import {
  __resetDynamicRouterCandidatesStateForTests,
  __setDynamicRouterCandidatesPersistencePathForTests,
  clearDynamicRouterCandidates,
  upsertDynamicRouterCandidate,
} from "../discovery/dynamicRouterCandidates";

function buildRequest(routerAddress: `0x${string}`): SwapExecutionRequest {
  return {
    chain: "ethereum",
    routerAddress,
    tokenIn: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    tokenOut: "0x0000000000000000000000000000000000000002" as `0x${string}`,
    amount: "1",
    tradeType: "exact_in" as const,
    sender: "0x0000000000000000000000000000000000000003" as `0x${string}`,
    recipient: "0x0000000000000000000000000000000000000003" as `0x${string}`,
    abi: null,
    quoterAddress: null,
  };
}

test.beforeEach(() => {
  const isolatedPath = join(
    tmpdir(),
    `swap-dynamic-candidates-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  __setDynamicRouterCandidatesPersistencePathForTests(isolatedPath);
  clearDynamicRouterCandidates();
});

test.afterEach(() => {
  __resetDynamicRouterCandidatesStateForTests();
});

test("verified dynamic candidate has precedence over registry", async () => {
  const registryRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  upsertDynamicRouterCandidate({
    chain: "ethereum",
    routerAddress: registryRouter,
    family: "algebra",
    quoterAddress: null,
    label: "Test dynamic verified candidate",
    source: "test",
    confidence: "high",
    verifiedOnchain: true,
  });

  const result = await detectSwapFamily(buildRequest(registryRouter));

  assert.equal(result.identitySource, "dynamic_verified");
  assert.equal(result.supportStatus, "supported");
  assert.equal(result.family, "algebra");
  assert.equal(result.confidence, "high");
});

test("registry has precedence over unverified dynamic hint", async () => {
  const registryRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  upsertDynamicRouterCandidate({
    chain: "ethereum",
    routerAddress: registryRouter,
    family: "algebra",
    quoterAddress: null,
    label: "Test dynamic hint",
    source: "test",
    confidence: "low",
    verifiedOnchain: false,
  });

  const result = await detectSwapFamily(buildRequest(registryRouter));

  assert.equal(result.identitySource, "registry");
  assert.equal(result.supportStatus, "supported");
  assert.equal(result.family, "uniswap_v2");
  assert.equal(result.confidence, "high");
});

test("unverified dynamic hint downgrades to known_not_executable for unknown router", async () => {
  const unknownRouter = "0x1111111111111111111111111111111111111114";

  upsertDynamicRouterCandidate({
    chain: "ethereum",
    routerAddress: unknownRouter,
    family: "uniswap_v3",
    quoterAddress: null,
    label: "Unknown router hint",
    source: "test",
    confidence: "medium",
    verifiedOnchain: false,
  });

  const result = await detectSwapFamily(buildRequest(unknownRouter));

  assert.equal(result.identitySource, "dynamic_hint");
  assert.equal(result.supportStatus, "known_not_executable");
  assert.equal(result.family, "uniswap_v3");
  assert.equal(result.confidence, "medium");
});
