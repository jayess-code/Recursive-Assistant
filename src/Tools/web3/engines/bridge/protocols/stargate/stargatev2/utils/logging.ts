export function formatValidationReason(reasons: Array<string | undefined>): string | undefined {
  const merged = [...new Set(reasons.filter((value): value is string => Boolean(value?.trim())))];
  return merged.length ? merged.join(" | ") : undefined;
}
