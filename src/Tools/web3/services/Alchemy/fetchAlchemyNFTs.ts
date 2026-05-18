import type { Address, ChainKey } from "../../clients/viem/viem-types";
import { createAlchemyClient, resolveAlchemyNetwork } from "./const";

export interface AlchemyOwnedNft {
  contract?: { address?: string };
  tokenId?: string;
  balance?: string;
  tokenType?: string;
  title?: string;
  description?: string;
  metadata?: unknown;
  media?: Array<{ gateway?: string; raw?: string }>;
}

export interface AlchemyNftsResponse {
  ownedNfts?: AlchemyOwnedNft[];
  pageKey?: string;
  totalCount?: number;
  error?: {
    code: number;
    message: string;
  };
}

// Get all NFTs for a wallet using Alchemy
export async function fetchAllNFTsAlchemy({
    walletAddress,
    chain,
    apiKey = process.env.ALCHEMY_API_KEY || "",
}: {
    walletAddress: Address;
    chain: ChainKey;
    apiKey?: string;
}): Promise<AlchemyNftsResponse> {
    const resolution = resolveAlchemyNetwork(chain);
    if (!resolution.supported) {
      return {
        error: {
          code: -32602,
          message: `${resolution.message}. Supported keys: ${resolution.supportedKeys.join(", ")}`,
        },
      };
    }

    const alchemy = createAlchemyClient(chain, apiKey);
    const response = await alchemy.nft.getNftsForOwner(walletAddress);

    return {
      ownedNfts: response.ownedNfts.map((nft) => ({
        contract: { address: nft.contract?.address },
        tokenId: nft.tokenId,
        balance: nft.balance,
        tokenType: nft.tokenType,
      })),
      ...(response.pageKey ? { pageKey: response.pageKey } : {}),
      totalCount: response.totalCount,
    };
}