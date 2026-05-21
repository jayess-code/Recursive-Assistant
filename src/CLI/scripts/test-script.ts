import dotenv from "dotenv";
import { askQuestion, parseCliArgs, parseFields, parseIds, parseSymbols } from "@/CLI/utils";


dotenv.config();

async function run() {
    
}

run().catch((err) => {
  console.error("\nScript failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
