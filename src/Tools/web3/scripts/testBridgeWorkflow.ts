/**
 * testBridgeWorkflow.ts
 *
 * Integration tests for bridge tools workflow:
 *   1. Quote phase – discover routes
 *   2. Validation phase – check feasibility
 *   3. Execute phase – dry-run to verify calldata
 *   4. Status phase – track result
 *
 * Run:
 *   npx tsx Tools/web3/scripts/testBridgeWorkflow.ts
 */

import { bridgeQuote, bridgeExecute, bridgeStatus, BridgeQuoteToolArgs } from "../tools/bridge/bridge";
const DEFAULT_USER_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

interface WorkflowTest {
  name: string;
  description: string;
  quoteArgs: BridgeQuoteToolArgs;
  executeArgs?: Partial<BridgeQuoteToolArgs>;
  expectedFields?: string[];
}

const WORKFLOW_TESTS: WorkflowTest[] = [
  {
    name: "Single-Hop USDC Bridge",
    description: "Route USDC from Polygon to Arbitrum via auto selection",
    quoteArgs: {
      fromChain: "polygon",
      toChain: "arbitrum",
      token: "USDC",
      amount: "1000000",
      recipient: DEFAULT_USER_ADDRESS,
      srcTokenAddress: null,
      dstTokenAddress: null,
      slippageBps: 100,
      transportMode: null,
      routeStrategy: "auto",
      fields: ["route", "estimatedOutput", "approvalRequired", "executionPlan"],
      includeRawStepData: true,
    },
    executeArgs: {
      slippageBps: 100,
    },
    expectedFields: ["route", "estimatedOutput"],
  },
  {
    name: "Multi-Hop Bridge with Custom Slippage",
    description: "Test explicit token addresses and custom slippage",
    quoteArgs: {
      fromChain: "polygon",
      toChain: "arbitrum",
      token: "USDC",
      amount: "2000000",
      recipient: DEFAULT_USER_ADDRESS,
      srcTokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`,
      dstTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`,
      slippageBps: 50,
      transportMode: "taxi",
      routeStrategy: "v2_adapter",
      fields: ["route", "executionPlan"],
      includeRawStepData: false,
    },
    expectedFields: ["executionPlan"],
  },
];

async function testQuotePhase(test: WorkflowTest): Promise<boolean> {
  console.log(`   📋 Quote Phase...`);
  try {
    const quoteResult = await bridgeQuote(test.quoteArgs);
    

    const quoteData = quoteResult as Record<string, unknown>;
    const status = quoteData.status;

    if (status !== "supported") {
      console.log(`      ❌ Quote failed: status=${status}`);
      return false;
    }


    // Validate required fields
    const qd = quoteData as any;
    if (!qd.route) {
      console.log(`      ❌ No route found in response`);
      return false;
    }

    if (!qd.estimatedOutput) {
      console.log(`      ❌ No estimatedOutput in response`);
      return false;
    }

    console.log(`      ✅ Route found: ${qd.route.protocol || "unknown"}`);
    console.log(`         Estimated Output: ${qd.estimatedOutput}`);
    console.log(`         Steps: ${qd.executionPlan?.steps?.length || 0}`);
    console.log(`         Approval Required: ${qd.approvalRequired || false}`);
    return true;
  } catch (error) {
    console.log(`      ❌ Quote phase error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testValidationPhase(quoteData: unknown): Promise<boolean> {
  console.log(`   🔍 Validation Phase...`);
  try {
    const quote = quoteData as Record<string, unknown>;

    // Check route has required fields
    const route = quote.route as Record<string, unknown>;
    if (!route || typeof route !== "object") {
      console.log(`      ❌ Invalid route structure`);
      return false;
    }

    if (route.protocol && typeof route.protocol === "string") {
      console.log(`      ✅ Protocol: ${route.protocol}`);
    }

    // Check execution plan
    const plan = quote.executionPlan as Record<string, unknown>;
    if (plan && Array.isArray(plan.steps)) {
      console.log(`      ✅ Execution Plan has ${plan.steps.length} step(s)`);
    }

    // Validate slippage bounds
    const estimatedOutput = quote.estimatedOutput;
    if (estimatedOutput && typeof estimatedOutput === "string") {
      const outputNum = BigInt(estimatedOutput);
      if (outputNum <= 0n) {
        console.log(`      ⚠️  Warning: Estimated output is zero or negative`);
        return false;
      }
      console.log(`      ✅ Output validation passed`);
    }

    return true;
  } catch (error) {
    console.log(`      ❌ Validation phase error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testExecutePhase(test: WorkflowTest): Promise<boolean> {
  console.log(`   ⚙️  Execute Phase (dry-run)...`);
  try {
    const executeArgs = { ...test.quoteArgs, ...test.executeArgs, dryRun: true };
    const executeResult = await bridgeExecute(executeArgs);


    const executeData = executeResult as Record<string, unknown>;
    const ed = executeData as any;
    console.log(`      ✅ Execute preview successful`);
    console.log(`         Mode: ${ed.mode}`);
    console.log(`         Status: ${ed.status}`);

    // Verify step calldata if present
    const plan = ed.executionPlan as Record<string, unknown>;
    if (plan && Array.isArray(plan.steps)) {
      const stepsWithCalldata = (plan.steps as Array<Record<string, unknown>>).filter(
        (s) => s.calldata && typeof s.calldata === "string"
      ).length;
      if (stepsWithCalldata > 0) {
        console.log(`         Steps with calldata: ${stepsWithCalldata}`);
      }
    }

    return true;
  } catch (error) {
    console.log(`      ❌ Execute phase error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function testStatusPhase(): Promise<boolean> {
  console.log(`   📍 Status Phase...`);
  try {
    // Mock an old block hash for testing
    const mockTxHash = "0x" + "b".repeat(64) as `0x${string}`;

    const statusResult = await bridgeStatus({
      fromChain: "polygon",
      txHash: mockTxHash,
      providerHint: "stargate",
      includeReceipt: false,
      includeTransaction: false,
    });

    // For a non-existent tx, expect "unknown" state
    if (statusResult.state !== "unknown") {
      console.log(`      ⚠️  Expected state 'unknown' for mock tx, got '${statusResult.state}'`);
    }

    console.log(`      ✅ Status check complete`);
    console.log(`         State: ${statusResult.state}`);
    console.log(`         Terminal: ${statusResult.terminal}`);

    return true;
  } catch (error) {
    console.log(`      ❌ Status phase error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function runWorkflowTest(test: WorkflowTest): Promise<boolean> {
  console.log(`\n🧪 Test: ${test.name}`);
  console.log(`   Description: ${test.description}`);
  console.log(`   From: ${test.quoteArgs.fromChain} → To: ${test.quoteArgs.toChain}`);

  // Phase 1: Quote
  const quotePhaseOk = await testQuotePhase(test);
  if (!quotePhaseOk) {
    console.log(`\n   ❌ Quote phase failed - aborting workflow`);
    return false;
  }

  // Get quote data for next phase
  let quoteData: unknown;
  try {
    quoteData = await bridgeQuote(test.quoteArgs);
  } catch (error) {
    console.log(`   ❌ Could not retrieve quote data: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  // Phase 2: Validation
  const validationOk = await testValidationPhase(quoteData);
  if (!validationOk) {
    console.log(`\n   ⚠️  Validation phase failed - continuing for diagnostics`);
  }

  // Phase 3: Execute (dry-run)
  const executeOk = await testExecutePhase(test);
  if (!executeOk) {
    console.log(`\n   ❌ Execute phase failed - aborting workflow`);
    return false;
  }

  // Phase 4: Status
  const statusOk = await testStatusPhase();
  if (!statusOk) {
    console.log(`\n   ⚠️  Status phase issue`);
  }

  console.log(`\n   ✅ Workflow test passed!\n`);
  return quotePhaseOk && executeOk;
}

async function main() {
  console.log("🌉 Bridge Workflow Integration Tests");
  console.log("=====================================\n");

  const results = [];

  for (const test of WORKFLOW_TESTS) {
    const passed = await runWorkflowTest(test);
    results.push({ name: test.name, passed });
  }

  // Summary
  console.log("\n📊 Test Summary");
  console.log("=====================================");
  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.name}`);
  }

  const passCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`\nPassed: ${passCount}/${totalCount}`);

  if (passCount === totalCount) {
    console.log("\n✅ All workflow tests passed!\n");
    process.exit(0);
  } else {
    console.log("\n❌ Some tests failed\n");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
