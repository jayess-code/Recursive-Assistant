import { Address } from "viem";
import { AdapterQuoteSendParams } from "../resolver/types";
import { addressToBytes32 } from "../utils/address";
import { buildExecutorOptions } from "../resolver/preflight/ExecutionPreflightBuilder";

export type BuildOftAdapterQuoteParamsArgs = {
  dstEid: number;
  recipient: Address;
  amount: bigint;
  minAmountLD?: bigint;
  extraOptions?: `0x${string}`;
};

/**
 * Build quoteSend params for Adapter/Router surface
 * 
 * NOTE: Adapter routers only accept 5 canonical fields (no OFT-specific encoding)
 * The composeMsg and oftCmd fields are OFT-only and will cause "quoteSend reverted" if included
 */
export function buildOftAdapterQuoteParams({
  dstEid,
  recipient,
  amount,
  minAmountLD,
  extraOptions,
}: BuildOftAdapterQuoteParamsArgs): AdapterQuoteSendParams {
  return {
    dstEid,
    to: addressToBytes32(recipient),
    amountLD: amount,
    minAmountLD: minAmountLD ?? 0n,
    extraOptions:
      extraOptions ??
      buildExecutorOptions({
        dstEid,
        gasLimit: 200000n,
        msgType: 1,
      }),
    // INTENTIONALLY OMITTED: composeMsg, oftCmd
    // These are OFT-specific fields that the adapter router doesn't understand
  };
}
