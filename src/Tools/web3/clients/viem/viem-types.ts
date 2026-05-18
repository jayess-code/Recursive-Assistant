import type { Chain } from "viem";



// Wallet address (40 hex chars)
export type Address = `0x${string}`;

// Private key (64 hex chars)
export type PrivateKey = `0x${string}`;

// Keep this open-ended unless you define a concrete chain map in another module.
export type ChainKey = string;

export type ViemChain = Chain;



export interface ChainInfoRead {
  key: ChainKey;
  name: string;
  id?: number;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  rpcUrls?: { default: { http: string[] } };
  testnet?: boolean;
}

export interface ChainInfoRuntime {
  key: ChainKey;
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { default: { http: string[] } };
  testnet: boolean;
}
