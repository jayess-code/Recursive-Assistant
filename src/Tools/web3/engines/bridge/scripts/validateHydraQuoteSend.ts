import dotenv from "dotenv";
import { Address, getAddress } from "viem";
import { getLayerZeroV2EndpointId } from "../shared/layerZeroV2MetadataRegistry";
import { getViemPublicClient } from "../../../clients/viem/getViemPublicClient";
import { resolveChainKey } from "../../../clients/viem/viemChains";
import { buildOftQuoteParams } from "../protocols/stargate/stargatev2/StargateV2TokenResolver";

dotenv.config();

type CliMap = Record<string, string>;

const QUOTE_ABI = [
  {
    name: "quoteSend",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
      },
      { name: "payInLzToken", type: "bool" },
    ],
    outputs: [
      { name: "nativeFee", type: "uint256" },
      { name: "lzTokenFee", type: "uint256" },
    ],
  },
  {
    name: "quoteOFT",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "_sendParam",
        type: "tuple",
        components: [
          { name: "dstEid", type: "uint32" },
          { name: "to", type: "bytes32" },
          { name: "amountLD", type: "uint256" },
          { name: "minAmountLD", type: "uint256" },
          { name: "extraOptions", type: "bytes" },
          { name: "composeMsg", type: "bytes" },
          { name: "oftCmd", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "limit",
        type: "tuple",
        components: [
          { name: "minAmountLD", type: "uint256" },
          { name: "maxAmountLD", type: "uint256" },
        ],
      },
      {
        name: "oftFeeDetails",
        type: "tuple[]",
        components: [
          { name: "feeAmountLD", type: "int256" },
          { name: "description", type: "string" },
        ],
      },
      {
        name: "receipt",
        type: "tuple",
        components: [
          { name: "amountSentLD", type: "uint256" },
          { name: "amountReceivedLD", type: "uint256" },
        ],
      },
    ],
  },
] as const;

function parseCliArgs(argv: string[]): CliMap {
  const args: CliMap = {};
  for (const entry of argv) {
    const [key, ...rest] = entry.split("=");
    if (!key || rest.length === 0) continue;
    args[key.trim()] = rest.join("=").trim();
  }
  return args;
}

function getRequiredString(args: CliMap, key: string): string {
  const value = args[key];
  if (!value?.trim()) throw new Error(`Missing required CLI argument: ${key}=...`);
  return value.trim();
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_, current) => (typeof current === "bigint" ? current.toString() : current), 2);
}

async function validateMode(
  fromChain: string,
  toChain: string,
  token: Address,
  recipient: Address,
  amount: bigint,
  transportMode: "taxi" | "bus"
) {
  const client = getViemPublicClient(resolveChainKey(fromChain));
  const dstEid = await getLayerZeroV2EndpointId(resolveChainKey(toChain));

  const baseParams = buildOftQuoteParams({
    dstEid,
    recipient,
    amount,
    transportMode,
  });

  const quoteOft = await client.readContract({
    address: token,
    abi: QUOTE_ABI,
    functionName: "quoteOFT",
    args: [baseParams],
  });

  const receipt = Array.isArray(quoteOft)
    ? (quoteOft[2] as { amountReceivedLD?: bigint })
    : ((quoteOft as { receipt?: { amountReceivedLD?: bigint } }).receipt ?? {});

  if (receipt.amountReceivedLD == null) {
    throw new Error("quoteOFT returned no amountReceivedLD");
  }

  const quoteParams = buildOftQuoteParams({
    dstEid,
    recipient,
    amount,
    transportMode,
    minAmountLD: receipt.amountReceivedLD,
  });

  const quoteSend = await client.readContract({
    address: token,
    abi: QUOTE_ABI,
    functionName: "quoteSend",
    args: [quoteParams, false],
  });

  return {
    transportMode,
    baseParams,
    quoteParams,
    quoteOFT: {
      amountReceivedLD: receipt.amountReceivedLD,
    },
    quoteSend,
  };
}

async function run() {
  const cli = parseCliArgs(process.argv.slice(2));
  const fromChain = getRequiredString(cli, "fromChain");
  const toChain = getRequiredString(cli, "toChain");
  const token = getAddress(getRequiredString(cli, "token"));
  const recipient = getAddress(getRequiredString(cli, "recipient"));
  const amount = BigInt(getRequiredString(cli, "amount"));
  const modeArg = (cli.transportMode?.trim().toLowerCase() ?? "all") as "taxi" | "bus" | "all";
  const modes: Array<"taxi" | "bus"> = modeArg === "all" ? ["taxi", "bus"] : [modeArg];

  console.log("\nOFT quote validation\n");
  console.log(`fromChain=${fromChain}`);
  console.log(`toChain=${toChain}`);
  console.log(`token=${token}`);
  console.log(`recipient=${recipient}`);
  console.log(`amount=${amount}`);

  for (const mode of modes) {
    try {
      const result = await validateMode(fromChain, toChain, token, recipient, amount, mode);
      console.log(`\n✅ ${mode} quote succeeded`);
      console.log(stringify(result));
    } catch (error) {
      console.log(`\n❌ ${mode} quote failed`);
      console.log(error instanceof Error ? error.message : String(error));
    }
  }
}

run().catch((error) => {
  console.error("\nOFT validation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
