import { createPublicClient, http } from "viem";
import type { Chain, PublicClient } from "viem";
import type { ChainKey } from "./viem-types";
import { resolveChainKey, viemChains } from "./viemChains";

function getPreferredRpcUrl(resolvedKey: ChainKey, chainConfig: Chain): string | undefined {
  const envOverride = process.env[`${String(resolvedKey).toUpperCase()}_RPC_URL`];
  if (envOverride) {
    return envOverride;
  }

  return chainConfig?.rpcUrls?.default?.http?.[0];
}

// Modify the function to handle a single chain or an array of chains
export function createViemPublicClient(
  chainKeys: ChainKey | ChainKey[],
): PublicClient[] {
  const chainKeysArray = Array.isArray(chainKeys) ? chainKeys : [chainKeys];

  return chainKeysArray.map((chainKey: ChainKey) => {
    const resolvedKey = resolveChainKey(chainKey);
    const chainConfig: Chain | undefined = viemChains[resolvedKey];

    if (!chainConfig) {
      throw new Error(`Invalid chainKey "${chainKey}" (resolved: "${resolvedKey}").`);
    }

    const rpcUrl = getPreferredRpcUrl(resolvedKey, chainConfig);
    if (!rpcUrl) {
      throw new Error(
        `No RPC URL configured for chain "${resolvedKey}". Check viem chain configuration or chain alias mapping.`
      );
    }

    return createPublicClient({
      chain: chainConfig,
      name: 'Public Client', 
      transport: http(rpcUrl, {
        timeout: 12_000,
        retryCount: 1,
        retryDelay: 250,
      }),
    });
  });
}

// const balances = await client.getAllBalances({
//   account: "0x36615Cf349d7F6344891B1e7CA7C72883F5dc049"
// });