import type { Address, ChainKey } from "../clients/viem/viem-types";

export interface NativeTokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  balance?: string;
  logoURI?: string;
  wrappedTokenAddress?: Address; // WETH/WMATIC/etc.
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  address: Address;
  logoURI?: string;
  isNative?: false;
}

export interface ChainTokenInfo {
  chainKey: ChainKey;
  chainId: number;
  nativeToken: NativeTokenInfo;
  supportedTokens: TokenInfo[];
}