import { Address, ChainKey } from "../../../clients/viem/viem-types";
import { getAddress } from "viem";

export interface CanonicalBridgeTokenIdentity {
  canonicalId: string;
  canonicalSource: "registry" | "fingerprint" | "address";
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}

interface CanonicalTokenDefinition {
  canonicalId: string;
  symbol: string;
  name: string;
  decimals: number;
  aliases?: string[];
  addresses: Partial<Record<ChainKey, Address>>;
}

const TOKEN_DEFINITIONS: CanonicalTokenDefinition[] = [
  {
    canonicalId: "stablecoin:usdc",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    aliases: ["USD COIN"],
    addresses: {
      ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      polygon: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
  },
];

function normalizeSymbol(value: string | undefined | null): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeName(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAddress(value: string | undefined | null): string | null {
  const trimmed = String(value || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return null;
  }
  return getAddress(trimmed).toLowerCase();
}

function buildFingerprintCanonicalId(symbol: string | null, name: string | null, decimals: number | null): string {
  const normalizedSymbol = normalizeSymbol(symbol) || "UNKNOWN";
  const normalizedName = normalizeName(name).replace(/[^a-z0-9]+/g, "-") || "unknown";
  const normalizedDecimals = typeof decimals === "number" ? String(decimals) : "na";
  return `fingerprint:${normalizedSymbol}:${normalizedDecimals}:${normalizedName}`;
}

function findDefinitionBySymbol(chain: ChainKey, tokenSymbol: string): CanonicalTokenDefinition | undefined {
  const symbol = normalizeSymbol(tokenSymbol);
  return TOKEN_DEFINITIONS.find((definition) => {
    const matchesAlias = (definition.aliases ?? []).some((alias) => normalizeSymbol(alias) === symbol);
    const matchesSymbol = normalizeSymbol(definition.symbol) === symbol || matchesAlias;
    // console.debug(`Checking token definition ${definition.canonicalId} for symbol match: ${matchesSymbol}`);
    return matchesSymbol && Boolean(definition.addresses[chain]);
  });
}

function findDefinitionByAddress(chain: ChainKey, tokenAddress: string): CanonicalTokenDefinition | undefined {
  const normalizedAddress = normalizeAddress(tokenAddress);
  if (!normalizedAddress) {
    return undefined;
  }

  return TOKEN_DEFINITIONS.find((definition) => {
    const configuredAddress = definition.addresses[chain];
    // console.debug(`Checking token definition ${definition.canonicalId} for address match: ${configuredAddress} vs ${normalizedAddress}`);
    return configuredAddress ? configuredAddress.toLowerCase() === normalizedAddress : false;
  });
}

export class TokenIdentityResolver {
  static normalizeSymbol(symbol: string | undefined | null): string {
    return normalizeSymbol(symbol);
  }
 
  static resolveAddressHint(chain: ChainKey, tokenSymbol: string): Address | null {
    const definition = findDefinitionBySymbol(chain, tokenSymbol);
    if (!definition) {
      return null;
    }

    const address = definition.addresses[chain];
    // console.debug(`Resolved address hint for ${tokenSymbol} on ${chain}: ${address}`);
    return address ? (getAddress(address) as Address) : null;
  }

  static resolveIdentity(input: {
    chain: ChainKey;
    address?: string | null;
    symbol?: string | null;
    name?: string | null;
    decimals?: number | null;
  }): CanonicalBridgeTokenIdentity {
    const byAddress = input.address ? findDefinitionByAddress(input.chain, input.address) : undefined;
    if (byAddress) {
      return {
        canonicalId: byAddress.canonicalId,
        canonicalSource: "registry",
        symbol: byAddress.symbol,
        name: byAddress.name,
        decimals: byAddress.decimals,
      };
    }

    const bySymbol = input.symbol ? findDefinitionBySymbol(input.chain, input.symbol) : undefined;
    if (bySymbol) {
      return {
        canonicalId: bySymbol.canonicalId,
        canonicalSource: "registry",
        symbol: bySymbol.symbol,
        name: bySymbol.name,
        decimals: bySymbol.decimals,
      };
    }

    const normalizedAddress = normalizeAddress(input.address);
    if (normalizedAddress && !input.symbol && !input.name && input.decimals == null) {
      return {
        canonicalId: `address:${String(input.chain).toLowerCase()}:${normalizedAddress}`,
        canonicalSource: "address",
        symbol: input.symbol ?? null,
        name: input.name ?? null,
        decimals: input.decimals ?? null,
      };
    }

    return {
      canonicalId: buildFingerprintCanonicalId(input.symbol ?? null, input.name ?? null, input.decimals ?? null),
      canonicalSource: "fingerprint",
      symbol: input.symbol ?? null,
      name: input.name ?? null,
      decimals: input.decimals ?? null,
    };
  }
}
