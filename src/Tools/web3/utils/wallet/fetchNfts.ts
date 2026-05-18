import { fetchAllNFTsAlchemy } from "../../services/Alchemy/fetchAlchemyNFTs";
import { resolveChainKey, viemChains } from "../../clients/viem/viemChains";
import type { NftStandard, WalletNftPortfolio } from "../../Types/nft-types";
import type { Address, ChainKey } from "../../clients/viem/viem-types";

export interface FetchNftsArgs {
  walletAddress: Address;
  chain: ChainKey;
  apiKey?: string;
}

function parseNftStandard(tokenType?: string): NftStandard {
  const normalized = String(tokenType ?? "").toUpperCase();
  return normalized.includes("1155") ? "ERC1155" : "ERC721";
}

function isAddress(value: string | undefined): value is Address {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

export async function fetchNfts({
  walletAddress,
  chain,
  apiKey,
}: FetchNftsArgs): Promise<WalletNftPortfolio> {
  const resolvedChain = resolveChainKey(chain);
  const chainConfig = viemChains[resolvedChain];
  const response = await fetchAllNFTsAlchemy({
    walletAddress,
    chain,
    ...(apiKey ? { apiKey } : {}),
  });

  return {
    walletAddress,
    chainKey: chain,
    chainId: chainConfig?.id ?? 0,
    items: (response.ownedNfts ?? [])
      .map((nft) => {
        const contractAddress = nft.contract?.address;
        if (!isAddress(contractAddress) || !nft.tokenId) {
          return null;
        }

        return {
          contractAddress,
          tokenId: nft.tokenId,
          standard: parseNftStandard(nft.tokenType),
          quantity: nft.balance ?? "1",
        };
      })
      .filter((item): item is WalletNftPortfolio["items"][number] => Boolean(item)),
  };
}
