import { Address } from "viem";
import { V2QuoteSendParams } from "../resolver/types";
import { addressToBytes32 } from "../utils/address";
import { buildExecutorOptions } from "../utils/encoding";

export type BuildOftQuoteParamsArgs = {
  dstEid: number;
  recipient: Address;
  amount: bigint;
  transportMode?: "taxi" | "bus";
  minAmountLD?: bigint;
  quotedAmountReceivedLD?: bigint;
  composeMsg?: `0x${string}`;
  extraOptions?: `0x${string}`;
};

export function buildOftQuoteParams(args: BuildOftQuoteParamsArgs): V2QuoteSendParams {
  const transportMode = args.transportMode ?? "taxi";

  return {
    dstEid: args.dstEid,
    to: addressToBytes32(args.recipient),
    amountLD: args.amount,
    minAmountLD: args.minAmountLD ?? args.quotedAmountReceivedLD ?? 0n,
    extraOptions:
      args.extraOptions ??
      buildExecutorOptions({
        dstEid: args.dstEid,
        gasLimit: 200000n,
        msgType: 1,
      }),
    composeMsg: args.composeMsg ?? "0x",
    oftCmd: transportMode === "bus" ? "0x00" : "0x",
  };
}

export function buildOftQuoteParamVariants(args: BuildOftQuoteParamsArgs): V2QuoteSendParams[] {
  return [
    buildOftQuoteParams({ ...args, transportMode: "taxi" }),
    buildOftQuoteParams({ ...args, transportMode: "bus" }),
  ];
}
