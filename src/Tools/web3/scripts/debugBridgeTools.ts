/**
 * debugBridgeTools.ts
 *
 * Focused bridge diagnostics:
 *   - Quote routes
 *   - Execute preview (dry-run)
 *   - Track transaction status
 *
 * Run:
 *   npx tsx Tools/web3/scripts/debugBridgeTools.ts
 */
import "dotenv/config";

import { bridgeQuote, bridgeExecute, bridgeStatus, BridgeQuoteToolArgs } from "../tools/bridge/bridge";

const QUOTE_TIMEOUT_MS = 12_000;
const EXECUTE_TIMEOUT_MS = 12_000;
const STATUS_TIMEOUT_MS = 10_000;
const SUITE_WATCHDOG_MS = 120_000;
const INCLUDE_SLOW_SCENARIOS = process.env.BRIDGE_DEBUG_INCLUDE_SLOW === "true";

type RouteCandidate = {
  name: string;
  args: BridgeQuoteToolArgs;
};

// Default scenarios stay on L2 pairs for faster diagnostics.
const TEST_SCENARIOS: RouteCandidate[] = [
  {
    name: "USDC Polygon -> Arbitrum",
    args: {
      fromChain: "polygon",
      toChain: "arbitrum",
      token: "USDC",
      amount: "1000000",
      recipient: "0xf4e7a20ba40f26a35e3d7bb474eea5f69bb6193d" as const,
      srcTokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`,
      dstTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`,
      slippageBps: 100,
      transportMode: null,
      routeStrategy: "auto",
      fields: null,
      includeRawStepData: true,
    } as BridgeQuoteToolArgs,
  },
  {
    name: "USDC Base -> Optimism",
    args: {
      fromChain: "base",
      toChain: "optimism",
      token: "USDC",
      amount: "1000000", // 1 USDC (6 decimals)
      recipient: "0xf4e7a20ba40f26a35e3d7bb474eea5f69bb6193d" as const,
      srcTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
      dstTokenAddress: "0x0b2C639c533813f4Aa9D7837CaF62653d097Ff85" as `0x${string}`,
      slippageBps: null,
      transportMode: null,
      routeStrategy: "auto",
      fields: null,
      includeRawStepData: true,
    } as BridgeQuoteToolArgs,
  },
  ...(INCLUDE_SLOW_SCENARIOS
    ? [
        {
          name: "USDC Ethereum -> Arbitrum (slow)",
          args: {
            fromChain: "ethereum",
            toChain: "arbitrum",
            token: "USDC",
            amount: "1000000",
            recipient: "0xf4e7a20ba40f26a35e3d7bb474eea5f69bb6193d" as const,
            srcTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
            dstTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`,
            slippageBps: 100,
            transportMode: null,
            routeStrategy: "auto",
            fields: null,
            includeRawStepData: true,
          } as BridgeQuoteToolArgs,
        },
      ]
    : []),
];

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

async function runBridgeQuoteTests(): Promise<BridgeQuoteToolArgs | null> {
  console.log("\n=== BRIDGE QUOTE TESTS ===\n");

  let firstSupportedArgs: BridgeQuoteToolArgs | null = null;

  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n📍 Scenario: ${scenario.name}`);
    console.log(`   From: ${scenario.args.fromChain} → To: ${scenario.args.toChain}`);
    console.log(`   Amount: ${scenario.args.amount} (${scenario.args.token})`);
    console.log(`   Mode: ${scenario.args.transportMode || "auto"}`);

    try {
      const startTime = Date.now();
      console.log(`   Timeout: ${QUOTE_TIMEOUT_MS}ms`);
      const quoteResult = await withTimeout(
        bridgeQuote(scenario.args),
        QUOTE_TIMEOUT_MS,
        "Quote"
      );
      const elapsed = Date.now() - startTime;

      const quoteData = quoteResult as Record<string, unknown>;
      const status = quoteData.status as string;

      // Check if the quote was actually successful
      if (status !== "supported") {
        console.log(`\n⚠️  Quote Returned: ${status} (${elapsed}ms)`);
        console.log(`   Reason: ${quoteData.reason || "N/A"}`);
        const details =
          typeof quoteData.details === "string"
            ? quoteData.details
            : quoteData.details
              ? formatJson(quoteData.details)
              : "N/A";
        console.log(`   Details: ${details}`);
        console.log(`\n   Full Response:\n${formatJson(quoteData)}\n`);
        continue;
      }

      console.log(`\n✅ Quote Success (${elapsed}ms)`);
      if (!firstSupportedArgs) {
        firstSupportedArgs = scenario.args;
      }

      const route = (quoteData as any).route;
      const executionPlan = (quoteData as any).executionPlan;

      console.log(`   Status: ${status}`);
      console.log(`   Route: ${route?.protocol || "N/A"}`);
      console.log(`   Estimated Output: ${quoteData.estimatedOutput || "N/A"}`);
      console.log(`   Execution Steps: ${executionPlan?.steps?.length || 0}`);

      console.log(`\n   Full Response:\n${formatJson(quoteData)}\n`);
    } catch (error) {
      console.error(`\n❌ Quote Failed with Exception:`);
      console.error(`   ${error instanceof Error ? error.message : String(error)}`);
      console.error(`   Stack: ${error instanceof Error ? error.stack : "N/A"}`);
    }
  }

  return firstSupportedArgs;
}

async function runBridgeExecutePreviewTest(baseArgs: BridgeQuoteToolArgs | null) {
  console.log("\n\n=== BRIDGE EXECUTE PREVIEW TEST (DRY-RUN) ===\n");

  if (!baseArgs) {
    console.log("⚠️  Skipping execute preview: no supported quote scenario was found.");
    return;
  }

  const testArgs: BridgeQuoteToolArgs = {
    ...baseArgs,
    fields: null,
    includeRawStepData: true,
  };

  console.log("🌉 Scenario: Execute Preview (dry-run)");
  console.log(`   From: ${testArgs.fromChain} → To: ${testArgs.toChain}`);
  console.log(`   Amount: ${testArgs.amount} ${testArgs.token}`);

  try {
    const startTime = Date.now();
    console.log(`   Timeout: ${EXECUTE_TIMEOUT_MS}ms`);
    const executeResult = await withTimeout(
      bridgeExecute({ ...testArgs, dryRun: true }),
      EXECUTE_TIMEOUT_MS,
      "Execute"
    );
    const elapsed = Date.now() - startTime;

    const executeData = executeResult as Record<string, unknown>;
    const status = executeData.status as string;
    const mode = executeData.mode as string;

    if (status !== "supported") {
      console.log(`\n⚠️  Execute Preview Returned: ${status} (${elapsed}ms)`);
      console.log(`   Mode: ${mode}`);
      console.log(`   Reason: ${executeData.reason || "N/A"}`);
      console.log(`   Details: ${executeData.details || "N/A"}`);
      console.log(`\n   Full Response:\n${formatJson(executeData)}\n`);
      return;
    }

    console.log(`\n✅ Execute Preview Success (${elapsed}ms)`);

    const executionPlan = (executeData as any).plan ?? (executeData as any).executionPlan;
    console.log(`   Mode: ${mode}`);
    console.log(`   Status: ${status}`);
    const approvalRequired = (executeData as any).approval?.required ?? false;
    console.log(`   Approval Required: ${approvalRequired}`);
    console.log(`   Execution Steps: ${executionPlan?.steps?.length || 0}`);

    console.log(`\n   Full Response:\n${formatJson(executeData)}\n`);
  } catch (error) {
    console.error(`\n❌ Execute Preview Failed:`);
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runBridgeStatusTest() {
  console.log("\n\n=== BRIDGE STATUS TEST ===\n");

  const testTxHash = "0x" + "a".repeat(64) as `0x${string}`;

  console.log("📍 Scenario: Check transaction status");
  console.log(`   Chain: base`);
  console.log(`   TxHash: ${testTxHash}`);

  try {
    const statusResult = await withTimeout(
      bridgeStatus({
        fromChain: "base",
        txHash: testTxHash,
        providerHint: "stargate",
        includeReceipt: false,
        includeTransaction: false,
      }),
      STATUS_TIMEOUT_MS,
      "Status"
    );

    console.log(`\n✅ Status Check Complete`);
    console.log(`   State: ${statusResult.state}`);
    console.log(`   Terminal: ${statusResult.terminal}`);
    console.log(`   Confirmations: ${statusResult.confirmations}`);
    console.log(`   Next Poll: ${statusResult.nextPollSeconds}s`);

    console.log(`\n   Full Response:\n${formatJson(statusResult)}\n`);
  } catch (error) {
    console.error(`\n❌ Status Check Failed:`);
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error(`\n❌ Bridge debug suite exceeded ${SUITE_WATCHDOG_MS}ms watchdog timeout.`);
    process.exit(1);
  }, SUITE_WATCHDOG_MS);
  watchdog.unref();

  console.log("🌉 Bridge Tools Debug Suite");
  console.log("====================================");
  if (!INCLUDE_SLOW_SCENARIOS) {
    console.log("ℹ️  Slow scenarios are disabled (set BRIDGE_DEBUG_INCLUDE_SLOW=true to enable).");
  }

  try {
    const supportedArgs = await runBridgeQuoteTests();

    await runBridgeExecutePreviewTest(supportedArgs);
    await runBridgeStatusTest();

    console.log("\n\n✅ All debug tests complete!");
    console.log("====================================\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Debug suite failed:");
    console.error(error);
    process.exit(1);
  } finally {
    clearTimeout(watchdog);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
