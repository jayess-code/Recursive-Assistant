import { serializeBigIntValues } from "../../../types/serialization";

export function serializeContractReadResult(value: unknown): unknown {
  return serializeBigIntValues(value);
}

export function projectReadContractFields(
  record: Record<string, unknown>,
  fields: string[] | null | undefined,
  allowedFields: readonly string[]
): Record<string, unknown> {
  const normalizedFields = Array.from(new Set((fields ?? []).map((f) => f.trim()).filter(Boolean)));
  if (!normalizedFields.length) {
    return record;
  }

  return Object.fromEntries(
    normalizedFields
      .filter((f) => allowedFields.includes(f))
      .map((f) => [f, record[f]])
  );
}

export function parseAbiInput(abi: any[] | string): any[] {
  if (Array.isArray(abi)) {
    return abi;
  }

  if (typeof abi !== "string" || abi.trim() === "") {
    throw new Error("abi must be a non-empty JSON string representing an ABI array.");
  }

  try {
    const value = JSON.parse(abi);
    if (!Array.isArray(value)) {
      throw new Error("ABI JSON must decode to an array.");
    }

    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse abi JSON string: ${message}`);
  }
}

export function parseArgsInput(args?: any[] | null, argsJson?: string | null): any[] {
  if (typeof argsJson === "string") {
    const trimmed = argsJson.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "undefined" || /^,+$/.test(trimmed)) {
      return args ?? [];
    }

    try {
      const value = JSON.parse(trimmed);
      if (!Array.isArray(value)) {
        throw new Error("argsJson must decode to an array.");
      }

      return value;
    } catch (error) {
      if (args?.length) {
        return args;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse argsJson: ${message}`);
    }
  }

  return args ?? [];
}
