import { Address, formatUnits } from "viem";
import { ChainKey } from "../../clients/viem/viem-types";
import { AssetMetadata, BalanceAmount } from "../../tools/types/balance-types";
import { readContract } from "../../tools/general/contracts/readContracts/readContract";
import { getViemPublicClient } from "../../clients/viem/getViemPublicClient";
import { ERC20_ABI } from "../const/ERC20_ABI";


interface TokenQuery {
  chain: ChainKey;
  tokens?: Address[];
}

export interface GetTokenBalanceArgs {
  walletAddress: Address;
  queries: TokenQuery[];
}

export interface TokenInfo extends AssetMetadata, BalanceAmount {}

export function deduplicateAddresses(addresses: string[]): Address[] {
    return Array.from(new Set(addresses.map(a => a.toLowerCase()))) as Address[];
}

export function getMulticallValue<T>(result: unknown): T | undefined {
    if (!result || typeof result !== "object") {
        return undefined;
    }

    const status = (result as { status?: string }).status;
    if (status && status !== "success") {
        return undefined;
    }

    if ("result" in (result as Record<string, unknown>)) {
        return (result as { result?: T }).result;
    }

    return result as T;
}

async function readTokenSnapshot({
    chain,
    walletAddress,
    tokenAddress,
    multicallResult,
}: {
    chain: ChainKey;
    walletAddress: Address;
    tokenAddress: Address;
    multicallResult?: unknown[];
}): Promise<TokenInfo> {
    let decimals = getMulticallValue<number | bigint>(multicallResult?.[0]);
    let symbol = getMulticallValue<string>(multicallResult?.[1]);
    let name = getMulticallValue<string>(multicallResult?.[2]);
    let balance = getMulticallValue<bigint>(multicallResult?.[3]);

    if (decimals === undefined || symbol === undefined || name === undefined || balance === undefined) {
        const [decimalsResult, symbolResult, nameResult, balanceResult] = await Promise.allSettled([
            readContract<number | bigint>({ contract: tokenAddress, abi: ERC20_ABI, functionName: "decimals", chain }),
            readContract<string>({ contract: tokenAddress, abi: ERC20_ABI, functionName: "symbol", chain }),
            readContract<string>({ contract: tokenAddress, abi: ERC20_ABI, functionName: "name", chain }),
            readContract<bigint>({ contract: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress], chain }),
        ]);

        decimals = decimals ?? (decimalsResult.status === "fulfilled" ? decimalsResult.value : 0);
        symbol = symbol ?? (symbolResult.status === "fulfilled" ? symbolResult.value : "Unknown");
        name = name ?? (nameResult.status === "fulfilled" ? nameResult.value : "Unknown");
        balance = balance ?? (balanceResult.status === "fulfilled" ? balanceResult.value : 0n);
    }

    const numericDecimals = Number(decimals ?? 0);
    const resolvedBalance = balance ?? 0n;

    return {
        name: name ?? "Unknown",
        symbol: symbol ?? "Unknown",
        decimals: numericDecimals,
        rawBalance: resolvedBalance.toString(),
        formattedBalance: formatUnits(resolvedBalance, numericDecimals),
    };
}

/**
 * Fetch ERC20 token balances for a wallet using multicall where possible,
 * falling back to individual RPC calls per token.
 * Returns: { chain: { "0xToken": TokenInfo, ... }, ... }
 */
export async function fetchTokenBalances(args: GetTokenBalanceArgs): Promise<Record<string, Record<string, TokenInfo>>> {
    const results: Record<string, Record<string, TokenInfo>> = {};

    for (const { chain, tokens = [] } of args.queries) {
        if (tokens.length === 0) {
            results[chain] = {};
            continue;
        }

        const publicClient = getViemPublicClient(chain);
        const calls = tokens.flatMap((tokenAddress) => [
            { address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" },
            { address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" },
            { address: tokenAddress, abi: ERC20_ABI, functionName: "name" },
            { address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [args.walletAddress] },
        ]);

        let multicallResult: readonly unknown[] = [];
        try {
            multicallResult = await publicClient.multicall({ contracts: calls as any });
        } catch {
            // fall through — readTokenSnapshot will fetch individually
        }

        const chainBalances: Record<string, TokenInfo> = {};
        for (let i = 0; i < tokens.length; i++) {
            const tokenAddress = tokens[i];
            if (!tokenAddress) {
                continue;
            }
            const base = i * 4;
            try {
                chainBalances[tokenAddress] = await readTokenSnapshot({
                    chain,
                    walletAddress: args.walletAddress,
                    tokenAddress,
                    multicallResult: multicallResult.slice(base, base + 4),
                });
            } catch {
                chainBalances[tokenAddress] = { name: "Unknown", symbol: "Unknown", decimals: 0, rawBalance: "0", formattedBalance: "0" };
            }
        }

        results[chain] = chainBalances;
    }

    return results;
}