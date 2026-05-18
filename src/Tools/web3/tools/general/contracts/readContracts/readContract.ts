import { Address, ChainKey } from "../../../../clients/viem/viem-types";
import {
  parseAbiInput,
  parseArgsInput,
  projectReadContractFields,
  serializeContractReadResult,
} from "./readContractFormatting";
import {
  readContract as readContractViem,
  type ReadContractArgs,
} from "./readContractViem";

// ---- Tool-level types ----

export interface ReadContractHandlerArgs {
  contract?: Address | null;
  functionName?: string | null;
  args?: any[] | null;
  argsJson?: string | null;
  abi?: any[] | string | null;
  chain?: ChainKey | null;
  queries?: ReadContractQueryInput[] | null;
  fields?: string[] | null;
}

export interface ReadContractQueryInput {
  contract: Address;
  functionName: string;
  args?: any[] | null;
  argsJson?: string | null;
  abi: any[] | string;
  chain: ChainKey;
}

export const READ_CONTRACT_RESULT_FIELDS = [
  "chain",
  "contract",
  "functionName",
  "args",
  "result",
  "error",
  "warnings",
] as const;

async function executeReadContractQuery(query: ReadContractQueryInput): Promise<unknown> {
  const parsedAbi = parseAbiInput(query.abi);
  const parsedArgs = parseArgsInput(query.args, query.argsJson);
  const result = await readContract({ ...query, args: parsedArgs, abi: parsedAbi });
  return serializeContractReadResult(result);
}

export async function executeReadContract(args: ReadContractHandlerArgs): Promise<unknown> {
  try {
    if (args.queries?.length) {
      const results = await Promise.all(
        args.queries.map(async (query: ReadContractQueryInput) => {
          const parsedArgs = (() => {
            try {
              return parseArgsInput(query.args, query.argsJson);
            } catch {
              return query.args ?? [];
            }
          })();

          try {
            const result = await executeReadContractQuery(query);
            return projectReadContractFields(
              {
                chain: query.chain,
                contract: query.contract,
                functionName: query.functionName,
                args: parsedArgs,
                result,
                error: null,
                warnings: [],
              },
              args.fields,
              READ_CONTRACT_RESULT_FIELDS
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return projectReadContractFields(
              {
                chain: query.chain,
                contract: query.contract,
                functionName: query.functionName,
                args: parsedArgs,
                result: null,
                error: message,
                warnings: [],
              },
              args.fields,
              READ_CONTRACT_RESULT_FIELDS
            );
          }
        })
      );

      return {
        success: true,
        data: JSON.stringify({ results }),
      };
    }

    if (!args.contract || !args.functionName || !args.abi || !args.chain) {
      return {
        success: false,
        error:
          "Provide either a non-empty queries array or the single-call fields contract, functionName, abi, and chain.",
      };
    }

    const result = await executeReadContractQuery({
      contract: args.contract,
      functionName: args.functionName,
      args: args.args ?? [],
      argsJson: args.argsJson ?? null,
      abi: args.abi,
      chain: args.chain,
    });

    return {
      success: true,
      data: JSON.stringify(result),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read contract: ${error instanceof Error ? error.message : String(error)}`,
    };
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
    return readContractViem<T>({
      contract,
      functionName,
      args,
      abi,
      chain,
      ...(maxRetries !== undefined ? { maxRetries } : {}),
    });
}