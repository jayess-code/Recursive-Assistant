import { Address, PublicClient, getAddress } from "viem";
import { resolveChainKey } from "../../../clients/viem/viemChains";
import { getViemPublicClient } from "../../../clients/viem/getViemPublicClient";
import { ERC20_ABI } from "../../../utils/const/ERC20_ABI";

export interface TokenDisplayMetadata {
  address: Address;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}

async function readStringMetadata(
  client: PublicClient,
  address: Address,
  functionName: "name" | "symbol"
): Promise<string | null> {
  try {
    const value = await client.readContract({
      address,
      abi: ERC20_ABI,
      functionName,
    });

    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

async function readDecimals(client: PublicClient, address: Address): Promise<number | null> {
  try {
    const value = await client.readContract({
      address,
      abi: ERC20_ABI,
      functionName: "decimals",
    });

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchTokenDisplayMetadata(args: {
  chain: string;
  address: Address;
}): Promise<TokenDisplayMetadata> {
  const normalizedAddress = getAddress(args.address);
  const client = getViemPublicClient(resolveChainKey(args.chain as never));

  const [name, symbol, decimals] = await Promise.all([
    readStringMetadata(client, normalizedAddress, "name"),
    readStringMetadata(client, normalizedAddress, "symbol"),
    readDecimals(client, normalizedAddress),
  ]);

  return {
    address: normalizedAddress,
    name,
    symbol,
    decimals,
  };
}
