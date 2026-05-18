import * as chains from "viem/chains";
import { CHAIN_ALIASES } from "../../utils/const/ALIAS";
import { ChainKey, ViemChain } from "./viem-types";

export function resolveChainKey(chainKey: ChainKey): ChainKey {
  const normalized = String(chainKey || "").trim();
  const lower = normalized.toLowerCase();
  return (CHAIN_ALIASES[lower] ?? normalized);
}


export const chainData = Object.entries(chains)
  .filter(([_, chainObj]) => chainObj?.id) // optional: only include valid chains with `id`
  .map(([key, chain]) => ({ key, chain: chain as ViemChain }));

export const viemChains: Record<ChainKey, ViemChain> = Object.fromEntries(
  chainData.map(({ key, chain }) => [key, chain])
) as Record<ChainKey, ViemChain>;