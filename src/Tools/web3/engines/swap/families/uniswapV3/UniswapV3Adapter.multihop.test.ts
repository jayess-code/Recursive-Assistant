/// <reference types="node" />
/**
 * UniswapV3Adapter.multihop.test.ts
 *
 * Focused tests for the UniswapV3Adapter multi-hop (exactInput / quoteExactInput)
 * branches without hitting the network.
 *
 * Requirements:
 *   Node.js 22.8+ with --experimental-test-module-mocks  OR  Node.js 23+
 *
 * Run:
 *   npx tsx --test --experimental-test-module-mocks \
 *     Tools/web3Tools/engines/swap/families/uniswapV3/UniswapV3Adapter.multihop.test.ts
 */

import { before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
const WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" as const;
const SHIB = "0x6f8a06447Ff6FcF75d803135a7de15CE88C1d4ec" as const;
const ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as const;
const QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as const;
const SENDER = "0x0000000000000000000000000000000000000000" as const;

const MOCK_AMOUNT_OUT = 5_000_000_000_000_000_000n; // 5 × 10^18
const MOCK_GAS = 210000n;

// ---------------------------------------------------------------------------
// Mock setup — must happen before any import of the module under test
// ---------------------------------------------------------------------------

const mockReadContract = mock.fn(async (..._args: unknown[]) => {
  // quoteExactInput returns (amountOut, sqrtPriceX96List, ticksCrossedList, gasEstimate)
  return [MOCK_AMOUNT_OUT, [], [], MOCK_GAS] as const;
});

const mockEstimateGas = mock.fn(async () => MOCK_GAS);

// Holds the dynamically imported class after mocking is in place.
let UniswapV3AdapterClass: typeof import("./UniswapV3Adapter")["UniswapV3Adapter"];

before(async () => {
  await mock.module("../../../../clients/viem/getViemPublicClient", {
    namedExports: {
      getViemPublicClient: (_chain: string) => ({
        readContract: mockReadContract,
        estimateGas: mockEstimateGas,
      }),
    },
  });
  const mod = await import("./UniswapV3Adapter");
  UniswapV3AdapterClass = mod.UniswapV3Adapter;
});

function buildMultiHopRequest() {
  return {
    chain: "polygon",
    routerAddress: ROUTER,
    quoterAddress: QUOTER,
    tokenIn: USDC,
    tokenOut: SHIB,
    amount: "1000",
    tradeType: "exact_in" as const,
    sender: SENDER,
    recipient: SENDER,
    path: [USDC, WETH, SHIB] as `0x${string}`[],
    feeTiers: [500, 3000],
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
  family: "uniswap_v3" as const,
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

describe("UniswapV3Adapter — multi-hop getQuote (quoteExactInput branch)", () => {
  beforeEach(() => {
    mockReadContract.mock.resetCalls();
  });

  it("calls quoteExactInput (not quoteExactInputSingle) for 3-token path", async () => {
    const adapter = new UniswapV3AdapterClass();
    await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.equal(mockReadContract.mock.callCount(), 1);
    const firstCall = mockReadContract.mock.calls[0];
    assert.ok(firstCall, "expected first readContract call");
    const firstArg = firstCall.arguments[0];
    assert.ok(firstArg, "expected first readContract argument");
    const callArg = firstArg as { functionName: string };
    assert.equal(callArg.functionName, "quoteExactInput");
  });

  it("passes a 132-hex-char packed path for 3-token V3 path with 2 fee tiers", async () => {
    const adapter = new UniswapV3AdapterClass();
    await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    const firstCall = mockReadContract.mock.calls[0];
    assert.ok(firstCall, "expected first readContract call");
    const firstArg = firstCall.arguments[0];
    assert.ok(firstArg, "expected first readContract argument");
    const callArg = firstArg as { args: unknown[] };
    const packedPath = callArg.args[0] as string;
    assert.ok(packedPath.startsWith("0x"));
    // 40 + 6 + 40 + 6 + 40 = 132 hex chars (V3: fee bytes between addresses)
    assert.equal(packedPath.length - 2, 132);
  });

  it("fee 500 (0x0001F4) and fee 3000 (0x000BB8) appear in the packed path", async () => {
    const adapter = new UniswapV3AdapterClass();
    await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    const firstCall = mockReadContract.mock.calls[0];
    assert.ok(firstCall, "expected first readContract call");
    const firstArg = firstCall.arguments[0];
    assert.ok(firstArg, "expected first readContract argument");
    const callArg = firstArg as { args: unknown[] };
    const packedPath = (callArg.args[0] as string).toLowerCase();
    assert.ok(packedPath.includes("0001f4"), "fee 500 must appear in packed path");
    assert.ok(packedPath.includes("000bb8"), "fee 3000 must appear in packed path");
  });

  it("returns amountOut from mock quoter", async () => {
    const adapter = new UniswapV3AdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.equal(quote.amountOut, MOCK_AMOUNT_OUT.toString());
  });

  it("metadata.feeTiers reflects the fee tiers passed in request", async () => {
    const adapter = new UniswapV3AdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.deepEqual((quote.metadata as { feeTiers: number[] }).feeTiers, [500, 3000]);
  });

  it("metadata.quoteFunction is 'quoteExactInput'", async () => {
    const adapter = new UniswapV3AdapterClass();
    const quote = await adapter.getQuote(buildMultiHopRequest(), detectorResult);

    assert.equal((quote.metadata as { quoteFunction: string }).quoteFunction, "quoteExactInput");
  });

  it("path array in quote contains all 3 addresses", async () => {
    const adapter = new UniswapV3AdapterClass();
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

describe("UniswapV3Adapter — multi-hop buildSwapTransaction (exactInput branch)", () => {
  beforeEach(() => {
    mockEstimateGas.mock.resetCalls();
  });

  it("generates calldata starting with exactInput selector (0xc04b8d59)", async () => {
    const adapter = new UniswapV3AdapterClass();
    const request = buildMultiHopRequest();
    const mockQuote = {
      family: "uniswap_v3" as const,
      chain: "polygon",
      routerAddress: ROUTER,
      tokenIn: USDC,
      tokenOut: SHIB,
      tradeType: "exact_in" as const,
      amountIn: "1000",
      amountOut: MOCK_AMOUNT_OUT.toString(),
      path: [USDC, WETH, SHIB] as `0x${string}`[],
      quoterAddress: QUOTER,
      source: "onchain" as const,
      metadata: {},
    };

    const artifacts = await adapter.buildSwapTransaction(request, mockQuote);

    assert.ok(artifacts.data.startsWith("0x"));
    // exactInput((bytes,address,uint256,uint256,uint256)) with deadline = 0xc04b8d59
    assert.equal(
      artifacts.data.slice(0, 10).toLowerCase(),
      "0xc04b8d59",
      "must use exactInput selector for multi-hop"
    );
  });

  it("router address is the tx destination", async () => {
    const adapter = new UniswapV3AdapterClass();
    const mockQuote = {
      family: "uniswap_v3" as const,
      chain: "polygon",
      routerAddress: ROUTER,
      tokenIn: USDC,
      tokenOut: SHIB,
      tradeType: "exact_in" as const,
      amountIn: "1000",
      amountOut: MOCK_AMOUNT_OUT.toString(),
      path: [USDC, WETH, SHIB] as `0x${string}`[],
      quoterAddress: QUOTER,
      source: "onchain" as const,
      metadata: {},
    };

    const artifacts = await adapter.buildSwapTransaction(buildMultiHopRequest(), mockQuote);

    assert.equal(artifacts.to.toLowerCase(), ROUTER.toLowerCase());
  });

  it("value is 0n for ERC-20 input swap", async () => {
    const adapter = new UniswapV3AdapterClass();
    const mockQuote = {
      family: "uniswap_v3" as const,
      chain: "polygon",
      routerAddress: ROUTER,
      tokenIn: USDC,
      tokenOut: SHIB,
      tradeType: "exact_in" as const,
      amountIn: "1000",
      amountOut: MOCK_AMOUNT_OUT.toString(),
      path: [USDC, WETH, SHIB] as `0x${string}`[],
      quoterAddress: QUOTER,
      source: "onchain" as const,
      metadata: {},
    };

    const artifacts = await adapter.buildSwapTransaction(buildMultiHopRequest(), mockQuote);

    assert.equal(artifacts.value, 0n);
  });
});
