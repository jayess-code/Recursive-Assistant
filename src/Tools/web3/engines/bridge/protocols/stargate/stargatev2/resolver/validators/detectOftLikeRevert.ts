export function detectOftLikeRevert(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  const oftSignals = [
    "selector was not recognized",
    "unknown selector",
    "function selector",
    "reverted without reason",
  ];

  return oftSignals.some((signal) => message.includes(signal));
}
