import { Address } from "viem";
import { ChainKey } from "../../../../clients/viem/viem-types";
import { fetchNativeBalances, GetNativeBalanceArgs, NativeBalanceSnapshot } from "../../../../utils/balances/fetchNativeBalances";
import { fetchNFTBalances, GetNFTBalanceArgs } from "../../../../utils/balances/fetchNFTBalances";
import { fetchTokenBalances, GetTokenBalanceArgs, TokenInfo } from "../../../../utils/balances/fetchTokenBalances";
import { projectFields } from "../../../types/projectFields";

export type PortfolioBalanceEntry ={
  native: Record<string, NativeBalanceSnapshot>;
  tokens: Record<string, Record<string, TokenInfo>>;
  nfts: Record<string, Record<string, number[]>>;
}

interface GetPortfolioBalanceArgs {
  nativeBalanceArgs: GetNativeBalanceArgs;
  tokenBalanceArgs: GetTokenBalanceArgs;
  nftBalanceArgs: GetNFTBalanceArgs;
}

export type WalletBalanceQuery = {
  walletAddress: Address;
  chain: ChainKey;
  tokens?: Address[];
}

export interface GetWalletBalancesArgs {
  queries: WalletBalanceQuery[];
  fields?: Array<"chain" | "native" | "tokens" | "nfts"> | null;
  fetchOnly?: Array<"native" | "tokens" | "nfts"> | null;
}

export async function fetchWalletBalances(args: GetPortfolioBalanceArgs): Promise<PortfolioBalanceEntry> {
    const nativeBalance = await fetchNativeBalances(args.nativeBalanceArgs);
    const tokenBalances = await fetchTokenBalances(args.tokenBalanceArgs);
    const nftBalances = await fetchNFTBalances(args.nftBalanceArgs);

    return {
        native: nativeBalance,
        tokens: tokenBalances,
        nfts: nftBalances,
    };  

}

export async function getWalletBalances(args: GetWalletBalancesArgs) {
  try {
    const groupedByWallet = new Map<Address, WalletBalanceQuery[]>();
    for (const query of args.queries) {
      const existing = groupedByWallet.get(query.walletAddress) ?? [];
      existing.push(query);
      groupedByWallet.set(query.walletAddress, existing);
    }

    const shouldFetchNative = !args.fetchOnly || args.fetchOnly.includes("native");
    const shouldFetchTokens = !args.fetchOnly || args.fetchOnly.includes("tokens");
    const shouldFetchNfts = !args.fetchOnly || args.fetchOnly.includes("nfts");

    const walletEntries = await Promise.all(
      Array.from(groupedByWallet.entries()).map(async ([walletAddress, queries]) => {
        const [nativeBalances, tokenBalances, nftBalances] = await Promise.all([
          shouldFetchNative
            ? fetchNativeBalances({
                walletAddress,
                queries: queries.map(({ chain }) => ({ chain })),
              })
            : Promise.resolve({} as Record<string, NativeBalanceSnapshot>),
          shouldFetchTokens
            ? fetchTokenBalances({
                walletAddress,
                queries: queries.map(({ chain, tokens = [] }) => ({ chain, tokens })),
              })
            : Promise.resolve({} as Record<string, Record<string, TokenInfo>>),
          shouldFetchNfts
            ? fetchNFTBalances({
                walletAddress,
                queries: queries.map(({ chain }) => ({ chain, collections: [] })),
              })
            : Promise.resolve({} as Record<string, Record<string, number[]>>),
        ]);

        const portfolio = {
          native: nativeBalances,
          tokens: tokenBalances,
          nfts: nftBalances,
        };

        const chains = new Set<string>([
          ...Object.keys(portfolio.native),
          ...Object.keys(portfolio.tokens),
          ...Object.keys(portfolio.nfts),
        ]);

        const chainResults: Record<string, unknown> = {};
        for (const chain of chains) {
          const entry: Record<string, unknown> = {
            chain,
            native: portfolio.native[chain],
            tokens: portfolio.tokens[chain] ?? {},
            nfts: portfolio.nfts[chain] ?? {},
          };

          chainResults[chain] = !args.fields?.length
            ? entry
            : projectFields(entry, args.fields);
        }

        return [walletAddress, chainResults] as const;
      })
    );

    const byWallet = Object.fromEntries(walletEntries);
    if (walletEntries.length === 1) {
      const entry = walletEntries[0];
      if (!entry) {
        return {
          success: false,
          error: "Unexpected empty wallet entries result.",
        };
      }

      return {
        success: true,
        data: JSON.stringify(entry[1]),
      };
    }

    return {
      success: true,
      data: JSON.stringify(byWallet),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get wallet balances: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}