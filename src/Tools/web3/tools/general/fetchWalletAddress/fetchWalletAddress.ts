import { createViemWalletClient } from "../../../clients/viem/createViemWalletClient";
import { Address, ChainKey, PrivateKey } from "../../../clients/viem/viem-types";

type WalletAddressQuery = {
  chain: ChainKey;
}

export type GetWalletAddressArgs = {
  queries: WalletAddressQuery[];
  privateKey?: PrivateKey;
}

export type GetWalletAddressResult = {
  chain: ChainKey;
  address?: Address;
  error?: string;
};

export async function fetchWalletAddress(
 args:GetWalletAddressArgs
): Promise<Record<string, GetWalletAddressResult>> {
  const results: Record<string, GetWalletAddressResult> = {};

  for (const { chain } of args.queries) {
    try {
      const { account } = createViemWalletClient(chain, args.privateKey);
      const entry: GetWalletAddressResult = {
        chain,
        address: account.address,
      };

      results[chain] = entry;
    } catch (error) {
      results[chain] = {
        chain,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return results;
}
