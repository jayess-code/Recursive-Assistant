import { Alchemy, Network } from "alchemy-sdk";
import { resolveChainKey, viemChains } from "../../clients/viem/viemChains";
import type { ChainKey } from "../../clients/viem/viem-types";

const ALCHEMY_NETWORK_BY_CHAIN: Partial<Record<string, Network>> = {
    mainnet: Network.ETH_MAINNET,
    sepolia: Network.ETH_SEPOLIA,
    polygon: Network.MATIC_MAINNET,
    polygonamoy: Network.MATIC_AMOY,
    arbitrum: Network.ARB_MAINNET,
    arbitrumsepolia: Network.ARB_SEPOLIA,
    base: Network.BASE_MAINNET,
    basesepolia: Network.BASE_SEPOLIA,
    optimism: Network.OPT_MAINNET,
    optimismsepolia: Network.OPT_SEPOLIA,
    apechain: Network.APECHAIN_MAINNET,
};

const ALCHEMY_NETWORK_BY_CHAIN_ID: Partial<Record<number, Network>> = {
    1: Network.ETH_MAINNET,
    11155111: Network.ETH_SEPOLIA,
    137: Network.MATIC_MAINNET,
    80002: Network.MATIC_AMOY,
    42161: Network.ARB_MAINNET,
    421614: Network.ARB_SEPOLIA,
    8453: Network.BASE_MAINNET,
    84532: Network.BASE_SEPOLIA,
    10: Network.OPT_MAINNET,
    11155420: Network.OPT_SEPOLIA,
    33139: Network.APECHAIN_MAINNET,
};

export type AlchemyNetworkResolution =
    | {
          supported: true;
          network: Network;
          resolvedKey: string;
          chainId: number | null;
          matchedBy: "chainKey" | "chainId";
      }
    | {
          supported: false;
          resolvedKey: string;
          chainId: number | null;
          supportedKeys: string[];
          message: string;
      };

export function getSupportedAlchemyChainKeys(): string[] {
    return Object.keys(ALCHEMY_NETWORK_BY_CHAIN).sort();
}

export function resolveAlchemyNetwork(chain: ChainKey): AlchemyNetworkResolution {
    const resolved = resolveChainKey(chain);
    const resolvedKey = String(resolved).trim();
    const normalized = resolvedKey.toLowerCase();

    const fromKey = ALCHEMY_NETWORK_BY_CHAIN[normalized];
    if (fromKey) {
        const chainId = viemChains[resolvedKey]?.id ?? null;
        return {
            supported: true,
            network: fromKey,
            resolvedKey,
            chainId,
            matchedBy: "chainKey",
        };
    }

    const chainId = viemChains[resolvedKey]?.id ?? null;
    if (typeof chainId === "number") {
        const fromChainId = ALCHEMY_NETWORK_BY_CHAIN_ID[chainId];
        if (fromChainId) {
            return {
                supported: true,
                network: fromChainId,
                resolvedKey,
                chainId,
                matchedBy: "chainId",
            };
        }
    }

    return {
        supported: false,
        resolvedKey,
        chainId,
        supportedKeys: getSupportedAlchemyChainKeys(),
        message: `Unsupported chain for Alchemy SDK: ${chain} (resolved: ${resolvedKey})`,
    };
}

export function getAlchemyNetwork(chain: ChainKey): Network {
    const resolution = resolveAlchemyNetwork(chain);
    if (!resolution.supported) {
        throw new Error(resolution.message);
    }
    return resolution.network;
}

export function createAlchemyClient(chain: ChainKey, apiKey?: string): Alchemy {
    const effectiveApiKey = apiKey ?? process.env.ALCHEMY_API_KEY ?? "";
    if (!effectiveApiKey) {
        throw new Error("Missing Alchemy API key");
    }

    return new Alchemy({
        apiKey: effectiveApiKey,
        network: getAlchemyNetwork(chain),
    });
}