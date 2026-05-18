import { Address, PublicClient } from "viem";
import { V2QuoteSendParams, AdapterQuoteSendParams, V2QuoteValidationResult } from "../types";
import { classifyQuoteFailure } from "./classifyQuoteFailure";

const OFT_QUOTE_ABI = [
  {
    name: "quoteSend",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
      },
      { name: "payInLzToken", type: "bool" },
    ],
    outputs: [
      { name: "nativeFee", type: "uint256" },
      { name: "lzTokenFee", type: "uint256" },
    ],
  },
] as const;

const ADAPTER_QUOTE_ABI = [
  {
    name: "quoteSend",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
        ],
      },
      { name: "payInLzToken", type: "bool" },
    ],
    outputs: [
      { name: "nativeFee", type: "uint256" },
      { name: "lzTokenFee", type: "uint256" },
    ],
  },
] as const;

function extractNativeFee(feeResult: unknown): bigint {
  if (Array.isArray(feeResult)) {
    const first = feeResult[0];
    if (typeof first === "bigint") {
      return first;
    }

    if (first && typeof first === "object") {
      const nested = (first as { nativeFee?: unknown }).nativeFee;
      if (typeof nested === "bigint") {
        return nested;
      }
    }

    return 0n;
  }

  if (feeResult && typeof feeResult === "object") {
    const direct = (feeResult as { nativeFee?: unknown }).nativeFee;
    if (typeof direct === "bigint") {
      return direct;
    }

    const nestedFee = (feeResult as { fee?: { nativeFee?: unknown } }).fee?.nativeFee;
    if (typeof nestedFee === "bigint") {
      return nestedFee;
    }
  }

  return 0n;
}

function isAdapterParams(params: any): params is AdapterQuoteSendParams {
  return params && typeof params === "object" && 
         "dstEid" in params && 
         "to" in params && 
         "amountLD" in params && 
         "minAmountLD" in params && 
         "extraOptions" in params &&
         !("composeMsg" in params) &&
         !("oftCmd" in params);
}

export async function validateQuoteSend(
  client: PublicClient,
  target: Address,
  params: V2QuoteSendParams | AdapterQuoteSendParams
): Promise<V2QuoteValidationResult> {
  try {
    // Detect which ABI to use based on param structure
    const isAdapter = isAdapterParams(params);
    const abi = isAdapter ? ADAPTER_QUOTE_ABI : OFT_QUOTE_ABI;

    const feeResult = await client.readContract({
      address: target,
      abi,
      functionName: "quoteSend",
      args: [params as any, false],
    });

    const nativeFee = extractNativeFee(feeResult);

    return {
      status: true,
      nativeFee,
      classification: "quote_ok",
      isOftLike: false,
    };
  } catch (error) {
    const failure = classifyQuoteFailure(error);

    return {
      ...failure,
      nativeFee: 0n,
    };
  }
}
