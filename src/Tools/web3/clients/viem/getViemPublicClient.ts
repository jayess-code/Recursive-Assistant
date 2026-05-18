import type { ChainKey } from "./viem-types";
import { createViemPublicClient } from "./createViemPublicClient";

export function getViemPublicClient(chain: ChainKey): ReturnType<typeof createViemPublicClient>[0] {
  const [client] = createViemPublicClient(chain);
  if (!client) {
    throw new Error(`Unable to create public client for chain ${String(chain)}.`);
  }

  return client;
}