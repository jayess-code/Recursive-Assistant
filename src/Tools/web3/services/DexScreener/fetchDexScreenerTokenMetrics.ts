import type { Address, ChainKey } from "../../clients/viem/viem-types";
import {
  fetchDexPairsByTokenAddress,
  normalizeDexChain,
  parseDexNullableNumber,
} from "./dexScreenerClient";

export type DexScreenerTokenMetrics = {
  priceUsd?: number | null;
  priceNative?: number | null;
  marketCap?: number | null;
  fdv?: number | null;
  pairAddress?: string;
  dexId?: string;
}

export async function fetchDexScreenerTokenMetrics({
  chain,
  contractAddress,
}: {
  chain: ChainKey;
  contractAddress: Address;
}): Promise<DexScreenerTokenMetrics> {
  const normalizedChain = normalizeDexChain(chain) ?? "";
  const pairs = await fetchDexPairsByTokenAddress(contractAddress);
  const pair = pairs.find((entry) => String(entry.chainId ?? "").toLowerCase() === normalizedChain);

  if (!pair) {
    return {};
  }

  return {
    priceUsd: parseDexNullableNumber(pair.priceUsd),
    priceNative: parseDexNullableNumber(pair.priceNative),
    marketCap: parseDexNullableNumber(pair.marketCap),
    fdv: parseDexNullableNumber(pair.fdv),
    ...(pair.pairAddress ? { pairAddress: pair.pairAddress } : {}),
    ...(pair.dexId ? { dexId: pair.dexId } : {}),
  };
}


