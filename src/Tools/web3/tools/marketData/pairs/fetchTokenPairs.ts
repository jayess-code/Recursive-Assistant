import { ToolHandlerContext } from "../../types/handler-types";
import {
	DexPair,
	fetchDexPairsByTokenAddress,
	normalizeDexChain,
	parseDexNullableNumber,
} from "../../../services/DexScreener/dexScreenerClient";
import { projectFields } from "../../types/projectFields";
import type {
	NumericRange as SharedNumericRange,
	PairSortDirection as SharedSortDirection,
	PairSortField as SharedSortField,
	PairSortOptions as SharedSortOptions,
	PairVolumeWindow as SharedVolumeWindow,
	VolumeRange as SharedVolumeRange,
} from "../shared/pairOptionsSchema";

export const FETCH_TOKEN_PAIRS_FIELDS = [
	"chain",
	"pairAddress",
	"dexId",
	"tokenA",
	"tokenASymbol",
	"tokenAName",
	"tokenB",
	"tokenBSymbol",
	"priceUsd",
	"priceNative",
	"liquidityUsd",
	"volume24h",
	"marketCap",
	"fdv",
	"priceChange24h",
	"labels",
] as const;

export type FetchTokenPairsField = (typeof FETCH_TOKEN_PAIRS_FIELDS)[number];

export type TokenPair = {
	chain: string;
	pairAddress?: string;
	dexId?: string;
	tokenA: string;
	tokenASymbol?: string;
	tokenAName?: string;
	tokenB?: string;
	tokenBSymbol?: string;
	priceUsd?: number | null;
	priceNative?: number | null;
	liquidityUsd?: number | null;
	volume24h?: number | null;
	marketCap?: number | null;
	fdv?: number | null;
	priceChange24h?: number | null;
	labels?: string[];
};

export type NumericRange = SharedNumericRange;
export type VolumeWindow = SharedVolumeWindow;
export type VolumeRange = SharedVolumeRange;
export type SortField = SharedSortField;
export type SortDirection = SharedSortDirection;
export type SortOptions = SharedSortOptions;

export type FetchTokenPairsArgs = {
	tokenAddress: string | null;
	chain: string | null;
	limit: number | null;
	fields: FetchTokenPairsField[] | null;
	liquidity: NumericRange | null;
	marketCap: NumericRange | null;
	fdv: NumericRange | null;
	volume: VolumeRange | null;
	sort: SortOptions | null;
}

function inRange(value: number, range: NumericRange | null): boolean {
	if (!range) {
		return true;
	}

	if (typeof range.min === "number" && value < range.min) {
		return false;
	}

	if (typeof range.max === "number" && value > range.max) {
		return false;
	}

	return true;
}

function resolveVolumeWindow(volume: VolumeRange | null): VolumeWindow {
	if (!volume?.window) {
		return "h24";
	}

	return volume.window;
}

function getVolumeByWindow(pair: DexPair, window: VolumeWindow): number {
	if (window === "h1") {
		return parseDexNullableNumber(pair.volume?.h1) ?? 0;
	}

	if (window === "h6") {
		return parseDexNullableNumber(pair.volume?.h6) ?? 0;
	}

	if (window === "m5") {
		return parseDexNullableNumber(pair.volume?.m5) ?? 0;
	}

	return parseDexNullableNumber(pair.volume?.h24) ?? 0;
}

function getSortValue(pair: DexPair, field: SortField, volumeWindow: VolumeWindow): number {
	if (field === "liquidityUsd") {
		return parseDexNullableNumber(pair.liquidity?.usd) ?? 0;
	}

	if (field === "marketCap") {
		return parseDexNullableNumber(pair.marketCap) ?? 0;
	}

	if (field === "fdv") {
		return parseDexNullableNumber(pair.fdv) ?? 0;
	}

	if (field === "volume24h") {
		return getVolumeByWindow(pair, volumeWindow);
	}

	if (field === "priceUsd") {
		return parseDexNullableNumber(pair.priceUsd) ?? 0;
	}

	return parseDexNullableNumber(pair.priceChange?.h24) ?? 0;
}

function mapDexPairToTokenPair(pair: DexPair): TokenPair {
	return {
		chain: String(pair.chainId ?? "").toLowerCase(),
		...(pair.pairAddress ? { pairAddress: pair.pairAddress } : {}),
		...(pair.dexId ? { dexId: pair.dexId } : {}),
		tokenA: String(pair.baseToken?.address ?? ""),
		...(pair.baseToken?.symbol ? { tokenASymbol: pair.baseToken.symbol } : {}),
		...(pair.baseToken?.name ? { tokenAName: pair.baseToken.name } : {}),
		...(pair.quoteToken?.address ? { tokenB: pair.quoteToken.address } : {}),
		...(pair.quoteToken?.symbol ? { tokenBSymbol: pair.quoteToken.symbol } : {}),
		priceUsd: parseDexNullableNumber(pair.priceUsd),
		priceNative: parseDexNullableNumber(pair.priceNative),
		liquidityUsd: parseDexNullableNumber(pair.liquidity?.usd),
		volume24h: parseDexNullableNumber(pair.volume?.h24),
		marketCap: parseDexNullableNumber(pair.marketCap),
		fdv: parseDexNullableNumber(pair.fdv),
		priceChange24h: parseDexNullableNumber(pair.priceChange?.h24),
		labels: pair.labels ?? [],
	};
}

export async function fetchTokenPairs(
	args: FetchTokenPairsArgs,
	_context?: ToolHandlerContext
) {
	try {
		if (!args.tokenAddress) {
			return {
				success: false,
				error: "tokenAddress is required. Provide a valid ERC-20 contract address.",
			} ;
		}

		const limit = Math.max(1, Math.min(20, Number(args.limit ?? 10)));
		const chainFilter = normalizeDexChain(args.chain);

		const rawPairs = await fetchDexPairsByTokenAddress(args.tokenAddress);

		const filtered = chainFilter
			? rawPairs.filter((p) => String(p.chainId ?? "").toLowerCase() === chainFilter)
			: rawPairs;
		const volumeWindow = resolveVolumeWindow(args.volume);
		const sortField = args.sort?.field ?? "liquidityUsd";
		const sortDirection = args.sort?.direction ?? "high";

		const sorted = [...filtered].sort(
			(a, b) => {
				const aValue = getSortValue(a, sortField, volumeWindow);
				const bValue = getSortValue(b, sortField, volumeWindow);

				return sortDirection === "low" ? aValue - bValue : bValue - aValue;
			}
		);

		const rangeFiltered = sorted.filter((p) => {
			const liq = parseDexNullableNumber(p.liquidity?.usd) ?? 0;
			const mc = parseDexNullableNumber(p.marketCap) ?? 0;
			const fdv = parseDexNullableNumber(p.fdv) ?? 0;
			const volumeValue = getVolumeByWindow(p, volumeWindow);

			return (
				inRange(liq, args.liquidity) &&
				inRange(mc, args.marketCap) &&
				inRange(fdv, args.fdv) &&
				inRange(volumeValue, args.volume)
			);
		});

		const result = rangeFiltered
			.slice(0, limit)
			.map((p) => projectFields(mapDexPairToTokenPair(p), args.fields) as Partial<TokenPair>);

		return{
			success: true,
			data: JSON.stringify(result, null, 2),
		} ;
	} catch (error) {
		return {
			success: false,
			error: `Failed to fetch token pairs: ${error instanceof Error ? error.message : String(error)}`,
		} ;
	}
}
