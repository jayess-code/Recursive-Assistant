import { Address, formatEther } from "viem";
import { ChainKey } from "../../clients/viem/viem-types";
import { AssetMetadata, BalanceAmount } from "../../tools/types/balance-types";
import { getViemPublicClient } from "../../clients/viem/getViemPublicClient";

interface GetNativeCurrencyBalanceArgs {
    walletAddress: Address;
    chain: ChainKey;
}

interface NativeQuery {
    chain: ChainKey;
}

export interface GetNativeBalanceArgs {
    walletAddress: Address;
    queries: NativeQuery[];
}

export interface NativeCurrencyBalance extends BalanceAmount {
}

export interface NativeCurrencyMetadata extends AssetMetadata {}

export interface NativeBalanceSnapshot extends NativeCurrencyBalance, NativeCurrencyMetadata {}

export async function getNativeBalanceSnapshot({
    walletAddress,
    chain,
}: {
    walletAddress: Address;
    chain: ChainKey;
}): Promise<NativeCurrencyBalance> {
    const publicClient = getViemPublicClient(chain);
    const balance = await publicClient.getBalance({ address: walletAddress });

    return {
        rawBalance: balance.toString(),
        formattedBalance: formatEther(balance),
    };
}

export async function getNativeCurrencyMetadata(chain: ChainKey): Promise<NativeCurrencyMetadata> {
    const publicClient = getViemPublicClient(chain);
    const chainInfo = publicClient.chain;
    if (!chainInfo || !chainInfo.nativeCurrency) {
        throw new Error(`Chain ${chain} does not have native currency information available.`);
    }

    return {
        name: chainInfo.nativeCurrency.name,
        symbol: chainInfo.nativeCurrency.symbol,
        decimals: chainInfo.nativeCurrency.decimals,
    };
}

export async function fetchNativeBalanceByChain(args: GetNativeCurrencyBalanceArgs): Promise<NativeBalanceSnapshot> {
    const byChain = await fetchNativeBalances({
        walletAddress: args.walletAddress,
        queries: [{ chain: args.chain }],
    });

    return byChain[args.chain] ?? {
        rawBalance: "0",
        formattedBalance: "0",
        name: "",
        symbol: "",
        decimals: 0,
    };
}

export const fetchNativeBalance = fetchNativeBalanceByChain;

export async function fetchNativeBalances(args: GetNativeBalanceArgs): Promise<Record<string, NativeBalanceSnapshot>> {
    const results: Record<string, NativeBalanceSnapshot> = {};

    for (const { chain } of args.queries) {
        if (results[chain]) {
            continue;
        }

        try {
            const balanceSnapshot = await getNativeBalanceSnapshot({ walletAddress: args.walletAddress, chain });
            const metadata = await getNativeCurrencyMetadata(chain);
            results[chain] = {
                ...balanceSnapshot,
                ...metadata,
            };
        } catch (error) {
            console.error(`Error fetching native balance for ${args.walletAddress} on ${chain}:`, error);
            results[chain] = {
                rawBalance: "0",
                formattedBalance: "0",
                name: "",
                symbol: "",
                decimals: 0,
            };
        }
    }

    return results;
}