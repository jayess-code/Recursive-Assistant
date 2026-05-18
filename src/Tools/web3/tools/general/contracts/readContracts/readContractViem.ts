import { createViemPublicClient } from "../../../../clients/viem/createViemPublicClient";
import { Address, ChainKey } from "../../../../clients/viem/viem-types";

export interface ReadContractArgs {
  contract: Address;
  functionName: string;
  args?: any[];
  abi: readonly any[];
  chain: ChainKey;
  maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  let current: any = error;

  while (current) {
    const message =
      (typeof current?.message === "string" ? current.message : "") +
      " " +
      (typeof current?.details === "string" ? current.details : "");

    if (
      /\b429\b/.test(message) ||
      /over rate limit/i.test(message) ||
      /rate limit/i.test(message) ||
      /-32016/.test(message)
    ) {
      return true;
    }

    current = current?.cause;
  }

  return false;
}

async function readContractWithRetry<T>(
  publicClient: ReturnType<typeof createViemPublicClient>[number],
  args: ReadContractArgs
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return (await publicClient.readContract({
        address: args.contract,
        abi: args.abi,
        functionName: args.functionName,
        args: args.args ?? [],
      })) as T;
    } catch (error) {
      const maxRetries = args.maxRetries ?? DEFAULT_MAX_RETRIES;
      if (!isRateLimitError(error) || attempt >= maxRetries) {
        throw error;
      }

      const retryDelayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 100);

      console.warn("[readContract] Rate limited by RPC, retrying", {
        functionName: args.functionName,
        contract: args.contract,
        chain: args.chain,
        attempt: attempt + 1,
        retryDelayMs,
      });

      await sleep(retryDelayMs);
      attempt += 1;
    }
  }
}

export async function readContract<T = unknown>({
  contract,
  functionName,
  args = [],
  abi,
  chain,
  maxRetries,
}: ReadContractArgs): Promise<T> {
  const chainKeysArray = Array.isArray(chain) ? chain : [chain];
  const publicClients = createViemPublicClient(chainKeysArray) as ReturnType<typeof createViemPublicClient>[number][];

  const results = await Promise.all(
    publicClients.map(async (publicClient) => {
      return readContractWithRetry<T>(publicClient, {
        contract,
        abi,
        functionName,
        args,
        chain,
        ...(maxRetries !== undefined ? { maxRetries } : {}),
      });
    })
  );

  return (results.length === 1 ? results[0] : results) as T;
}
