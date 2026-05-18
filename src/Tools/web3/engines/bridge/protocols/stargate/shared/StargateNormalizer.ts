// StargateNormalizer.ts
import { Address, getAddress } from "viem";
import { TokenIdentityResolver } from "../../../identity/TokenIdentityResolver";
import { BridgeAssetArgs } from "../../../core/BridgeTypes";
import { ChainKey } from "../../../../../clients/viem/viem-types";
import { resolveChainKey } from "../../../../../clients/viem/viemChains";

export interface NormalizedBridgeInput {
  fromChain: ChainKey;
  toChain: ChainKey;
  token: string;
  amount: string;
  recipient: Address;
  slippageBps: number;
  dryRun: boolean;
  transportMode: "taxi" | "bus";
  srcTokenAddress?: Address;
  dstTokenAddress?: Address;
}

const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_TRANSPORT_MODE = "taxi";

function normalizeOptionalAddress(value?: string): Address | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return undefined;
  }

  // Intentionally avoid protocol-level address validation.
  return trimmed as Address;
}

export function normalizeStringSet(values?: string[], toUpper = false): Set<string> {
  return new Set(
    (values ?? [])
      .map((value: string) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => (toUpper ? value.toUpperCase() : value.toLowerCase()))
  );
}

export function normalizeArgs(args: BridgeAssetArgs): NormalizedBridgeInput {
  const fromChain = resolveChainKey(String(args.fromChain || "").trim() as ChainKey);
  const toChain = resolveChainKey(String(args.toChain || "").trim() as ChainKey);
  const token = String(args.token || "").trim().toUpperCase();
  const amount = String(args.amount ?? "").trim();
  const recipient = String(args.recipient ?? "").trim() as Address;
  const srcTokenAddress = normalizeOptionalAddress(args.srcTokenAddress);
  const dstTokenAddress = normalizeOptionalAddress(args.dstTokenAddress);
  const slippageBps = Number.isFinite(Number(args.slippageBps))
    ? Number(args.slippageBps)
    : DEFAULT_SLIPPAGE_BPS;

  return {
    fromChain,
    toChain,
    token,
    amount,
    recipient,
    slippageBps,
    dryRun: Boolean(args.dryRun),
    transportMode: args.transportMode === "bus" ? "bus" : DEFAULT_TRANSPORT_MODE,
    ...(srcTokenAddress ? { srcTokenAddress } : {}),
    ...(dstTokenAddress ? { dstTokenAddress } : {}),
  };
}

export function resolveV1SourceTokenAddress(normalized: NormalizedBridgeInput): Address | null {
  if (normalized.srcTokenAddress) {
    return normalized.srcTokenAddress;
  }
  return TokenIdentityResolver.resolveAddressHint(normalized.fromChain, normalized.token);
}

export function resolveMatchedDstTokenAddress(args: {
  fromChain: string;
  toChain: string;
  tokenAddress: Address;
}): Address {
  const fromChain = resolveChainKey(String(args.fromChain || "").trim() as ChainKey);
  const toChain = resolveChainKey(String(args.toChain || "").trim() as ChainKey);
  const normalizedToken = getAddress(args.tokenAddress) as Address;

  const identity = TokenIdentityResolver.resolveIdentity({
    chain: fromChain,
    address: normalizedToken,
  });

  if (identity.symbol) {
    const destinationHint = TokenIdentityResolver.resolveAddressHint(toChain, identity.symbol);
    if (destinationHint) {
      return destinationHint;
    }
  }

  return normalizedToken;
}
