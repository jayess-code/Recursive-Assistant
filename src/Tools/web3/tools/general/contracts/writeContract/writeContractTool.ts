import type { Abi, Address } from "viem";
import { ChainKey, PrivateKey } from "../../../../clients/viem/viem-types";
import type { ToolConfig, ToolParameters } from "../../../../../../Runtime/ToolExecutor/toolConfig";
import { createViemWalletClient } from "../../../../clients/viem/createViemWalletClient";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";


interface WriteContractArgs {
  privatekey?: PrivateKey | null;
  chain: ChainKey;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[] | null;
  value?: string | null;
  dryRun?: boolean | null;
}

const parameters: ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["chain", "address", "abi", "functionName"],
  properties: {
    privatekey: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{64}$",
      description: "Optional private key override for signing.",
      nullable: true,
      default: null,
    },
    chain: {
      type: "string",
      description: "Blockchain network to interact with.",
    },
    address: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Contract address to call.",
    },
    abi: {
      type: "array",
      description: "Contract ABI used to encode the write call.",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
    functionName: {
      type: "string",
      description: "Name of the contract function to execute.",
    },
    args: {
      type: "array",
      description: "Function arguments in ABI order.",
      nullable: true,
      default: null,
      items: {
        type: ["string", "number", "boolean", "object", "array"],
      },
    },
    value: {
      type: "string",
      description: "Optional native token value to send in wei.",
      nullable: true,
      default: null,
    },
    dryRun: {
      type: "boolean",
      description: "If true, simulate the contract write without broadcasting.",
      nullable: true,
      default: true,
    },
  },
};

export const writeContractTool: ToolConfig<WriteContractArgs> = {
  tool: {
    type: "function",
    name: "write_contract",
    description:
      "Simulate or execute a generic smart contract write call using an ABI, function name, and arguments.",
    parameters,
    strict: true,
    handler: async (args) => writeContract(args),
  },
  info: {
    category: "crypto",
    subcategory: "contracts",
    tags: ["smartcontract", "contracts", "write"],
    riskLevel: "high",
    readOnly: false,
    access: "write",
    mode: "execute",
    requiresConfirmation: true,
    provider: "onchain",
    version: "v1.0.0",
    definition:
      "Simulates or executes a generic state-changing smart contract function on any target contract using the supplied chain, contract address, ABI, function name, arguments, and optional native value in wei. Use dryRun=true to simulate and inspect the request first, and set dryRun=false to broadcast the write transaction.",
  },
};

async function writeContract({
  privatekey,
  chain,
  address,
  abi,
  functionName,
  args,
  value,
  dryRun = true,
}: WriteContractArgs) {
  try {
    const adminKey = process.env.NEO_PRIVATE_KEY as PrivateKey | undefined;
    const resolvedPrivateKey = privatekey ?? adminKey;

    if (!resolvedPrivateKey) {
      return {
        success: false,
        error: "Private keys for the requested wallet are missing please configure",
      };
    }

    const walletClient = createViemWalletClient(chain, resolvedPrivateKey);
    const publicClient = getViemPublicClient(chain);

    const simulation = await publicClient.simulateContract({
      account: walletClient.account,
      address,
      abi,
      functionName,
      args: args ?? [],
      value: value ? BigInt(value) : undefined,
    });

    if (dryRun) {
      return {
        success: true,
        data: JSON.stringify({
          hash: null,
          simulated: true,
          canExecute: true,
          estimatedGas: simulation.request.gas?.toString() ?? null,
          request: {
            chain,
            address,
            functionName,
            args: args ?? [],
            value: value ?? null,
          },
          message: "Contract write simulation completed successfully",
        }),
      };
    }

    const hash = await walletClient.writeContract(simulation.request);

    return {
      success: true,
      data: JSON.stringify({
        hash,
        simulated: false,
        message: `Contract write executed successfully. Hash: ${hash}`,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to execute contract write: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}
