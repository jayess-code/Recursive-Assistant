import dotenv from "dotenv";
import { Address, getAddress } from "viem";
import { StargateCrossChainMatcher, StargateMatchStrategy } from "../protocols/stargate/matcher/StargateCrossChainMatcher";

dotenv.config();

type CliMap = Record<string, string>;

function parseCliArgs(argv: string[]): CliMap {
  const args: CliMap = {};
  for (const entry of argv) {
    const [key, ...rest] = entry.split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    args[key.trim()] = rest.join("=").trim();
  }
  return args;
}

function getRequiredString(args: CliMap, key: string): string {
  const value = args[key];
  if (value == null || value.trim() === "") {
    throw new Error(`Missing required CLI argument: ${key}=...`);
  }
  return value.trim();
}

function getOptionalString(args: CliMap, key: string): string | undefined {
  const value = args[key];
  return value == null || value.trim() === "" ? undefined : value.trim();
}

function getOptionalAddress(args: CliMap, key: string): Address | undefined {
  const value = getOptionalString(args, key);
  return value ? (getAddress(value) as Address) : undefined;
}

function getOptionalBigInt(args: CliMap, key: string): bigint | undefined {
  const value = getOptionalString(args, key);
  return value ? BigInt(value) : undefined;
}

function getOptionalNumber(args: CliMap, key: string): number | undefined {
  const value = getOptionalString(args, key);
  return value ? Number(value) : undefined;
}

function resolveStrategy(value?: string): StargateMatchStrategy {
  if (
    value === "auto" ||
    value === "v1" ||
    value === "v2" ||
    value === "v1_pool" ||
    value === "v2_router" ||
    value === "v2_adapter" ||
    value === "v2_oft"
  ) {
    return value;
  }
  return "auto";
}

function stringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_, current) => (typeof current === "bigint" ? current.toString() : current),
    2
  );
}

function section(title: string) {
  console.log(`\n${"-".repeat(60)}`);
  console.log(title);
  console.log("-".repeat(60));
}

async function run() {
  const cli = parseCliArgs(process.argv.slice(2));
  const fromChain = getRequiredString(cli, "fromChain");
  const toChain = getRequiredString(cli, "toChain");
  const tokenInput = getOptionalString(cli, "tokenAddress") ?? getRequiredString(cli, "token");
  const tokenAddress = getAddress(tokenInput) as Address;
  const routeStrategy = resolveStrategy(getOptionalString(cli, "routeStrategy") ?? getOptionalString(cli, "strategy"));
  const recipient = getOptionalAddress(cli, "recipient");
  const amount = getOptionalBigInt(cli, "amount");
  const slippageBps = getOptionalNumber(cli, "slippageBps");

  section("Stargate cross-chain match");
  console.log(`fromChain=${fromChain}`);
  console.log(`toChain=${toChain}`);
  console.log(`tokenAddress=${tokenAddress}`);
  console.log(`routeStrategy=${routeStrategy}`);
  if (recipient) console.log(`recipient=${recipient}`);
  if (amount != null) console.log(`amount=${amount}`);
  if (slippageBps != null) console.log(`slippageBps=${slippageBps}`);

  const result = await StargateCrossChainMatcher.match({
    fromChain,
    toChain,
    tokenAddress,
    ...(recipient != null ? { recipient } : {}),
    ...(amount != null ? { amount } : {}),
    ...(slippageBps != null ? { slippageBps } : {}),
    routeStrategy,
  });

  section("Result");
  console.log(stringify(result));

  if (!result.supported) {
    console.log(`Unsupported route: ${result.reason ?? "unknown reason"}`);
    return;
  }

  if (result.version === "v1") {
    console.log(
      `Matched V1 poolId=${result.srcPoolId} from ${result.srcToken} to ${result.dstToken} via router ${result.router}.`
    );
    return;
  }

  const routeLabel = result.metadata.executionValid === true ? "validated" : "candidate";
  console.log(
    `Matched V2 ${routeLabel} from ${result.srcToken} to ${result.dstToken} via router ${result.router} using ${result.metadata.executionTarget} execution.`
  );

  if (result.metadata.executionValid !== true) {
    console.log(
      `Execution validation remains ${result.metadata.executionValid}. ${result.reason ?? "Additional route-specific validation may still be required before sending a transaction."}`
    );
  }
}

run().catch((error) => {
  console.error("\nScript failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});