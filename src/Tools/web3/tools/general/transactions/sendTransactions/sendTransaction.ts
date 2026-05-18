import { Hex, parseEther, parseUnits } from "viem";
import { Address, ChainKey } from "../../../../clients/viem/viem-types";
import { createViemWalletClient } from "../../../../clients/viem/createViemWalletClient";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";

/**
 * Tool arguments for sending a transaction
 */
export type SendTransactionArgs = {
  chain: ChainKey; // Blockchain network
  to: Address; // Recipient address
  value?: string | null; // ETH to send (in Ether)
  data?: `0x${string}` | null; // Contract call data
  nonce?: number | null;
  gasPrice?: string | null; // Gwei
  accessList?: AccessList | null;
  factoryDeps?: `0x${string}`[] | null;
  paymaster?: Address | null;
  paymasterInput?: `0x${string}` | null;
  dryRun?: boolean | null;
}

export type AccessList = readonly {
  address: Address
  storageKeys: readonly Hex[]
}[]


export async function sendTransaction(args: SendTransactionArgs) {
  const adminKey = process.env.NEO_PRIVATE_KEY;
  if (!adminKey) {
    throw new Error("NEO_PRIVATE_KEY is missing");
  }

  const client = createViemWalletClient(args.chain);

  if (args.dryRun) {
    const publicClient = getViemPublicClient(args.chain);
    const estimatedGas = await publicClient.estimateGas({
      account: client.account,
      to: args.to,
      value: args.value ? parseEther(args.value) : undefined,
      data: args.data ?? undefined,
      nonce: args.nonce ?? undefined,
    });

    return {
      success: true,
      hash: null,
      simulated: true,
      canExecute: true,
      estimatedGas: estimatedGas.toString(),
      message: "Transaction simulation completed successfully",
    };
  }

  const hash = await client.sendTransaction({
    chain: client.chain,
    to: args.to,
    value: args.value ? parseEther(args.value) : undefined,
    data: args.data ?? undefined,
    nonce: args.nonce ?? undefined,
    gasPrice: args.gasPrice ? parseUnits(args.gasPrice, 9) : undefined,
    accessList: args.accessList ?? undefined,
    customData: {
      factoryDeps: args.factoryDeps,
      paymaster: args.paymaster,
      paymasterInput: args.paymasterInput,
    },
  });

  return { success: true, hash, message: `Transaction sent successfully. Hash: ${hash}` };
}
