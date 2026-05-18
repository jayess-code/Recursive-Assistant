import "dotenv/config";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainKey, PrivateKey } from "./viem-types";
import { resolveChainKey, viemChains } from "./viemChains";

export function createViemWalletClient(
  chainKey: ChainKey,
  privateKey?: PrivateKey
) {
  const resolvedKey = resolveChainKey(chainKey);
  const chainConfig = viemChains[resolvedKey];

  if (!chainConfig) {
    throw new Error(
      `Invalid chainKey "${chainKey}" (resolved: "${resolvedKey}"). Agent cannot execute on unknown chains.`
    );
  }

  const rpcUrl = chainConfig?.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL configured for chain "${resolvedKey}". Check viem chain configuration or chain alias mapping.`
    );
  }

  const adminKey = process.env.NEO_PRIVATE_KEY as PrivateKey | undefined;

  if (!privateKey && !adminKey) {
    throw new Error("No private key provided and NEO_PRIVATE_KEY is missing");
  }

  const account = privateKeyToAccount(privateKey ?? adminKey!);

  return createWalletClient({
    account,
    chain: chainConfig,
    transport: http(rpcUrl),
  });

  // return createWalletClient({
  //       account,
  //       chain: chainConfig,
  //       transport: http(),
  //   }).extend(eip712WalletActions());
}
