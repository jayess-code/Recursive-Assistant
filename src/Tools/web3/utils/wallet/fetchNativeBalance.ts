import { formatEther } from "viem";
import { getViemPublicClient } from "../../clients/viem/getViemPublicClient";
import type { Address, ChainKey } from "../../clients/viem/viem-types";

export interface GetNativeBalanceArgs {
  walletAddress: Address;
  chains: ChainKey[];
}

export async function fetchNativeBalance({
  walletAddress,
  chains,
}: GetNativeBalanceArgs): Promise<Record<string, string>> {
  const balances: Record<string, string> = {};

  for (const chain of chains) {
    try {
      const publicClient = getViemPublicClient(chain);
      const balance = await publicClient.getBalance({ address: walletAddress });
      balances[chain] = formatEther(balance);
    } catch (error) {
      balances[chain] = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  return balances;
}
