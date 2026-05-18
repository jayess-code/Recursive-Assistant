import type { Address, ChainKey } from "../../clients/viem/viem-types";
import { createAlchemyClient, resolveAlchemyNetwork } from "./const";

export interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
  error?: string;
}

export interface AlchemyTokenBalancesResponse {
  jsonrpc: string;
  id: number;
  result?: {
    address: Address | string;
    tokenBalances: AlchemyTokenBalance[];
  };
  error?: {
    code: number;
    message: string;
  };
}

// Get all ERC20 token balances for a wallet using Alchemy
export async function fetchAllTokenBalancesAlchemy({
    walletAddress,
    chain,
    apiKey = process.env.ALCHEMY_API_KEY || "",
}: {
    walletAddress: Address;
    chain: ChainKey;
    apiKey?: string;
}): Promise<AlchemyTokenBalancesResponse> {
    const resolution = resolveAlchemyNetwork(chain);
    if (!resolution.supported) {
      return {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32602,
          message: `${resolution.message}. Supported keys: ${resolution.supportedKeys.join(", ")}`,
        },
      };
    }

    const alchemy = createAlchemyClient(chain, apiKey);
    const result = await alchemy.core.getTokenBalances(walletAddress);

    return {
      jsonrpc: "2.0",
      id: 1,
      result: {
        address: result.address,
        tokenBalances: result.tokenBalances.map((token) => ({
          contractAddress: token.contractAddress,
          tokenBalance: token.tokenBalance ?? "0x0",
          ...(token.error ? { error: token.error } : {}),
        })),
      },
    };
}