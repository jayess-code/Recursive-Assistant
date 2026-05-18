import { Address } from "viem";
import { ChainKey } from "../../clients/viem/viem-types";
import { readContract } from "../../tools/general/contracts/readContracts/readContract";
import { viemChains } from "../../clients/viem/viemChains";

interface NFTQuery {
  chain: ChainKey;
  collections?: Address[];
}

export interface GetNFTBalanceArgs {
  walletAddress: Address;
  queries: NFTQuery[];
}

 
/**
 * Fetch NFTs for a wallet.
 * Returns an object like:
 * { ethereum: { "0xCollection": [1,2,3], ... }, polygon: { ... } }
 */
export async function fetchNFTBalances(args: GetNFTBalanceArgs) {
  const results: Record<string, Record<string, number[]>> = {};

  for (const { chain, collections = [] } of args.queries) {
    const chainInfo = viemChains[chain];
    if (!chainInfo) continue;

    results[chain] = {};

    for (const collection of collections) {
      try {
        // Minimal ERC721 balanceOf ABI
        const ERC721_BALANCEOF_ABI = [
          {
            inputs: [{ internalType: "address", name: "owner", type: "address" }],
            name: "balanceOf",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const;

        const balance = await readContract<bigint>({
          contract: collection,
          abi: ERC721_BALANCEOF_ABI,
          functionName: "balanceOf",
          args: [args.walletAddress],
          chain,
        });

        results[chain][collection] = Array.from({ length: Number(balance) }, (_, i) => i + 1);
      } catch (err) {
        results[chain][collection] = [];
      }
    }
  }

  return results;
}
