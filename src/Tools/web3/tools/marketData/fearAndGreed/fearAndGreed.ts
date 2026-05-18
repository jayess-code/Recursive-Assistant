import {
  fetchCoinMarketCapJson,
  getCoinMarketCapApiKey,
  type CoinMarketCapContext,
} from "../../../services/CoinMarketCap/cmcClient";

export interface GetFearAndGreedArgs {
  mode?: "latest" | "historical";
  start?: number;
  limit?: number;
}

type FearAndGreedPayload = {
  data?: unknown[];
  status?: unknown;
};

export async function getLatestFearAndGreed(apiKey: string) {
  const url = "https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest";
  return fetchCoinMarketCapJson<FearAndGreedPayload>({ url, apiKey });
}

export async function getHistoricalFearAndGreed(apiKey: string, start: number, limit: number) {
  const query = new URLSearchParams({
    start: String(start),
    limit: String(limit),
  });

  const url = `https://pro-api.coinmarketcap.com/v3/fear-and-greed/historical?${query.toString()}`;
  return fetchCoinMarketCapJson<FearAndGreedPayload>({ url, apiKey });
}

export async function getFearAndGreed(args: GetFearAndGreedArgs, context?: CoinMarketCapContext) {
  try {
    const apiKey = await getCoinMarketCapApiKey(context);

    if (!apiKey) {
      return {
        success: false,
        error: "CoinMarketCap API key is not set",
      };
    }

    const normalizedMode = (args.mode ?? "latest").toLowerCase();

    const payload =
      normalizedMode === "historical"
        ? await getHistoricalFearAndGreed(apiKey, args.start ?? 1, args.limit ?? 50)
        : await getLatestFearAndGreed(apiKey);

    return {
      success: true,
      data: JSON.stringify({
        provider: "coinmarketcap",
        mode: normalizedMode,
        data: payload?.data ?? [],
        status: payload?.status ?? null,
        attribution: {
          text: "Data provided by CoinMarketCap.com",
          url: "https://coinmarketcap.com/",
        },
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get fear and greed data: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

