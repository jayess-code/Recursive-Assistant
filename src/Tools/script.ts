import * as readline from "readline";

export type CliMap = Record<string, string>;

export function parseCliArgs(argv: string[]): CliMap {
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

export function getOptionalString(args: CliMap, key: string): string | undefined {
  const value = args[key];
  if (value == null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function getBoolean(args: CliMap, key: string, fallback = false): boolean {
  const value = getOptionalString(args, key);
  if (value == null) {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

export function parseSymbols(raw?: string): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

export function parseFields(raw?: string): string[] | null {
  const fields = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return fields.length ? fields : null;
}

export function askQuestion(question: string): Promise<string> {
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
