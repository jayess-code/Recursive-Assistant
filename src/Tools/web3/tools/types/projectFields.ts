export function projectFields<T extends Record<string, unknown>>(
  record: T,
  fields?: readonly string[] | null
): Partial<T> | T {
  if (!fields?.length) {
    return record;
  }

  const projected: Partial<T> = {};

  for (const field of fields) {
    if (field in record) {
      projected[field as keyof T] = record[field as keyof T];
    }
  }

  return projected;
}
