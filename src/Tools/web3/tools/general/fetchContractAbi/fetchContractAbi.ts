
import axios from "axios";
import { ChainKey } from "../../../clients/viem/viem-types";
import { viemChains } from "../../../clients/viem/viemChains";


interface ChainExplorerConfig {
    apiBaseUrl: string;
    apiKeyEnvVar: string;
}

const chainExplorerMap: Record<string, ChainExplorerConfig> = {
    ethereum: {
        apiBaseUrl: "https://api.etherscan.io/api",
        apiKeyEnvVar: "ETHERSCAN_API_KEY",
    },
    base: {
        apiBaseUrl: "https://api.basescan.org/api",
        apiKeyEnvVar: "BASESCAN_API_KEY",
    },
    polygon: {
        apiBaseUrl: "https://api.polygonscan.com/api",
        apiKeyEnvVar: "POLYGONSCAN_API_KEY",
    },
    bsc: {
        apiBaseUrl: "https://api.bscscan.com/api",
        apiKeyEnvVar: "BSCSCAN_API_KEY",
    },
    // Add more chain explorers as needed
};

interface FetchContractAbiArgs {
    contractAddress: string;
    chain: ChainKey;
    functionName?: string;
}

interface ContractAbiLookupResult {
    abi: any[];
    abiJson: string;
    functions: string[];
    source: "explorer" | "sourcify";
}

function extractFunctionSignaturesFromAbi(
    abi: any[],
    functionName?: string
): string | string[] {
    const functions = abi
        .filter(item => item.type === "function")
        .map(fn => `${fn.name}(${(fn.inputs || []).map((i: any) => i.type).join(",")})`);

    if (!functionName) return functions;

    const lower = functionName.toLowerCase();
    const exact = functions.find(f => f.toLowerCase().startsWith(`${lower}(`));
    if (exact) return exact;

    const partial = functions.find(f => f.toLowerCase().includes(lower));
    if (partial) return partial;

    return "Function not found";
}

export async function fetchContractAbi(
    args: FetchContractAbiArgs
): Promise<string | string[] | ContractAbiLookupResult> {
    const { contractAddress, chain } = args;
    const functionName = String(args.functionName ?? "").trim() || undefined;

    if (!(chain in viemChains)) {
        throw new Error(`Unsupported or unknown chain key: ${chain}`);
    }

    const explorerCfg = chainExplorerMap[chain];
    if (!explorerCfg) {
        throw new Error(`No block explorer configuration found for chain '${chain}'.`);
    }

    const chainId = viemChains[chain]?.id;
    if (!chainId) {
        throw new Error(`Unable to resolve chain id for chain '${chain}'.`);
    }

    const fetchAbiFromSourcify = async (): Promise<ContractAbiLookupResult> => {
        const normalizedAddress = contractAddress.toLowerCase();
        const candidateUrls = [
            `https://sourcify.dev/server/repository/contracts/full_match/${chainId}/${normalizedAddress}/metadata.json`,
            `https://sourcify.dev/server/repository/contracts/partial_match/${chainId}/${normalizedAddress}/metadata.json`,
        ];

        let lastError: unknown;

        for (const url of candidateUrls) {
            try {
                const response = await axios.get(url, { timeout: 15000 });
                const abi = response.data?.output?.abi;

                if (!Array.isArray(abi)) {
                    throw new Error("Sourcify metadata did not contain output.abi array.");
                }

                const functions = abi
                    .filter((item: any) => item.type === "function")
                    .map((fn: any) => fn.name);

                return {
                    abi,
                    abiJson: JSON.stringify(abi),
                    functions,
                    source: "sourcify",
                };
            } catch (error) {
                lastError = error;
            }
        }

        const message = lastError instanceof Error ? lastError.message : String(lastError ?? "Unknown error");
        throw new Error(`Sourcify lookup failed: ${message}`);
    };

    const fetchAbiFromExplorer = async (): Promise<ContractAbiLookupResult> => {
        const resolvedApiKey = process.env[explorerCfg.apiKeyEnvVar];
        if (!resolvedApiKey) {
            throw new Error(
                `API key for ${chain} explorer not set in environment variable: ${explorerCfg.apiKeyEnvVar}`
            );
        }

        const url = `${explorerCfg.apiBaseUrl}?module=contract&action=getabi&address=${contractAddress}&apikey=${resolvedApiKey}`;

        const response = await axios.get(url, { timeout: 15000 });
        const data = response.data;

        if (data.status !== "1") {
            throw new Error(`Explorer API error: ${data.result || data.message || "Unknown error"}`);
        }

        const abi = JSON.parse(data.result);
        const functions = abi
            .filter((item: any) => item.type === "function")
            .map((fn: any) => fn.name);

        return {
            abi,
            abiJson: JSON.stringify(abi),
            functions,
            source: "explorer",
        };
    };

    let lookupResult: ContractAbiLookupResult;
    try {
        lookupResult = await fetchAbiFromExplorer();
    } catch {
        lookupResult = await fetchAbiFromSourcify();
    }

    if (functionName) {
        return extractFunctionSignaturesFromAbi(lookupResult.abi, functionName);
    }

    return lookupResult;
}