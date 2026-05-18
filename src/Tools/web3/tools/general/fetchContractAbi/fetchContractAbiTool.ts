
import { ChainKey } from "../../../clients/viem/viem-types";
import type { ToolConfig, ToolParameters } from "../../../../../Runtime/ToolExecutor/toolConfig";
import { fetchContractAbi } from "./fetchContractAbi";
interface FetchContractAbiArgs {
    contractAddress?: string | null;
    chain?: ChainKey | null;
    functionName?: string | null;
    queries?: FetchContractAbiQuery[] | null;
    fields?: string[] | null;
}

interface FetchContractAbiQuery {
    contractAddress: string;
    chain: ChainKey;
    functionName?: string | null;
}

interface ContractAbiLookupResult {
    abi: any[];
    abiJson: string;
    functions: string[];
    source: "explorer" | "sourcify";
}

const DEFAULT_FETCH_CONTRACT_ABI_FIELDS = ["chain", "contractAddress", "functions", "source", "warnings"] as const;
const DEFAULT_FETCH_CONTRACT_FUNCTION_FIELDS = [
    "chain",
    "contractAddress",
    "functionName",
    "signature",
    "matchingAbiJson",
    "source",
    "warnings",
] as const;

const HEAVY_FETCH_CONTRACT_ABI_FIELDS = ["abi", "abiJson"] as const;

const FETCH_CONTRACT_ABI_FIELDS = [
    "chain",
    "contractAddress",
    "functionName",
    "signature",
    "matchingAbi",
    "matchingAbiJson",
    "abi",
    "abiJson",
    "functions",
    "source",
    "error",
    "warnings",
] as const;

function projectFetchContractAbiFields(
    record: Record<string, unknown>,
    fields?: string[] | null
): Record<string, unknown> {
    const normalizedFields = Array.from(
        new Set((fields ?? []).map((field) => field.trim()).filter(Boolean))
    );

    if (!normalizedFields.length) {
        return record;
    }

    return Object.fromEntries(
        normalizedFields
            .filter((field) =>
                FETCH_CONTRACT_ABI_FIELDS.includes(field as (typeof FETCH_CONTRACT_ABI_FIELDS)[number])
            )
            .map((field) => [field, record[field]])
    );
}

function getEffectiveFetchContractAbiFields(
    fields: string[] | null | undefined,
    functionName?: string | null
): string[] | null {
    const normalizedFields = Array.from(
        new Set((fields ?? []).map((field) => field.trim()).filter(Boolean))
    );

    if (normalizedFields.length) {
        return normalizedFields;
    }

    return String(functionName ?? "").trim()
        ? [...DEFAULT_FETCH_CONTRACT_FUNCTION_FIELDS]
        : [...DEFAULT_FETCH_CONTRACT_ABI_FIELDS];
}

function normalizeFetchContractAbiFields(
    fields: string[] | null | undefined,
    functionName?: string | null
): { fields: string[] | null; warnings: string[] } {
    const effectiveFields = getEffectiveFetchContractAbiFields(fields, functionName);
    const normalizedFields = Array.from(
        new Set((effectiveFields ?? []).map((field) => field.trim()).filter(Boolean))
    );
    const warnings: string[] = [];
    const hasFunctionName = Boolean(String(functionName ?? "").trim());
    const requestedHeavyFields = normalizedFields.filter((field) =>
        HEAVY_FETCH_CONTRACT_ABI_FIELDS.includes(field as (typeof HEAVY_FETCH_CONTRACT_ABI_FIELDS)[number])
    );

    if (!requestedHeavyFields.length) {
        return { fields: normalizedFields.length ? normalizedFields : null, warnings };
    }

    if (hasFunctionName) {
        const remappedFields = normalizedFields.map((field) => {
            if (field === "abi") {
                return "matchingAbi";
            }

            if (field === "abiJson") {
                return "matchingAbiJson";
            }

            return field;
        });

        warnings.push(
            "Heavy ABI fields were normalized to function-scoped matchingAbi or matchingAbiJson to keep the response compact."
        );

        return {
            fields: Array.from(new Set([...remappedFields, "warnings"])),
            warnings,
        };
    }

    warnings.push(
        "Full abi or abiJson was omitted to keep the response compact. Pass a specific functionName and use matchingAbiJson for follow-up read_contract calls."
    );

    const compactFields = normalizedFields.filter(
        (field) => !HEAVY_FETCH_CONTRACT_ABI_FIELDS.includes(field as (typeof HEAVY_FETCH_CONTRACT_ABI_FIELDS)[number])
    );

    return {
        fields: Array.from(new Set([...(compactFields.length ? compactFields : DEFAULT_FETCH_CONTRACT_ABI_FIELDS), "warnings"])),
        warnings,
    };
}

function appendAbiLookupWarnings(
    record: Record<string, unknown>,
    warnings: string[]
): Record<string, unknown> {
    const existingWarnings = Array.isArray(record.warnings)
        ? record.warnings.filter((value): value is string => typeof value === "string")
        : [];

    return {
        ...record,
        warnings: Array.from(new Set([...existingWarnings, ...warnings])),
    };
}

function getMatchingAbiEntries(abi: any[], functionName?: string | null): any[] | null {
    const normalizedFunctionName = String(functionName ?? "").trim();
    if (!normalizedFunctionName) {
        return null;
    }

    const matches = abi.filter(
        (item: any) => item?.type === "function" && String(item?.name ?? "") === normalizedFunctionName
    );

    return matches.length ? matches : null;
}

function toFunctionSignature(item: any): string {
    return `${item.name}(${(item.inputs || []).map((input: any) => input.type).join(",")})`;
}

async function buildBatchAbiLookupResult(query: FetchContractAbiQuery): Promise<Record<string, unknown>> {
    const fullLookup = await fetchContractAbi({
        contractAddress: query.contractAddress,
        chain: query.chain,
    });

    if (typeof fullLookup === "string" || Array.isArray(fullLookup)) {
        throw new Error("Unexpected ABI lookup response while building batched contract ABI result.");
    }

    const matchingAbi = getMatchingAbiEntries(fullLookup.abi, query.functionName);
    const signature = matchingAbi?.length ? matchingAbi.map(toFunctionSignature).join(", ") : null;
    const warnings: string[] = [];

    if (query.functionName && !matchingAbi?.length) {
        warnings.push(`Function '${query.functionName}' was not found in the verified ABI.`);
    }

    return {
        chain: query.chain,
        contractAddress: query.contractAddress,
        functionName: query.functionName ?? null,
        signature,
        matchingAbi,
        matchingAbiJson: matchingAbi ? JSON.stringify(matchingAbi) : null,
        abi: fullLookup.abi,
        abiJson: fullLookup.abiJson,
        functions: fullLookup.functions,
        source: fullLookup.source,
        error: null,
        warnings,
    };
}

async function buildSingleAbiLookupResult(args: {
    contractAddress: string;
    chain: ChainKey;
    functionName?: string | null;
}): Promise<Record<string, unknown>> {
    const fullLookup = await fetchContractAbi({
        contractAddress: args.contractAddress,
        chain: args.chain,
    });

    if (typeof fullLookup === "string" || Array.isArray(fullLookup)) {
        throw new Error("Unexpected ABI lookup response while building contract ABI result.");
    }

    const matchingAbi = getMatchingAbiEntries(fullLookup.abi, args.functionName);
    const signature = matchingAbi?.length ? matchingAbi.map(toFunctionSignature).join(", ") : null;
    const warnings: string[] = [];

    if (args.functionName && !matchingAbi?.length) {
        warnings.push(`Function '${args.functionName}' was not found in the verified ABI.`);
    }

    return {
        chain: args.chain,
        contractAddress: args.contractAddress,
        functionName: args.functionName ?? null,
        signature,
        matchingAbi,
        matchingAbiJson: matchingAbi ? JSON.stringify(matchingAbi) : null,
        abi: fullLookup.abi,
        abiJson: fullLookup.abiJson,
        functions: fullLookup.functions,
        source: fullLookup.source,
        error: null,
        warnings,
    };
}
// JSON Schema parameters for tool validation
const parameters: ToolParameters = {
    type: "object",
    properties: {
        contractAddress: {
            type: "string",
            pattern: "^0x[a-fA-F0-9]{40}$",
            description: "Ethereum-compatible contract address",
            nullable: true,
            default: null,
        },
        chain: {
            type: "string",
            description: "Chain key supported by viemChains, e.g. 'polygon', 'ethereum', 'bsc'",
            nullable: true,
            default: null,
        },
        functionName: {
            type: "string",
            description:
                "Optional exact function name to verify against the ABI. Use the same function name you plan to pass into read_contract.",
            nullable: true,
            default: null,
        },
        queries: {
            type: "array",
            minimum: 1,
            nullable: true,
            description:
                "Optional batched ABI lookups. Prefer a single queries array when you need ABI metadata for several contract reads in the same turn.",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["contractAddress", "chain", "functionName"],
                properties: {
                    contractAddress: {
                        type: "string",
                        pattern: "^0x[a-fA-F0-9]{40}$",
                        description: "Ethereum-compatible contract address for this lookup.",
                    },
                    chain: {
                        type: "string",
                        description: "Chain key supported by viemChains for this lookup.",
                    },
                    functionName: {
                        type: "string",
                        description:
                            "Optional exact function name to verify and extract a matching ABI fragment for this lookup.",
                        nullable: true,
                        default: null,
                    },
                },
            },
        },
        fields: {
            type: "array",
            minimum: 1,
            nullable: true,
            default: null,
            description:
                "Optional response fields for ABI lookups, such as ['contractAddress', 'functionName', 'matchingAbiJson', 'source'] or ['functions', 'warnings']. Leave null to use the compact default summary. Requests for abi or abiJson are normalized toward compact output unless a function-scoped matchingAbi or matchingAbiJson response can be returned instead.",
            items: {
                type: "string",
                enum: [...FETCH_CONTRACT_ABI_FIELDS],
            },
        },
    },
    required: ["contractAddress", "chain", "functionName", "queries", "fields"],
    additionalProperties: false,
};

export const fetchContractAbiTool: ToolConfig<
    FetchContractAbiArgs,
    string | string[] | ContractAbiLookupResult
> = {
    tool: {
        type: "function",
        name: "fetch_contract_abi",
        description:
            "Fetch the verified contract ABI for a given contract address and chain, optionally returning a specific function signature. Falls back to Sourcify when explorer lookup is unavailable.",
        parameters,
        strict: true,
        handler: async (args,
            // context: { secure: SecureType; services: ServiceType }
        ) => {
            if (args.queries?.length) {
                const results = await Promise.all(
                    args.queries.map(async (query: FetchContractAbiQuery) => {
                        const normalizedProjection = normalizeFetchContractAbiFields(args.fields, query.functionName);

                        try {
                            const result = appendAbiLookupWarnings(
                                await buildBatchAbiLookupResult(query),
                                normalizedProjection.warnings
                            );
                            return projectFetchContractAbiFields(
                                result,
                                normalizedProjection.fields
                            );
                        } catch (error: any) {
                            return projectFetchContractAbiFields(
                                appendAbiLookupWarnings(
                                    {
                                        chain: query.chain,
                                        contractAddress: query.contractAddress,
                                        functionName: query.functionName ?? null,
                                        signature: null,
                                        matchingAbi: null,
                                        matchingAbiJson: null,
                                        abi: null,
                                        abiJson: null,
                                        functions: null,
                                        source: null,
                                        error: `Failed to fetch ABI: ${error.message || error}`,
                                        warnings: [],
                                    },
                                    normalizedProjection.warnings
                                ),
                                normalizedProjection.fields
                            );
                        }
                    })
                );

                return { results };
            }

            if (!args.contractAddress || !args.chain) {
                throw new Error(
                    "Provide either a non-empty queries array or the single-call fields contractAddress and chain."
                );
            }

            try {
                const normalizedProjection = normalizeFetchContractAbiFields(args.fields, args.functionName);
                const result = appendAbiLookupWarnings(await buildSingleAbiLookupResult({
                    contractAddress: args.contractAddress,
                    chain: args.chain,
                    functionName: args.functionName ?? null,
                }), normalizedProjection.warnings);
                return projectFetchContractAbiFields(
                    result,
                    normalizedProjection.fields
                );
            } catch (error: any) {
                throw new Error(`Failed to fetch ABI: ${error.message || error}`);
            }
        },
        exampleCalls: [
            {
                contractAddress: "0x86935F11C86623deC8a25696E1C19a8659CbF95d",
                chain: "polygon",
            },
            {
                contractAddress: "0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413",
                chain: "ethereum",
                functionName: "transfer",
            },
            {
                queries: [
                    {
                        contractAddress: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
                        chain: "base",
                        functionName: "WETH",
                    },
                    {
                        contractAddress: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
                        chain: "base",
                        functionName: "factory",
                    },
                ],
                fields: ["contractAddress", "functionName", "matchingAbiJson", "source", "warnings"],
            },
        ],
    },
    info: {
        category: "smartcontract",
        riskLevel: "low",
        readOnly: true,
        access: "read",
        mode: "analyze",
        provider: "onchain",
        version: "v1.3.0",
        definition:
            "Fetches verified ABI metadata for a contract on a selected chain. Use this before read or write contract tools when ABI fragments are missing or when you need to validate available functions. If you already know the function you need, pass that exact functionName first and keep it aligned with the later read_contract call. After ABI lookup, if you need multiple contract reads in the same turn, bundle them into one read_contract call using its queries array. Prefer the queries array when you need several ABI lookups in one turn, and use fields to keep results compact. By default this tool returns a compact summary rather than the full ABI, and oversized requests for abi or abiJson are normalized toward compact output or function-scoped matchingAbiJson when possible. For function-specific lookups, matchingAbiJson is the preferred ABI fragment to pass into read_contract.",
    },
};