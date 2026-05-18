import type { ToolConfig, ToolParameters } from "../../../../../Runtime/ToolExecutor/toolConfig";
import { fetchTokenPairs, FetchTokenPairsArgs, FETCH_TOKEN_PAIRS_FIELDS } from "./fetchTokenPairs";
import { numericRangeSchema, sortSchema, volumeRangeSchema } from "../shared/pairOptionsSchema";

const parameters: ToolParameters = {
	type: "object",
	additionalProperties: false,
	required: ["tokenAddress", "chain", "limit", "fields", "liquidity", "marketCap", "fdv", "volume", "sort"],
	properties: {
		tokenAddress: {
			type: "string",
			nullable: true,
			default: null,
			pattern: "^0x[a-fA-F0-9]{40}$",
			description: "EVM token address to fetch pairs for.",
		},
		chain: {
			type: "string",
			nullable: true,
			default: null,
			description: "Optional chain filter (e.g. ethereum, polygon, base, arbitrum).",
		},
		limit: {
			type: "number",
			nullable: true,
			default: 5,
			minimum: 1,
			maximum: 20,
			description: "Max number of token pairs to return.",
		},
		fields: {
			type: "array",
			nullable: true,
			default: null,
			description: "Optional field projection to limit response keys.",
			items: {
				type: "string",
				enum: [...FETCH_TOKEN_PAIRS_FIELDS],
			},
		},
		liquidity: {
			...numericRangeSchema("Liquidity range in USD (supports min/max)."),
		},
		marketCap: {
			...numericRangeSchema("Market cap range in USD (supports min/max)."),
		},
		fdv: {
			...numericRangeSchema("Fully diluted valuation range in USD (supports min/max)."),
		},
		volume: {
			...volumeRangeSchema("Volume range in USD with optional window selector (h24 default, h6, h1, m5)."),
		},
		sort: {
			...sortSchema("Sort results by field (high=descending, low=ascending)."),
		},
	},
};

export const fetchTokenPairsTool: ToolConfig<FetchTokenPairsArgs> = {
	tool: {
		type: "function",
		name: "fetch_token_pairs",
		description:
			"Fetch token pair/pool market entries for a token and chain. Use returned dexId and liquidity to choose a DEX route; pairAddress is a pool contract and must not be used as routerAddress.",
		parameters,
		strict: true,
		exampleCalls:[{
		"tokenAddress": "0x...",
		"chain": "base",
		"limit": 10,
		"fields": ["pairAddress", "dexId", "liquidityUsd", "volume24h", "marketCap"],
		"liquidity": { "min": 100000 },
		"marketCap": null,
		"fdv": null,
		"volume": { "min": 50000, "window": "h6" },
		"sort": { "field": "volume24h", "direction": "high" }
		}
		],
		handler: async (args, context) => fetchTokenPairs(args, context),
	},
	info: {
		category: "market-data",
		riskLevel: "low",
		readOnly: true,
		access: "read",
		mode: "analyze",
		provider: "dexscreener",
		version: "1.0.0",
		definition:
			"Returns DEX pair/pool metadata (including dexId, pairAddress, and liquidity) for routing decisions. This tool informs router selection but does not return executable router calldata.",
	},
};
