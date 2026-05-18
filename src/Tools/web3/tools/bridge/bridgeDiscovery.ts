export interface BridgeDiscoveryArgs {
  sourceChain: string;
  sourceTokenAddress: string;
}

export interface LayerZeroToken {
  isSupported: boolean;
  chainKey: string;
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  price?: {
    usd: number;
  };
}

export interface BridgeDiscoveryResponse {
  status: "supported" | "unsupported" | "error";
  reason?: string;
  details?: string;
  sourceChain?: string;
  sourceTokenAddress?: string;
  destinationTokens?: LayerZeroToken[];
  pagination?: {
    nextToken?: string;
  };
}

/**
 * Query LayerZero Value Transfer API to discover which tokens and chains
 * a given source token can be bridged to.
 */
export async function bridgeDiscovery(
  args: BridgeDiscoveryArgs
): Promise<BridgeDiscoveryResponse> {
  try {
    const { sourceChain, sourceTokenAddress } = args;

    // Validate inputs
    if (!sourceChain || sourceChain.trim().length === 0) {
      return {
        status: "error",
        reason: "Invalid source chain",
        details: "sourceChain must be a non-empty string (e.g., 'polygon', 'ethereum')",
      };
    }

    if (!sourceTokenAddress || sourceTokenAddress.trim().length === 0) {
      return {
        status: "error",
        reason: "Invalid source token address",
        details: "sourceTokenAddress must be a non-empty string",
      };
    }

    // Call LayerZero API
    const params = new URLSearchParams({
      transferrableFromChainKey: sourceChain.toLowerCase(),
      transferrableFromTokenAddress: sourceTokenAddress.toLowerCase(),
    });

    const url = `https://transfer.layerzero-api.com/v1/tokens?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: "error",
        reason: `LayerZero API returned ${response.status}`,
        details: `Failed to query LayerZero API for ${sourceChain}/${sourceTokenAddress} - Response: ${errorText}`,
      };
    }

    const data = await response.json();

    if (!data.tokens || !Array.isArray(data.tokens)) {
      return {
        status: "error",
        reason: "Invalid API response",
        details: "Expected tokens array in LayerZero response",
      };
    }

    // If no tokens returned, the source token is not bridgeable
    if (data.tokens.length === 0) {
      return {
        status: "unsupported",
        reason: "No bridgeable routes found",
        details: `Token ${sourceTokenAddress} on ${sourceChain} cannot be bridged via LayerZero`,
        sourceChain,
        sourceTokenAddress,
        destinationTokens: [],
      };
    }

    return {
      status: "supported",
      sourceChain,
      sourceTokenAddress,
      destinationTokens: data.tokens,
      pagination: data.pagination,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      reason: "Bridge discovery failed",
      details: message,
    };
  }
}
