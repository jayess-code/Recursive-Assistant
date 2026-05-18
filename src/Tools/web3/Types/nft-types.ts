import type { Address, ChainKey } from "../clients/viem/viem-types";

export type NftStandard = "ERC721" | "ERC1155";
export type TokenId = string; // keep as string to avoid bigint/json issues

export interface NftContractRef {
  chainKey: ChainKey;
  chainId: number;
  contractAddress: Address;
  standard: NftStandard;
  name?: string;
  symbol?: string;
}

export interface NftMetadata {
  tokenUri?: string;
  image?: string;
  animationUrl?: string;
  externalUrl?: string;
  name?: string;
  description?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number | boolean;
    display_type?: string;
  }>;
  raw?: unknown; // original unparsed metadata payload
}

export interface NftOwnership {
  owner: Address;
  quantity: string; // "1" for ERC721, >=1 for ERC1155
}

export interface NftToken {
  chainKey: ChainKey;
  chainId: number;
  contractAddress: Address;
  standard: NftStandard;
  tokenId: TokenId;
  metadata?: NftMetadata;
  ownership?: NftOwnership;
  updatedAt?: string; // ISO datetime
}

export interface WalletNftBalanceItem {
  contractAddress: Address;
  tokenId: TokenId;
  standard: NftStandard;
  quantity: string;
}

export interface WalletNftPortfolio {
  walletAddress: Address;
  chainKey: ChainKey;
  chainId: number;
  items: WalletNftBalanceItem[];
}