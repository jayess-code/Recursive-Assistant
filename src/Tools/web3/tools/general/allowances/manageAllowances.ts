import { Address, getAddress, Hash } from "viem";
import { createViemWalletClient } from "../../../clients/viem/createViemWalletClient";
import { readContract } from "../contracts/readContracts/readContract";
import { ERC20_ABI } from "../../../utils/const/ERC20_ABI";
import { ChainKey } from "../../../clients/viem/viem-types";
import { projectFields } from "../../types/projectFields";

export interface AllowanceQuery {
  chain: ChainKey;
  tokenAddress: Address;
  spenderAddress: Address;
  ownerAddress: Address;
  amount?: string | null;
  action: "approve" | "revoke" | "read";
  dryRun?: boolean | null;
}

export interface ManageAllowancesArgs {
  queries: AllowanceQuery[];
  dryRun?: boolean | null;
  fields?: string[] | null;
}

export async function manageAllowances(args: ManageAllowancesArgs) {
  try {
    const results = await Promise.all(
      args.queries.map(async (query) => {
        try {
          if (args.dryRun) {
            const dryRunEntry: Record<string, unknown> = {
              chain: query.chain,
              tokenAddress: query.tokenAddress,
              ownerAddress: query.ownerAddress,
              spenderAddress: query.spenderAddress,
              action: query.action,
              amount: query.amount ?? null,
              dryRun: true,
              message: `dryRun: would ${query.action} allowance${query.amount ? ` of ${query.amount}` : ""}`,
            };

            return !args.fields?.length ? dryRunEntry : projectFields(dryRunEntry, args.fields);
          }

          const result = await executeAllowanceAction(query);
          const isRead = query.action === "read";

          const entry: Record<string, unknown> = {
            chain: query.chain,
            tokenAddress: query.tokenAddress,
            ownerAddress: query.ownerAddress,
            spenderAddress: query.spenderAddress,
            action: query.action,
            amount: query.amount ?? null,
            ...(isRead ? { allowance: result } : { txHash: result }),
          };

          return !args.fields?.length ? entry : projectFields(entry, args.fields);
        } catch (error) {
          const failedEntry: Record<string, unknown> = {
            chain: query.chain,
            tokenAddress: query.tokenAddress,
            ownerAddress: query.ownerAddress,
            spenderAddress: query.spenderAddress,
            action: query.action,
            amount: query.amount ?? null,
            error: error instanceof Error ? error.message : String(error),
          };

          return !args.fields?.length ? failedEntry : projectFields(failedEntry, args.fields);
        }
      })
    );

    const payload = results.length === 1 ? results[0] : results;

    return {
      success: true,
      data: JSON.stringify(payload),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to manage allowances: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeAllowanceAction(query: AllowanceQuery): Promise<Hash | string> {
  if (query.action === "read") return (await getTokenAllowance(query)).toString();
  if (query.action === "approve") return approveAllowance(query);
  if (query.action === "revoke") return revokeAllowance(query);
  throw new Error(`Unknown action: ${query.action}`);
}

export async function getTokenAllowance(args:AllowanceQuery): Promise<bigint> {
  const normalizedTokenAddress = getAddress(args.tokenAddress);
  const normalizedOwnerAddress = getAddress(args.ownerAddress);
  const normalizedSpenderAddress = getAddress(args.spenderAddress);

  return await readContract<bigint>({
    contract: normalizedTokenAddress,
    functionName: "allowance",
    args: [normalizedOwnerAddress, normalizedSpenderAddress],
    abi: ERC20_ABI,
    chain:args.chain,
  });
}

export async function approveAllowance(args: AllowanceQuery): Promise<Hash> {
  if (!args.amount) {
    throw new Error("Amount is required for approve action");
  }
  const walletClient = createViemWalletClient(args.chain);
  const txHash = await walletClient.writeContract({
    address: args.tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [args.spenderAddress, args.amount],
  }); 
  return txHash;
}

export async function revokeAllowance(args: AllowanceQuery): Promise<Hash> {
  const walletClient = createViemWalletClient(args.chain);
  const txHash = await walletClient.writeContract({
    address: args.tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [args.spenderAddress, "0"],
  }); 
  return txHash;
}

