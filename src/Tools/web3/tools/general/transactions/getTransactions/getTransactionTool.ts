import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { getTransactionReceipt, GetTransactionReceiptArgs } from "./getTransaction";

const parameters: ToolParameters =   {
    type: 'object',
    additionalProperties: false,
    properties: {
        hash: {
            type: 'string',
            pattern: '^0x[a-fA-F0-9]{64}$',
            description: 'The transaction hash to get the receipt for',
        },
        chain: {
            type: 'string',
            description: 'The chain to query for the transaction receipt',
        },
    },
    required: ['hash', 'chain']
};

export const getTransactionReceiptTool: ToolConfig<GetTransactionReceiptArgs> = {
    tool: {
        type: 'function',
        name: 'get_transaction_receipt',
        description: 'Get the receipt of a transaction by its hash',
        parameters,
        strict: true,
        handler: async (args) => getTransactionReceipt(args),
    },
    info: {
        category: "utility",
        riskLevel: "low",
        readOnly: true,
        access: "read",
        mode: "analyze",
        provider: "onchain",
        version: "v1.0.0",
        definition: "Fetches the receipt of a submitted transaction by hash. Use after sendTransaction to confirm status, gas used, and whether the tx succeeded or reverted.",
    },
};
