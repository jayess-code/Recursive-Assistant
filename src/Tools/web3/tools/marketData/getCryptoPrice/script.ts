import * as readline from "readline";
import dotenv from "dotenv";
import { parseCliArgs } from "@/Tools/script";
import { CexCryptoPriceTool } from "./getCryptoPricesTool";
import type { CryptoPriceArgs } from "./getCryptoPrices";

dotenv.config();

function parseSymbols(raw?: string): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function run() {
  const cli = parseCliArgs(process.argv.slice(2));

  let symbols = parseSymbols(cli.symbols);
  if (!symbols.length) {
    const input = await askQuestion("Enter symbols (comma-separated, e.g. BTC,ETH,DOGE): ");
    symbols = parseSymbols(input);
  }

  if (!symbols.length) {
    throw new Error("At least one symbol is required. Use symbols=BTC,ETH or enter symbols when prompted.");
  }

  const currency = String(cli.currency ?? "USD").trim().toUpperCase() || "USD";

  const args: CryptoPriceArgs = {
    symbols,
    currency,
  };

  console.log("\nCalling cex_crypto_prices_tool with:");
  console.log(JSON.stringify(args, null, 2));

  const result = await CexCryptoPriceTool.tool.handler(args, {});

  console.log("\nTool result:");
  console.log(JSON.stringify(result, null, 2));


}

run().catch((err) => {
  console.error("\nScript failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
