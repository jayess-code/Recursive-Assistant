import { Address } from "viem";
import { buildExecutorOptions } from "../resolver/preflight/ExecutionPreflightBuilder";
import { V2QuoteSendParams } from "../resolver/types";

const HUB_COMPOSER_ADDRESS = "0x000000000000000000000000000000000000000001";

function encodeSecondHop(args: { finalDstEid: number; recipient: Address }): `0x${string}` {
  return (
    "0x" +
    args.finalDstEid.toString(16).padStart(64, "0") +
    args.recipient.slice(2).padStart(64, "0")
  ) as `0x${string}`;
}

export function buildAsset0QuoteParams({
  hubEid,
  finalDstEid,
  recipient,
  amount,
}: {
  hubEid: number;
  finalDstEid: number;
  recipient: Address;
  amount: bigint;
}): V2QuoteSendParams {
  return {
    dstEid: hubEid,
    to: HUB_COMPOSER_ADDRESS,
    amountLD: amount,
    minAmountLD: 0n,
    extraOptions: buildExecutorOptions({
      dstEid: hubEid,
      gasLimit: 300000n,
      msgType: 1,
    }),
    composeMsg: encodeSecondHop({
      finalDstEid,
      recipient,
    }),
    oftCmd: "0x",
  };
}