import { Address } from "viem";

export function addressToBytes32(address: Address): `0x${string}` {
  return `0x${address.toLowerCase().replace("0x", "").padStart(64, "0")}`;
}
