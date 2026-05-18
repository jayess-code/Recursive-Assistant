import { concatHex, toHex } from "viem";

export function buildExecutorOptions(args?: {
  gasLimit?: bigint;
  dstEid?: number;
  msgType?: number;
}): `0x${string}` {
  const gasLimit = args?.gasLimit ?? 200000n;
  return concatHex(["0x0003", "0x01001101", toHex(gasLimit, { size: 16 })]);
}

export function ensureHex(value?: `0x${string}` | string | null): `0x${string}` {
  if (!value || value === "0x") {
    return "0x";
  }

  return (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
}

export function buildStargateTaxiExtraOptions(gasLimit: bigint = 200000n): `0x${string}` {
  return buildExecutorOptions({ gasLimit, msgType: 1 });
}
