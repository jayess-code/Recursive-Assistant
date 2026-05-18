import { Hash } from "viem";
import { createViemPublicClient } from "../../../../clients/viem/createViemPublicClient";
import { ChainKey } from "../../../../clients/viem/viem-types";

export type GetTransactionReceiptArgs = {
    chain: ChainKey;
    hash: Hash;
}

function extractReceiptInfo(receipt: any) {
    return {
        status: receipt.status,
        hash: receipt.transactionHash,
        ...(receipt.status === 'reverted' && { error: 'Transaction reverted' })
    };
}

export async function getTransactionReceipt(args: GetTransactionReceiptArgs) {
    const [publicClient] = createViemPublicClient(args.chain);
    if (!publicClient) {
        throw new Error(`Unable to create public client for chain ${args.chain}.`);
    }
    const receipt = await publicClient.getTransactionReceipt({ hash: args.hash });

    return extractReceiptInfo(receipt);
}