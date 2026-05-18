import { Address, PublicClient } from "viem";
import {
  V2ExecutionValidationStatus,
  V2QuoteFailureClassification,
  V2QuoteSendParams,
} from "../types";
import { classifyQuoteFailure, isCapabilityDeniedQuoteFailure } from "./classifyQuoteFailure";

const STARGATE_V2_QUOTE_OFT_ABI = [
  {
    name: "quoteOFT",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "_sendParam",
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
    ],
    outputs: [
      {
        name: "limit",
        type: "tuple",
        components: [
          { name: "minAmountLD", type: "uint256" },
          { name: "maxAmountLD", type: "uint256" },
        ],
      },
      {
        name: "oftFeeDetails",
        type: "tuple[]",
        components: [
          { name: "feeAmountLD", type: "int256" },
          { name: "description", type: "string" },
        ],
      },
      {
        name: "receipt",
        type: "tuple",
        components: [
          { name: "amountSentLD", type: "uint256" },
          { name: "amountReceivedLD", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export type OftCapabilityCheckResult =
  | {
      supported: true;
      amountSentLD: bigint;
      amountReceivedLD: bigint;
    }
  | {
      supported: false;
      executionValid: V2ExecutionValidationStatus;
      classification: V2QuoteFailureClassification;
      reason?: string;
    };

export async function oftCapabilityCheck(
  client: PublicClient,
  target: Address,
  params: V2QuoteSendParams
): Promise<OftCapabilityCheckResult> {
  try {
    const result = await client.readContract({
      address: target,
      abi: STARGATE_V2_QUOTE_OFT_ABI,
      functionName: "quoteOFT",
      args: [params],
    });

    const receipt = Array.isArray(result)
      ? (result[2] as { amountSentLD?: bigint; amountReceivedLD?: bigint } | undefined)
      : ((result as { receipt?: { amountSentLD?: bigint; amountReceivedLD?: bigint } }).receipt ?? undefined);

    if (receipt?.amountReceivedLD == null) {
      return {
        supported: false,
        executionValid: "unknown",
        classification: "param_invalid",
        reason: "OFT capability check returned no receive quote.",
      };
    }

    return {
      supported: true,
      amountSentLD: BigInt(receipt.amountSentLD ?? params.amountLD),
      amountReceivedLD: BigInt(receipt.amountReceivedLD),
    };
  } catch (error) {
    const failure = classifyQuoteFailure(error);
    const classification =
      failure.classification === "missing_function"
        ? "missing_function"
        : isCapabilityDeniedQuoteFailure(failure) ||
            failure.classification === "reverted" ||
            failure.classification === "oft_like" ||
            failure.classification === "param_invalid"
          ? "capability_denied"
          : failure.classification;

    return {
      supported: false,
      executionValid: classification === "capability_denied" ? "unknown" : failure.status,
      classification,
      ...(failure.reason != null ? { reason: failure.reason } : {}),
    };
  }
}
