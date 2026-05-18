/**
 * AlgebraAdapter.multihop.test.ts
 *
 * Focused tests for the AlgebraAdapter multi-hop (exactInput / quoteExactInput)
 * branches without hitting the network.
 *
 * Requirements:
 *   Node.js 22.8+ with --experimental-test-module-mocks  OR  Node.js 23+
 *
 * Run:
 *   node --test --experimental-test-module-mocks \
 *     --import tsx/esm \
 *     Tools/web3Tools/engines/swap/families/algebra/AlgebraAdapter.multihop.test.ts
 */

import { before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
const WPOL = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as const;
const SHIB = "0x6f8a06447Ff6FcF75d803135a7de15CE88C1d4ec" as const;
const ROUTER = "0xf5b509bB0909a69B1c207E495f687a596C168E12" as const;
const QUOTER = "0xa15F0D7377B2A0C0c10db057f641beD21028FC89" as const;
const SENDER = "0x0000000000000000000000000000000000000000" as const;

const MOCK_AMOUNT_OUT = 159063011389453978687n;
const MOCK_FEES = [537n, 1550n] as const;
const MOCK_GAS = 220000n;

// ---------------------------------------------------------------------------
// Mock setup — registered in before() hook to avoid top-level await
// ---------------------------------------------------------------------------

let readContractArgs: unknown[] = [];
let estimateGasArgs: unknown[] = [];

const mockReadContract = mock.fn(async (...args: unknown[]) => {
  readContractArgs.push(args[0]);
  return [MOCK_AMOUNT_OUT, MOCK_FEES];
});

const mockEstimateGas = mock.fn(async (...args: unknown[]) => {
  estimateGasArgs.push(args[0]);
  return MOCK_GAS;
});

// Holds the dynamically imported class after mocking is in place.
let AlgebraAdapterClass: typeof import("./AlgebraAdapter")["AlgebraAdapter"];

before(async () => {
  // The path is relative to this test file (both in .../families/algebra/).
  await mock.module("../../../../clients/viem/getViemPublicClient", {
    namedExports: {
      getViemPublicClient: (_chain: string) => ({
        readContract: mockReadContract,
        estimateGas: mockEstimateGas,
      }),
    },
  });
  const mod = await import("./AlgebraAdapter");
  AlgebraAdapterClass = mod.AlgebraAdapter;
});

function buildMultiHopRequest(overrides: Partial<{ tradeType: "exact_in" | "exact_out" }> = {}) {
  return {
    chain: "polygon",
    routerAddress: ROUTER,
    quoterAddress: QUOTER,
    tokenIn: USDC,
    tokenOut: SHIB,
    amount: "1000",
    tradeType: (overrides.tradeType ?? "exact_in") as "exact_in" | "exact_out",
    sender: SENDER,
    recipient: SENDER,
    path: [USDC, WPOL, SHIB] as `0x${string}`[],
    feeTiers: null,
    feeTier: null,
    slippageBps: 100,
    allowLowConfidence: false,
    abi: null,
    deadlineSecondsFromNow: 1200,
    dryRun: true,
    feeOnTransferTokenIn: false,
    feeOnTransferTokenOut: false,
  };
}

const detectorResult = {
  family: "algebra" as const,
  routerAddress: ROUTER,
  quoterAddress: QUOTER,
  supportStatus: "supported" as const,
  confidence: "high" as const,
  identitySource: "registry" as const,
  chain: "polygon" as const,
  reasons: [],
  signals: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AlgebraAdapter — multi-hop getQuote (quoteExactInput branch)", () => {
  beforeEach(() => {
    mockReadContract.mock.resetCalls();
    readContractArgs = [];
  });

  it("calls quoteExactInput (not quoteExactInputSingle) for 3-token path", async () => {
    const adapter = new AlgebraAdapterClass();
    await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.equal(mockReadContract.mock.callCount(), 1, "exactly one readContract call");
    const firstCall = mockReadContract.mock.calls[0];
    assert.ok(firstCall, "expected first readContract call");
    const firstArg = firstCall.arguments[0];
    assert.ok(firstArg, "expected first readContract argument");
    const callArg = firstArg as { functionName: string };
    assert.equal(callArg.functionName, "quoteExactInput");
  });

  it("passes bytes-packed path (not individual tokenIn/tokenOut) to quoter", async () => {
    const adapter = new AlgebraAdapterClass();
    await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    const firstCall = mockReadContract.mock.calls[0];
    assert.ok(firstCall, "expected first readContract call");
    const firstArg = firstCall.arguments[0];
    assert.ok(firstArg, "expected first readContract argument");
    const callArg = firstArg as { args: unknown[] };
    // First argument to quoteExactInput is the packed path bytes
    const packedPath = callArg.args[0] as string;
    assert.ok(packedPath.startsWith("0x"), "packed path must start with 0x");
    // 3 addresses × 40 hex chars = 120 chars (Algebra: no fee bytes between addresses)
    assert.equal((packedPath as string).length - 2, 120, "Algebra path: 3 × 20 bytes = 120 hex chars");
  });

  it("returns amountOut from mock quoter response", async () => {
    const adapter = new AlgebraAdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.equal(quote.amountOut, MOCK_AMOUNT_OUT.toString());
  });

  it("returns discovered fees in metadata.fees", async () => {
    const adapter = new AlgebraAdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.deepEqual(
      (quote.metadata as { fees: number[] }).fees,
      MOCK_FEES.map(Number)
    );
  });

  it("metadata.quoteFunction is 'quoteExactInput'", async () => {
    const adapter = new AlgebraAdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.equal((quote.metadata as { quoteFunction: string }).quoteFunction, "quoteExactInput");
  });

  it("metadata.packedPath is present and well-formed", async () => {
    const adapter = new AlgebraAdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    const packedPath = (quote.metadata as { packedPath: string }).packedPath;
    assert.ok(typeof packedPath === "string" && packedPath.startsWith("0x"));
    assert.equal(packedPath.length - 2, 120);
  });

  it("path array in quote contains checksummed token addresses in order", async () => {
    const adapter = new AlgebraAdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.equal(quote.path.length, 3);
    const firstPathToken = quote.path[0];
    const thirdPathToken = quote.path[2];
    assert.ok(firstPathToken, "expected first path token");
    assert.ok(thirdPathToken, "expected third path token");
    assert.equal(firstPathToken.toLowerCase(), USDC.toLowerCase());
    assert.equal(thirdPathToken.toLowerCase(), SHIB.toLowerCase());
  });
});

describe("AlgebraAdapter — multi-hop buildSwapTransaction (exactInput branch)", () => {
  beforeEach(() => {
    mockReadContract.mock.resetCalls();
    mockEstimateGas.mock.resetCalls();
    readContractArgs = [];
    estimateGasArgs = [];
  });

  it("generates calldata starting with exactInput selector", async () => {
    const adapter = new AlgebraAdapterClass();
    const request = buildMultiHopRequest();
    const mockQuote = {
      family: "algebra" as const,
      chain: "polygon",
      routerAddress: ROUTER,
      tokenIn: USDC,
      tokenOut: SHIB,
      tradeType: "exact_in" as const,
      amountIn: "1000",
      amountOut: MOCK_AMOUNT_OUT.toString(),
      path: [USDC, WPOL, SHIB] as `0x${string}`[],
      quoterAddress: QUOTER,
      source: "onchain" as const,
      metadata: {},
    };

    const artifacts = await adapter.buildSwapTransaction(request, mockQuote);

    assert.ok(artifacts.data.startsWith("0x"), "calldata must start with 0x");
    // exactInput((bytes,address,uint256,uint256,uint256)) with deadline = 0xc04b8d59
    assert.equal(
      artifacts.data.slice(0, 10).toLowerCase(),
      "0xc04b8d59",
      "calldata must start with exactInput selector"
    );
  });

  it("router address is the destination of the built transaction", async () => {
    const adapter = new AlgebraAdapterClass();
    const request = buildMultiHopRequest();
    const mockQuote = {
      family: "algebra" as const,
      chain: "polygon",
      routerAddress: ROUTER,
      tokenIn: USDC,
      tokenOut: SHIB,
      tradeType: "exact_in" as const,
      amountIn: "1000",
      amountOut: MOCK_AMOUNT_OUT.toString(),
      path: [USDC, WPOL, SHIB] as `0x${string}`[],
      quoterAddress: QUOTER,
      source: "onchain" as const,
      metadata: {},
    };

    const artifacts = await adapter.buildSwapTransaction(request, mockQuote);

    assert.equal(artifacts.to.toLowerCase(), ROUTER.toLowerCase());
  });

  it("value is 0n for non-native swap", async () => {
    const adapter = new AlgebraAdapterClass();
    const request = buildMultiHopRequest();
    const mockQuote = {
      family: "algebra" as const,
      chain: "polygon",
      routerAddress: ROUTER,
      tokenIn: USDC,
      tokenOut: SHIB,
      tradeType: "exact_in" as const,
      amountIn: "1000",
      amountOut: MOCK_AMOUNT_OUT.toString(),
      path: [USDC, WPOL, SHIB] as `0x${string}`[],
      quoterAddress: QUOTER,
      source: "onchain" as const,
      metadata: {},
    };

    const artifacts = await adapter.buildSwapTransaction(request, mockQuote);

    assert.equal(artifacts.value, 0n);
  });

  it("estimatedGas is populated from estimateGas call", async () => {
    const adapter = new AlgebraAdapterClass();
    const request = buildMultiHopRequest();
    const mockQuote = {
      family: "algebra" as const,
      chain: "polygon",
      routerAddress: ROUTER,
      tokenIn: USDC,
      tokenOut: SHIB,
      tradeType: "exact_in" as const,
      amountIn: "1000",
      amountOut: MOCK_AMOUNT_OUT.toString(),
      path: [USDC, WPOL, SHIB] as `0x${string}`[],
      quoterAddress: QUOTER,
      source: "onchain" as const,
      metadata: {},
    };

    const artifacts = await adapter.buildSwapTransaction(request, mockQuote);

    assert.equal(artifacts.estimatedGas, MOCK_GAS);
  });
});
