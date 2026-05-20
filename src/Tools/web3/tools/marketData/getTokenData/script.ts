import dotenv from "dotenv";
import { askQuestion, parseCliArgs, parseFields, parseSymbols } from "@/Tools/script";
import { TokenDataTool } from "./getTokeneDataTool";
import type { TokenDataArgs } from "./getTokeneData";

dotenv.config();

const DEBUG_FIELDS_PRESET = ["price", "market_cap", "tags", "quote_last_updated"] as const;

function parseIds(raw?: string): number[] | null {
  const ids = (raw ?? "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ids.length ? ids : null;
}

async function run() {
  const cli = parseCliArgs(process.argv.slice(2));
  const debugMode = String(cli.debug ?? "").trim().toLowerCase();
  const ids = parseIds(cli.ids);
  const name = String(cli.name ?? "").trim();

  let symbols = parseSymbols(cli.symbols);
  if (!ids?.length && !symbols.length) {
    const input = await askQuestion("Enter symbols (comma-separated, e.g. BTC,ETH,DOGE): ");
    symbols = parseSymbols(input);
  }

  if (!ids?.length && !symbols.length) {
    throw new Error("At least one symbol or id is required. Use symbols=BTC,ETH or ids=38769,1027.");
  }

  const currency = String(cli.currency ?? "USD").trim().toUpperCase() || "USD";
  const fields = parseFields(cli.fields) ?? (debugMode === "fields" ? [...DEBUG_FIELDS_PRESET] : null);

  // Parse platform/platforms CLI arg (string or comma-separated list)
  let platform: string | string[] | null = null;
  const platformArg = typeof cli.platform === "string" && cli.platform.trim()
    ? cli.platform.trim()
    : (typeof cli.platforms === "string" && cli.platforms.trim() ? cli.platforms.trim() : null);
  if (platformArg) {
    platform = platformArg.includes(",") ? platformArg.split(",").map((p) => p.trim()).filter(Boolean) : platformArg;
  }

  const queries = ids?.length
    ? ids.map((id) => ({ id, symbol: null, name: name || null, ...(platform ? { platform } : {}) }))
    : symbols.map((symbol) => ({ id: null, symbol, name: name || null, ...(platform ? { platform } : {}) }));

  const args: TokenDataArgs = {
    queries,
    currency,
    fields,
  };

  if (debugMode === "fields") {
    console.log("\nRunning token_data_tool fields debug case:");
  } else {
    console.log("\nCalling token_data_tool with:");
  }
  console.log(JSON.stringify(args, null, 2));

  const result = await TokenDataTool.tool.handler(args, {});

  console.log("\nTool result:");
  console.log(JSON.stringify(result, null, 2));


}

run().catch((err) => {
  console.error("\nScript failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
