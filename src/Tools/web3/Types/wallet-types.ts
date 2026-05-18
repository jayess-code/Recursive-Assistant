import type { Address, ChainKey } from "../clients/viem/viem-types";

export type WalletSource = "embedded" | "injected" | "hardware" | "server";

export interface WalletInfo {
  name: string;
  icon?: string;
  description?: string;
  address: Address;
  source: WalletSource;
  isActive?: boolean;
}

export interface WalletChainAccount {
  chainKey: ChainKey;
  chainId: number;
  address: Address;
  label?: string;
}

export interface WalletBalanceSnapshot {
  chainKey: ChainKey;
  chainId: number;
  address: Address;
  nativeBalance: string;
  nativeSymbol: string;
  blockNumber?: bigint;
  updatedAt: string; // ISO datetime
}

export interface WalletKeyMaterial {
  // Store references to secrets, not raw private keys.
  keyId: string;
  encrypted: boolean;
  kmsProvider?: string;
}