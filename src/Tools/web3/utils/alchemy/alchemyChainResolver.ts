import { ChainKey } from "../../clients/viem/viem-types";
import { resolveAlchemyNetwork } from "../../services/Alchemy/const";

function networkToBaseUrl(network: string): string {
  return `https://${network}.g.alchemy.com/v2/`;
}

export function getAlchemyBaseUrl(chain: ChainKey): string | null {
  const resolution = resolveAlchemyNetwork(chain);
  if (!resolution.supported) return null;
  return networkToBaseUrl(resolution.network);
}

export function getAlchemyRpcUrl(chain: ChainKey, apiKey: string): string {
  const resolution = resolveAlchemyNetwork(chain);
  if (!resolution.supported) {
    throw new Error(resolution.message);
  }
  return `${networkToBaseUrl(resolution.network)}${apiKey}`;
}

export function getAlchemyNftUrl(chain: ChainKey, apiKey: string, walletAddress: string): string {
  const resolution = resolveAlchemyNetwork(chain);
  if (!resolution.supported) {
    throw new Error(resolution.message);
  }
  return `https://${resolution.network}.g.alchemy.com/nft/v2/${apiKey}/getNFTs?owner=${walletAddress}`;
}