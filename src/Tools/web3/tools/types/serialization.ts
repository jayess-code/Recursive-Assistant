export function serializeBigIntValues<T>(value: T): T {
  if (typeof value === "bigint") {
    return value.toString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeBigIntValues(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        serializeBigIntValues(nestedValue),
      ])
    ) as T;
  }

  return value;
}