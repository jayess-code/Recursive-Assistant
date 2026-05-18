export interface CoinMarketCapContext {
  secrets?: {
    getApiKey: (options: { provider: string; envVar: string; label?: string }) => Promise<string | undefined>;
  };
}

export async function getCoinMarketCapApiKey(context?: CoinMarketCapContext): Promise<string | null> {
  const fromSecrets = context?.secrets
    ? await context.secrets.getApiKey({
        provider: "coinmarketcap",
        envVar: "COINMARKET_API",
      })
    : null;

  const key = fromSecrets ?? process.env.COINMARKET_API ?? null;
  return key && key.trim() ? key.trim() : null;
}

function buildCmcError(status: number, details: string): Error {
  let parsedDetails: unknown = null;

  try {
    parsedDetails = JSON.parse(details);
  } catch {
    parsedDetails = details;
  }

  const statusMessage =
    typeof parsedDetails === "object" &&
    parsedDetails !== null &&
    "status" in parsedDetails &&
    typeof (parsedDetails as { status?: { error_message?: unknown } }).status?.error_message === "string"
      ? (parsedDetails as { status: { error_message: string } }).status.error_message
      : null;

  const fallbackMessage = typeof parsedDetails === "string" ? parsedDetails : details;
  const message = statusMessage ?? fallbackMessage ?? `CoinMarketCap request failed with status ${status}`;

  return new Error(`CoinMarketCap request failed (${status}): ${message}`);
}

export async function fetchCoinMarketCapJson<T>(args: {
  apiKey: string;
  path?: string;
  params?: Record<string, string>;
  url?: string;
}): Promise<T> {
  const url =
    args.url ??
    (args.path
      ? `https://pro-api.coinmarketcap.com${args.path}?${new URLSearchParams(args.params ?? {}).toString()}`
      : null);

  if (!url) {
    throw new Error("fetchCoinMarketCapJson requires either url or path.");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-CMC_PRO_API_KEY": args.apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw buildCmcError(response.status, details);
  }

  return (await response.json()) as T;
}
