import { Address } from "viem";
import { SwapExecutionEngine, SwapExecutionRequest } from "../../engines/swap/index";
import { findRouterRegistryEntryByDexId } from "../../engines/swap/discovery/routerRegistry";
import type { ToolResponse } from "../../../types/toolResponse";

export interface SwapDetectToolArgs {
  chain: string;
  routerAddress?: Address | null;
  dexId?: string | null;
  tokenIn?: Address | null;
  tokenOut?: Address | null;
  amount?: string | null;
  tradeType?: "exact_in" | "exact_out" | null;
  sender?: Address | null;
  recipient?: Address | null;
  abi?: readonly unknown[] | null;
  quoterAddress?: Address | null;
}

export interface SwapQuoteToolArgs extends SwapDetectToolArgs {
  tokenIn: Address;
  tokenOut: Address;
  amount: string;
  tradeType?: "exact_in" | "exact_out" | null;
  sender: Address;
  recipient: Address;
  path?: Address[] | null;
  feeTiers?: number[] | null;
  feeTier?: number | null;
  slippageBps?: number | null;
  allowLowConfidence?: boolean | null;
}

export interface SwapBuildToolArgs extends SwapQuoteToolArgs {
  deadlineSecondsFromNow?: number | null;
  dryRun?: boolean | null;
  feeOnTransferTokenIn?: boolean | null;
  feeOnTransferTokenOut?: boolean | null;
}

const engine = new SwapExecutionEngine();

function toRequest(args: SwapQuoteToolArgs | SwapBuildToolArgs): SwapExecutionRequest {
  return {
    chain: args.chain,
    routerAddress: (args.routerAddress ?? null) as Address,
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    amount: args.amount,
    tradeType: args.tradeType ?? "exact_in",
    sender: args.sender,
    recipient: args.recipient,
    path: args.path ?? null,
    feeTiers: args.feeTiers ?? null,
    feeTier: args.feeTier ?? null,
    slippageBps: args.slippageBps ?? null,
    allowLowConfidence: args.allowLowConfidence ?? false,
    quoterAddress: args.quoterAddress ?? null,
    abi: args.abi ?? null,
    deadlineSecondsFromNow:
      "deadlineSecondsFromNow" in args ? (args.deadlineSecondsFromNow ?? null) : null,
    dryRun: "dryRun" in args ? (args.dryRun ?? true) : true,
    feeOnTransferTokenIn:
      "feeOnTransferTokenIn" in args ? (args.feeOnTransferTokenIn ?? false) : false,
    feeOnTransferTokenOut:
      "feeOnTransferTokenOut" in args ? (args.feeOnTransferTokenOut ?? false) : false,
  };
}

export async function swapDetect(args: SwapDetectToolArgs): Promise<string> {
  try {
    let routerAddress = args.routerAddress ?? null;
    let quoterAddress = args.quoterAddress ?? null;

    // Resolve router by dexId if not provided directly
    if (!routerAddress && args.dexId) {
      const entry = findRouterRegistryEntryByDexId(args.chain, args.dexId);
      if (!entry) {
        return JSON.stringify({
          success: false,
          error: `No router found for dexId "${args.dexId}" on chain "${args.chain}". Known dexIds: quickswap, quickswap-v3, uniswap, uniswap-v3, quickswap-v2, sushiswap, 0x, zerox.`,
        } as ToolResponse);
      }
      routerAddress = entry.routerAddress;
      quoterAddress = quoterAddress ?? entry.quoterAddress ?? null;
    }

    if (!routerAddress) {
      return JSON.stringify({
        success: false,
        error: 'Either "routerAddress" or "dexId" is required. Provide one of these to proceed.',
      } as ToolResponse);
    }

    const result = await engine.detect({
      chain: args.chain,
      routerAddress,
      tokenIn: args.tokenIn ?? "0x0000000000000000000000000000000000000001",
      tokenOut: args.tokenOut ?? "0x0000000000000000000000000000000000000002",
      amount: args.amount ?? "1",
      tradeType: args.tradeType ?? "exact_in",
      sender: args.sender ?? "0x0000000000000000000000000000000000000003",
      recipient: args.recipient ?? "0x0000000000000000000000000000000000000003",
      quoterAddress: quoterAddress,
      abi: args.abi ?? null,
    });

    return JSON.stringify({
      success: true,
      data: result,
    } as ToolResponse);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Swap detection failed: ${error instanceof Error ? error.message : String(error)}`,
    } as ToolResponse);
  }
}

export async function swapQuote(args: SwapQuoteToolArgs): Promise<string> {
  try {
    // Resolve dexId to routerAddress if needed
    let routerAddress = args.routerAddress;
    if (!routerAddress && args.dexId) {
      const entry = findRouterRegistryEntryByDexId(args.chain, args.dexId);
      if (entry) {
        routerAddress = entry.routerAddress;
      }
    }

    const request = toRequest({ ...args, routerAddress } as SwapQuoteToolArgs);
    const result = await engine.quote(request);

    return JSON.stringify({
      success: true,
      data: result,
    } as ToolResponse);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Swap quote failed: ${error instanceof Error ? error.message : String(error)}`,
    } as ToolResponse);
  }
}

export async function swapBuild(args: SwapBuildToolArgs): Promise<string> {
  try {
    // Resolve dexId to routerAddress if needed
    let routerAddress = args.routerAddress;
    if (!routerAddress && args.dexId) {
      const entry = findRouterRegistryEntryByDexId(args.chain, args.dexId);
      if (entry) {
        routerAddress = entry.routerAddress;
      }
    }

    const request = toRequest({ ...args, routerAddress } as SwapBuildToolArgs);
    const result = await engine.build(request);

    return JSON.stringify({
      success: true,
      data: result,
    } as ToolResponse);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Swap build failed: ${error instanceof Error ? error.message : String(error)}`,
    } as ToolResponse);
  }
}
