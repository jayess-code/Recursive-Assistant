import { ChainKey } from "../../clients/viem/viem-types";
import { getAlchemyNftUrl, getAlchemyRpcUrl } from "./alchemyChainResolver";

// Get all ERC20 token balances for a wallet using Alchemy
export async function fetchAllTokenBalancesAlchemy({
  walletAddress,
  chain,
  apiKey = process.env.ALCHEMY_API_KEY || "",
}: {
  walletAddress: string;
  chain: ChainKey;
  apiKey: string;
}): Promise<any> {
  const url = getAlchemyRpcUrl(chain, apiKey);
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getTokenBalances",
    params: [walletAddress],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Alchemy token balances error: ${await res.text()}`);
  return await res.json();
}

// Get all NFTs for a wallet using Alchemy
export async function fetchAllNFTsAlchemy({
  walletAddress,
  chain,
  apiKey,
}: {
  walletAddress: string;
  chain: ChainKey;
  apiKey: string;
}): Promise<any> {
  const url = getAlchemyNftUrl(chain, apiKey, walletAddress);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alchemy NFT error: ${await res.text()}`);
  return await res.json();
}