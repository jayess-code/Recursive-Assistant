import { fetchAllTokenBalancesAlchemy } from "../../services/Alchemy/fetchAlchemyTokens";
import { formatUnits } from "viem";
import { ERC20_ABI } from "../const/ERC20_ABI";
import type { Address, ChainKey } from "../../clients/viem/viem-types";
import { readContract } from "../../tools/general/contracts/readContracts/readContract";

export interface WalletTokenBalance {
    name: string;
    symbol: string;
    decimals: number;
    contractAddress: Address;
    rawBalance: string;
    formattedBalance: string;
    
    
    priceUsd?: number | null;
    priceNative?: number | null;
    marketCap?: number | null;
    fdv?: number | null;
    pairAddress?: string;
    dexId?: string;
}

export interface FetchTokenBalancesArgs {
  walletAddress: Address;
  chain: ChainKey;
  apiKey?: string;
  includeZeroBalances?: boolean;
}

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseTokenBalance(rawBalance: string): bigint {
  try {
    return BigInt(rawBalance);
  } catch {
    return 0n;
  }
}

export async function fetchTokenBalances({
  walletAddress,
  chain,
  apiKey,
  includeZeroBalances = false,
}: FetchTokenBalancesArgs): Promise<WalletTokenBalance[]> {
  const response = await fetchAllTokenBalancesAlchemy({
    walletAddress,
    chain,
    ...(apiKey ? { apiKey } : {}),
  });

  const tokenBalances = response.result?.tokenBalances ?? [];

  const discovered = tokenBalances
    .map((token) => ({
      contractAddress: token.contractAddress,
      rawBalance: token.tokenBalance ?? "0",
      balanceBigInt: parseTokenBalance(token.tokenBalance ?? "0"),
    }))
    .filter((token): token is { contractAddress: Address; rawBalance: string; balanceBigInt: bigint } =>
      isAddress(token.contractAddress)
    )
    .filter((token) => includeZeroBalances || token.balanceBigInt > 0n);

  return Promise.all(
    discovered.map(async ({ contractAddress, balanceBigInt }) => {
      const [nameResult, symbolResult, decimalsResult] = await Promise.allSettled([
        readContract<string>({
          contract: contractAddress,
          abi: ERC20_ABI,
          functionName: "name",
          chain,
        }),
        readContract<string>({
          contract: contractAddress,
          abi: ERC20_ABI,
          functionName: "symbol",
          chain,
        }),
        readContract<number | bigint>({
          contract: contractAddress,
          abi: ERC20_ABI,
          functionName: "decimals",
          chain,
        }),
      ]);

      const name = nameResult.status === "fulfilled" ? nameResult.value : "Unknown";
      const symbol = symbolResult.status === "fulfilled" ? symbolResult.value : "UNKNOWN";
      const decimalsRaw = decimalsResult.status === "fulfilled" ? decimalsResult.value : 18;
      const decimals = Number(decimalsRaw);

      return {
        name,
        symbol,
        decimals: Number.isFinite(decimals) ? decimals : 18,
        contractAddress,
        rawBalance: balanceBigInt.toString(),
        formattedBalance: formatUnits(balanceBigInt, Number.isFinite(decimals) ? decimals : 18),  
      };
    })
  );
}
