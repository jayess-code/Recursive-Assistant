import { formatUnits, parseUnits } from "viem";
import { getViemPublicClient } from "../../../clients/viem/getViemPublicClient";
import { resolveChainKey, viemChains } from "../../../clients/viem/viemChains";
import { ChainMetadata } from "../chains/chainMetadata/chainMetadata";
import { projectFields } from "../../types/projectFields";

export interface GasPriceQuery {
  chain: string;
  amountNative?: string | null;
  amountETH?: string | null;
}

export interface GetGasPriceArgs {
  chain?: string;
  amountNative?: string | null;
  amountETH?: string | null;
  queries?: GasPriceQuery[] | null;
  fields?: string[] | null;
}

export async function getGasPrice(args: GetGasPriceArgs) {
  try {
    const queries = args.queries?.length
      ? args.queries
      : args.chain
        ? [{
            chain: args.chain,
            amountNative: args.amountNative ?? null,
            amountETH: args.amountETH ?? null,
          }]
        : null;

    if (!queries) {
      return {
        success: false,
        error: "Either 'queries' or a top-level 'chain' argument is required.",
      };
    }

    const entries = await Promise.all(
      queries.map(async (query: GasPriceQuery) => {
        const result = await getGasPriceForChain(query);
        return [query.chain, projectFields(result, args.fields)] as const;
      })
    );

    if (queries.length === 1) {
      const first = entries[0];
      if (!first) {
        return {
          success: false,
          error: "Unexpected empty gas price entries result.",
        };
      }

      return {
        success: true,
        data: JSON.stringify(first[1]),
      };
    }

    return {
      success: true,
      data: JSON.stringify(Object.fromEntries(entries)),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get gas price: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}



type GasSnapshot = {
  gasPriceWei: string;
  gasPriceGwei: string;
  gasPriceGweiNumber: number;
  baseFeePerGasWei?: string;
  baseFeePerGasGwei?: string;
  maxFeePerGasWei?: string;
  maxFeePerGasGwei?: string;
  maxPriorityFeePerGasWei?: string;
  maxPriorityFeePerGasGwei?: string;
};

type GasPriceResult = {
  protocol: "evm";
  chain: string;
  chainId: number | null;
  nativeSymbol: string;
  nativeDecimals: number;
  gasPriceWei: string;
  gasPriceGwei: string;
  gasLevel: string;
  advice: string;
  baseFeePerGasWei?: string;
  baseFeePerGasGwei?: string;
  maxFeePerGasWei?: string;
  maxFeePerGasGwei?: string;
  maxPriorityFeePerGasWei?: string;
  maxPriorityFeePerGasGwei?: string;
  amountNative?: string;
  estimatedFeeNative?: string;
  totalAmountWithFeeNative?: string;
};

async function getGasPriceForChain(query: GasPriceQuery): Promise<GasPriceResult> {
  const chainInfo = await getChainInfo(query);
  return buildGasPriceResult(query, chainInfo.metadata, chainInfo.gasSnapshot);
}



async function getGasSnapshot({ chain }: GasPriceQuery): Promise<GasSnapshot> {
  const client = getViemPublicClient(chain);
  const [gasPrice, latestBlock, estimatedFees] = await Promise.all([
    client.getGasPrice(),
    client.getBlock({ blockTag: "latest" }),
    client.estimateFeesPerGas().catch(() => null),
  ]);

  const snapshot: GasSnapshot = {
    gasPriceWei: gasPrice.toString(),
    gasPriceGwei: formatUnits(gasPrice, 9),
    gasPriceGweiNumber: Number(formatUnits(gasPrice, 9)),
  };

  if (typeof latestBlock.baseFeePerGas === "bigint") {
    snapshot.baseFeePerGasWei = latestBlock.baseFeePerGas.toString();
    snapshot.baseFeePerGasGwei = formatUnits(latestBlock.baseFeePerGas, 9);
  }

  if (estimatedFees?.maxFeePerGas != null) {
    snapshot.maxFeePerGasWei = estimatedFees.maxFeePerGas.toString();
    snapshot.maxFeePerGasGwei = formatUnits(estimatedFees.maxFeePerGas, 9);
  }

  if (estimatedFees?.maxPriorityFeePerGas != null) {
    snapshot.maxPriorityFeePerGasWei = estimatedFees.maxPriorityFeePerGas.toString();
    snapshot.maxPriorityFeePerGasGwei = formatUnits(estimatedFees.maxPriorityFeePerGas, 9);
  }

  return snapshot;
}

export function buildChainMetadataFromConfig(chain: string): ChainMetadata {
  const resolvedChain = resolveChainKey(chain);
  const chainConfig = viemChains[resolvedChain];

  if (!chainConfig) {
    throw new Error(`Unsupported or unknown chain key: ${chain}`);
  }

  const nativeCurrency = chainConfig.nativeCurrency;

  return {
    protocol: "evm",
    chain,
    chainId: chainConfig.id ?? null,
    nativeSymbol: nativeCurrency?.symbol ?? "NATIVE",
    nativeDecimals: nativeCurrency?.decimals ?? 18,
    rpcUrls: chainConfig.rpcUrls
      ? { default: { http: chainConfig.rpcUrls.default?.http ?? null } }
      : null,
    testnet: chainConfig.testnet ?? null,
  };
}

async function getChainInfo(query: GasPriceQuery) {
  const metadata = buildChainMetadataFromConfig(query.chain);
  const gasSnapshot = await getGasSnapshot(query);

  return {
    metadata,
    gasSnapshot,
  };
}

function buildGasPriceResult(
  query: GasPriceQuery,
  metadata: ChainMetadata,
  gasSnapshot: GasSnapshot
): GasPriceResult {
  const classification = classifyGasByPriceGwei(gasSnapshot.gasPriceGweiNumber);

  const result: GasPriceResult = {
    ...metadata,
    gasPriceWei: gasSnapshot.gasPriceWei,
    gasPriceGwei: gasSnapshot.gasPriceGwei,
    ...(gasSnapshot.baseFeePerGasWei !== undefined ? { baseFeePerGasWei: gasSnapshot.baseFeePerGasWei } : {}),
    ...(gasSnapshot.baseFeePerGasGwei !== undefined ? { baseFeePerGasGwei: gasSnapshot.baseFeePerGasGwei } : {}),
    ...(gasSnapshot.maxFeePerGasWei !== undefined ? { maxFeePerGasWei: gasSnapshot.maxFeePerGasWei } : {}),
    ...(gasSnapshot.maxFeePerGasGwei !== undefined ? { maxFeePerGasGwei: gasSnapshot.maxFeePerGasGwei } : {}),
    ...(gasSnapshot.maxPriorityFeePerGasWei !== undefined ? { maxPriorityFeePerGasWei: gasSnapshot.maxPriorityFeePerGasWei } : {}),
    ...(gasSnapshot.maxPriorityFeePerGasGwei !== undefined ? { maxPriorityFeePerGasGwei: gasSnapshot.maxPriorityFeePerGasGwei } : {}),
    gasLevel: classification.level,
    advice: classification.advice,
  };

  const normalizedAmountNative = normalizeOptionalAmount(query.amountNative)
    ?? normalizeOptionalAmount(query.amountETH);

  if (normalizedAmountNative) {
    try {
      const nativeAmountWei = parseUnits(normalizedAmountNative, metadata.nativeDecimals);
      const estimatedFeeWei = BigInt(result.gasPriceWei) * 21000n;

      result.amountNative = normalizedAmountNative;
      result.estimatedFeeNative = formatUnits(estimatedFeeWei, metadata.nativeDecimals);
      result.totalAmountWithFeeNative = formatUnits(
        nativeAmountWei + estimatedFeeWei,
        metadata.nativeDecimals
      );
    } catch {
      // Ignore invalid amount strings and return the rest of the gas payload.
    }
  }

  return result;
}

function normalizeOptionalAmount(amount?: string | null): string | null {
  if (amount == null) {
    return null;
  }

  const normalized = amount.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function classifyGasByPriceGwei(gasPriceGwei: number) {
  if (gasPriceGwei < 1) {
    return { level: "low", advice: "Very cheap to transact." };
  }
  if (gasPriceGwei < 30) {
    return { level: "normal", advice: "Reasonable cost." };
  }
  if (gasPriceGwei < 80) {
    return { level: "high", advice: "Slightly expensive." };
  }
  return { level: "extreme", advice: "Expensive transaction. Consider waiting." };
}