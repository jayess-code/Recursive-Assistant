import type { JSONSchema } from "../../../../../Runtime/ToolExecutor/toolConfig";

export const PAIR_VOLUME_WINDOWS = ["h24", "h6", "h1", "m5"] as const;
export const PAIR_SORT_FIELDS = [
	"liquidityUsd",
	"marketCap",
	"fdv",
	"volume24h",
	"priceUsd",
	"priceChange24h",
] as const;
export const PAIR_SORT_DIRECTIONS = ["high", "low"] as const;

export type PairVolumeWindow = (typeof PAIR_VOLUME_WINDOWS)[number];
export type PairSortField = (typeof PAIR_SORT_FIELDS)[number];
export type PairSortDirection = (typeof PAIR_SORT_DIRECTIONS)[number];

export type NumericRange = {
	min?: number;
	max?: number;
};

export type VolumeRange = NumericRange & {
	window?: PairVolumeWindow;
};

export type PairSortOptions = {
	field?: PairSortField;
	direction?: PairSortDirection;
};

export type PairOptions = {
	liquidity?: NumericRange | null;
	marketCap?: NumericRange | null;
	fdv?: NumericRange | null;
	volume?: VolumeRange | null;
	sort?: PairSortOptions | null;
};

export function numericRangeSchema(description: string): JSONSchema {
	return {
		type: "object",
		nullable: true,
		default: null,
		additionalProperties: false,
		properties: {
			min: { type: "number", minimum: 0, nullable: true, default: null },
			max: { type: "number", minimum: 0, nullable: true, default: null },
		},
		required: ["min", "max"],
		description,
	};
}

export function volumeRangeSchema(description: string): JSONSchema {
	return {
		type: "object",
		nullable: true,
		default: null,
		additionalProperties: false,
		properties: {
			min: { type: "number", minimum: 0, nullable: true, default: null },
			max: { type: "number", minimum: 0, nullable: true, default: null },
			window: {
				type: "string",
				enum: [...PAIR_VOLUME_WINDOWS],
				nullable: true,
				default: "h24",
			},
		},
		required: ["min", "max", "window"],
		description,
	};
}

export function sortSchema(description: string): JSONSchema {
	return {
		type: "object",
		nullable: true,
		default: null,
		additionalProperties: false,
		properties: {
			field: {
				type: "string",
				enum: [...PAIR_SORT_FIELDS],
				nullable: true,
				default: "liquidityUsd",
			},
			direction: {
				type: "string",
				enum: [...PAIR_SORT_DIRECTIONS],
				nullable: true,
				default: "high",
			},
		},
		required: ["field", "direction"],
		description,
	};
}

export function pairOptionsSchema(description: string): JSONSchema {
	return {
		type: "object",
		nullable: true,
		default: null,
		additionalProperties: false,
		properties: {
			liquidity: numericRangeSchema("Liquidity range in USD (supports min/max)."),
			marketCap: numericRangeSchema("Market cap range in USD (supports min/max)."),
			fdv: numericRangeSchema("Fully diluted valuation range in USD (supports min/max)."),
			volume: volumeRangeSchema("Volume range in USD with optional window selector (h24 default, h6, h1, m5)."),
			sort: sortSchema("Sort attached pair entries by field (high=descending, low=ascending)."),
		},
		required: ["liquidity", "marketCap", "fdv", "volume", "sort"],
		description,
	};
}
