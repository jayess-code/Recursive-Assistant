import { Address } from "viem";
import { ChainKey } from "../../../../clients/viem/viem-types";
import { fetchNativeBalances, NativeBalanceSnapshot } from "../../../../utils/balances/fetchNativeBalances";
import { fetchNFTBalances } from "../../../../utils/balances/fetchNFTBalances";
import { fetchTokenBalances, TokenInfo } from "../../../../utils/balances/fetchTokenBalances";
import { fetchDexScreenerTokenMetrics, DexScreenerTokenMetrics } from "../../../../services/DexScreener/fetchDexScreenerTokenMetrics";
import { fetchAllTokenBalancesAlchemy } from "../../../../services/Alchemy/fetchAlchemyTokens";
import { projectFields } from "../../../types/projectFields";

export type EnrichedTokenInfo = TokenInfo & DexScreenerTokenMetrics & { contractAddress: Address };

export type EnrichedPortfolioChainResult = {
    chain: string;
    native: NativeBalanceSnapshot;
    tokens: Record<string, EnrichedTokenInfo | TokenInfo>;
    nfts: Record<string, number[]>;
};

export type PortfolioQuery = {
    walletAddress: Address;
    chain: ChainKey;
    tokens?: Address[];
};

export interface GetPortfolioBalancesArgs {
    queries: PortfolioQuery[];
    fields?: Array<"chain" | "native" | "tokens" | "nfts"> | null;
    includeDexPrices?: boolean | null;
}

export async function getEnrichedPortfolioBalances(args: GetPortfolioBalancesArgs): Promise<Record<string, unknown>> {
    try {
        const { queries, fields, includeDexPrices = true } = args;

        const groupedByWallet = new Map<Address, PortfolioQuery[]>();
        for (const query of queries) {
            const existing = groupedByWallet.get(query.walletAddress) ?? [];
            existing.push(query);
            groupedByWallet.set(query.walletAddress, existing);
        }

        const walletEntries = await Promise.all(
            Array.from(groupedByWallet.entries()).map(async ([walletAddress, walletQueries]) => {
                const resolvedQueries = await Promise.all(
                    walletQueries.map(async ({ chain, tokens = [] }) => {
                        if (tokens.length > 0) return { chain, tokens };
                            const response = await fetchAllTokenBalancesAlchemy({ walletAddress, chain });
                            const discovered = (response.result?.tokenBalances ?? [])
                                .filter((t) => !t.error && t.tokenBalance !== "0x0000000000000000000000000000000000000000000000000000000000000000")
                                .map((t) => t.contractAddress as Address);
                            return { chain, tokens: discovered };
                    
                    })
                );

                const [nativeBalances, tokenBalances, nftBalances] = await Promise.all([
                    fetchNativeBalances({
                        walletAddress,
                        queries: walletQueries.map(({ chain }) => ({ chain })),
                    }),
                    fetchTokenBalances({
                        walletAddress,
                        queries: resolvedQueries,
                    }),
                    fetchNFTBalances({
                        walletAddress,
                        queries: walletQueries.map(({ chain }) => ({ chain, collections: [] })),
                    }),
                ]);

                const chains = new Set<string>([
                    ...Object.keys(nativeBalances),
                    ...Object.keys(tokenBalances),
                    ...Object.keys(nftBalances),
                ]);

                const chainResults: Record<string, unknown> = {};

                for (const chain of chains) {
                    let tokens: Record<string, EnrichedTokenInfo | TokenInfo> = tokenBalances[chain] ?? {};

                    if (includeDexPrices && Object.keys(tokens).length > 0) {
                        const enriched: Record<string, EnrichedTokenInfo | TokenInfo> = {};
                        await Promise.all(
                            Object.entries(tokens).map(async ([address, token]) => {
                                try {
                                    const metrics = await fetchDexScreenerTokenMetrics({
                                        chain: chain as ChainKey,
                                        contractAddress: address as Address,
                                    });
                                    enriched[address] = { ...token, contractAddress: address as Address, ...metrics };
                                } catch {
                                    enriched[address] = { ...token, contractAddress: address as Address };
                                }
                            })
                        );
                        tokens = enriched;
                    }

                    const entry: Record<string, unknown> = {
                        chain,
                        native: nativeBalances[chain],
                        tokens,
                        nfts: nftBalances[chain] ?? {},
                    };

                    chainResults[chain] = !fields?.length
                        ? entry
                        : projectFields(entry, fields);
                }

                return [walletAddress, chainResults] as const;
            })
        );

        if (walletEntries.length === 1) {
            const entry = walletEntries[0];
            if (!entry) {
                return {
                    success: false,
                    error: "Unexpected empty wallet entries result.",
                } as Record<string, unknown>;
            }

            return {
                success: true,
                data: JSON.stringify(entry[1]),
            } as Record<string, unknown>;
        }

        return {
            success: true,
            data: JSON.stringify(Object.fromEntries(walletEntries)),
        } as Record<string, unknown>;
    } catch (error) {
        return {
            success: false,
            error: `Failed to get enriched portfolio balances: ${error instanceof Error ? error.message : String(error)}`,
        } as Record<string, unknown>;
    }
}