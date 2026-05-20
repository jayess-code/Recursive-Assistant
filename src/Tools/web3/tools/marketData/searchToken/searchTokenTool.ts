import type { ToolConfig, ToolParameters } from "../../../../../Runtime/ToolExecutor/toolConfig";
import {
	SearchTokenArgs,
	SEARCH_TOKEN_FIELDS,
	SEARCH_TOKEN_MATCH_MODES,
	SEARCH_TOKEN_RESPONSE_MODES,
	searchToken,
} from "./searchToken";
import { pairOptionsSchema } from "../shared/pairOptionsSchema";

const AddressSchema = {
	type: "string",
	pattern: "^0x[a-fA-F0-9]{40}$",
	nullable: true,
	default: null,
	description: "Pass null when you do not already have a confirmed address from a prior tool call. Never guess, infer, or fabricate a value. Use the value field for name/symbol searches instead.",
};

const parameters: ToolParameters = {
	type: "object",
	additionalProperties: false,
	required: ["queries", "fields", "matchMode", "responseMode", "limit", "pairLimit", "includePairs", "includeMetrics", "includeCmc", "pairOptions"],
	properties: {
		queries: {
			type: "array",
			minimum: 1,
			description:
				"Token search inputs. Provide free text (value) and/or structured fields (name, symbol, address). When address is unknown, pass null (never use 0x0000000000000000000000000000000000000000 as a placeholder).",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["value", "name", "symbol", "address", "chain"],

				properties: {
					value: {
						type: "string",
						nullable: true,
						default: null,
						description: "Free-text search string for token name or symbol. Use this when the address is unknown. Pass null if not needed.",
					},
					name: {
						type: "string",
						nullable: true,
						default: null,
						description: "Token name for structured matching. Pass null if not needed.",
					},
					symbol: {
						type: "string",
						nullable: true,
						default: null,
						description: "Token ticker symbol for structured matching. Pass null if not needed.",
					},
					address: AddressSchema,
					chain: {
						type: "string",
						nullable: true,
						default: null,
						description: "Optional chain filter (ethereum, base, polygon, arbitrum, etc).",
					},
				},
			},
		},
		fields: {
			type: "array",
			nullable: true,
			default: null,
			description: "Optional projection fields. In compact mode, defaults to a compact field set when omitted.",
			items: {
				type: "string",
				enum: [...SEARCH_TOKEN_FIELDS],
			},
		},
		matchMode: {
			type: "string",
			nullable: true,
			default: "smart",
			enum: [...SEARCH_TOKEN_MATCH_MODES],
			description: "Use smart for name/symbol searches. Use exact only when you have a verified contract address.",
		},
		responseMode: {
			type: "string",
			nullable: true,
			default: "compact",
			enum: [...SEARCH_TOKEN_RESPONSE_MODES],
			description:
				"Response shape mode. compact returns concise payloads by default. full returns complete payloads unless fields projection is provided.",
		},
		limit: {
			type: "number",
			nullable: true,
			default: 5,
			minimum: 1,
			maximum: 25,
			description: "Max tokens returned per query.",
		},
		pairLimit: {
			type: "number",
			nullable: true,
			default: 3,
			minimum: 1,
			maximum: 10,
			description: "Max market pairs attached per token result.",
		},
		includePairs: {
			type: "boolean",
			nullable: true,
			default: true,
			description: "Whether to include detailed market pair entries.",
		},
		includeMetrics: {
			type: "boolean",
			nullable: true,
			default: true,
			description: "Whether to include market cap, FDV, liquidity, and price metrics.",
		},
		includeCmc: {
			type: "boolean",
			nullable: true,
			default: true,
			description:
				"Whether to enrich results with CoinMarketCap metadata and aggregated market context when COINMARKETCAP_API_KEY is configured.",
		},
		pairOptions: {
			...pairOptionsSchema(
				"Optional filters/sort for attached marketPairs output. Candidate matching/scoring remains unchanged."
			),
		},
	},
};

export const searchTokenTool: ToolConfig<SearchTokenArgs> = {
	tool: {
		type: "function",
		name: "search_token",
		description:
			"Search tokens by name or symbol and return decision-grade market intelligence. Use this to identify token contract addresses before swap_quote/swap_build. Defaults to compact responses; use fields for explicit projection or responseMode=full when you need full payloads. Leave address null when unknown, never guess or fabricate. Always use the value field for free-text name/symbol searches, not the address field.",
		parameters,
		strict: true,
		handler: async (args, context) => searchToken(args, context),
	},
	info: {
		category: "crypto",
		subcategory: "market-data",
		tags: ["market-data", "token", "search"],
		riskLevel: "low",
		readOnly: true,
		access: "read",
		mode: "analyze",
		provider: "dexscreener",
		version: "1.0.0",
		definition:
			"Finds and ranks token matches across DEX markets, with optional CMC enrichment. Intended for token identity resolution and market context; downstream swap tools still require valid router contracts and chain-confirmed token addresses, pass null when you do not already have a confirmed address from a prior tool call..",
	},
};
