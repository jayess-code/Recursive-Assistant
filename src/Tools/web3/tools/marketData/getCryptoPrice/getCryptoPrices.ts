export interface CryptoPriceArgs {
    symbols: string[]; // e.g., ['BTC', 'ETH']
    currency?: string | null; // e.g., 'USD'
    //provider?: string; // e.g., 'CoinMarketCap', 'CoinGecko'
}
export async function getCexCryptoPricesBatch(args: CryptoPriceArgs, context?: string): Promise<Record<string, any>> {

     const queries = args.symbols.map((symbol: string) => ({
                symbol,
                currency: args.currency || "USD",
            }));
    const apiKey =  process.env.COINMARKETCAP_API_KEY;
    if (!apiKey) throw new Error("CoinMarketCap API key is not set");

    // Extract unique symbols and currency from args.queries
    const symbolsParam = Array.from(new Set(queries.map(q => q.symbol))).join(",");
    const currencyParam = queries[0]?.currency || "USD";

    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${symbolsParam}&convert=${currencyParam}`;

    // Here you would call fetch(url, ...) to get real data instead of mock
    const response = await fetch(url, {
        headers: { 
            "X-CMC_PRO_API_KEY": apiKey, 
            Accept: "application/json" },
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error fetching data: ${response.statusText}. Details: ${errText}`);
    }

    const data = await response.json();
    // Simulate a response mapping for each symbol in queries
    const result: Record<string, any> = {};
    for (const { symbol, currency } of queries) {
        // The API response data format:
        // data.data[symbol] is an array with first element containing quotes
        // Adjust this extraction if the API structure differs.
        const symbolDataArray = data.data?.[symbol];
        const symbolData = Array.isArray(symbolDataArray) ? symbolDataArray[0] : undefined;
        console.log(`symboldata for ${symbol}:`, symbolData);   
        const quoteData = symbolData?.quote?.[currency];

        if (!quoteData) {
            result[symbol] = { [currency]: null };
        } else {
            result[symbol] = {
                [currency]: quoteData,
            };
        }
    }
    // console.log("Fetched crypto prices:", result);
    return result;
}