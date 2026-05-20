import mongoose, { Schema, type Document, type Model } from "mongoose";

const TOOL_CATEGORIES = [
	"mcp",
	"search",
	"general",
	"system",
	"utility",
	"jobs",
	"storage",
	"crypto",
	"infra",
	"other",
] as const;

const TOOL_RISK_LEVELS = ["low", "medium", "high"] as const;
const TOOL_ACCESS_LEVELS = ["read", "write", "admin"] as const;
const TOOL_MODES = ["execute", "analyze", "simulate", "audit", "builder"] as const;
const TOOL_SOURCES = ["local", "mcp", "webhook", "queue"] as const;

interface IToolDocument extends Document {
	tool: {
		type: "function";
		name: string;
		description: string;
		parameters: {
			type: string;
			properties?: Record<string, unknown>;
			required?: string[];
			additionalProperties?: boolean;
		};
		exampleCalls?: unknown[];
		env?: string;
		display_width?: number;
		display_height?: number;
		strict?: boolean;
		schemaVersion?: string;
	};
	info: {
		version?: string;
		source?: (typeof TOOL_SOURCES)[number];
		category?: (typeof TOOL_CATEGORIES)[number];
		subcategory?: string;
		tags?: string[];
		riskLevel?: (typeof TOOL_RISK_LEVELS)[number];
		readOnly?: boolean;
		requiresConfirmation?: boolean;
		access?: (typeof TOOL_ACCESS_LEVELS)[number];
		provider?: string;
		mode?: (typeof TOOL_MODES)[number];
		allowedEnvironments?: Array<"development" | "test" | "staging" | "production">;
		definition?: string;
		metadata?: Record<string, unknown>;
		isEnabled?: boolean;
		mcp?: {
			server: string;
			toolName: string;
			namespace?: string;
		};
		webhook?: {
			url: string;
			method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
			headers?: Record<string, string>;
			timeout?: number;
		};
	};
	source: (typeof TOOL_SOURCES)[number];
	mcp?: {
		server?: string;
		toolName?: string;
		namespace?: string;
	};
	createdAt: Date;
	updatedAt: Date;
}

const parametersSchema = new Schema(
	{
		type: { type: String, required: true },
		properties: { type: Schema.Types.Mixed, default: undefined },
		required: { type: [String], default: undefined },
		additionalProperties: { type: Boolean, default: false },
	},
	{ _id: false, minimize: false }
);

const toolSchema = new Schema<IToolDocument>(
	{
		tool: {
			type: {
				type: String,
				enum: ["function"],
				required: true,
			},
			name: {
				type: String,
				required: true,
				unique: [true, "Tool already exists did you mean to update instead"],
				trim: true,
			},
			description: { type: String, required: true },
			parameters: {
				type: parametersSchema,
				required: true,
			},
			exampleCalls: { type: [Schema.Types.Mixed], default: [] },
			env: { type: String },
			display_width: { type: Number },
			display_height: { type: Number },
			strict: { type: Boolean, default: true },
			schemaVersion: { type: String, default: "2025-10" },
		},

		info: {
			version: { type: String },
			source: { type: String, enum: TOOL_SOURCES },
			category: { type: String, enum: TOOL_CATEGORIES },
			subcategory: { type: String },
			tags: { type: [String], default: [] },
			riskLevel: { type: String, enum: TOOL_RISK_LEVELS },
			readOnly: { type: Boolean, default: false },
			requiresConfirmation: { type: Boolean, default: false },
			access: { type: String, enum: TOOL_ACCESS_LEVELS },
			provider: { type: String },
			mode: { type: String, enum: TOOL_MODES },
			allowedEnvironments: {
				type: [String],
				enum: ["development", "test", "staging", "production"],
				default: undefined,
			},
			definition: { type: String },
			metadata: { type: Schema.Types.Mixed, default: {} },
			isEnabled: { type: Boolean, default: true },
			mcp: {
				server: { type: String },
				toolName: { type: String },
				namespace: { type: String },
			},
			webhook: {
				url: { type: String },
				method: { type: String, enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
				headers: { type: Map, of: String },
				timeout: { type: Number },
			},
		},

		source: { type: String, enum: TOOL_SOURCES, default: "local" },
		mcp: {
			server: { type: String },
			toolName: { type: String },
			namespace: { type: String },
		},
	},
	{
		timestamps: true,
		minimize: false,
	}
);

const ToolModel: Model<IToolDocument> =
	(mongoose.models.Tool as Model<IToolDocument>) ||
	mongoose.model<IToolDocument>("Tool", toolSchema);

export { ToolModel, IToolDocument };
export default ToolModel;
