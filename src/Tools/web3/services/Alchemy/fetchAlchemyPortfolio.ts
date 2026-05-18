
export interface GetAlchemyPortfolioArgs {
    walletAddress: string;
    chain: string;
    apiKey: string;
}
export async function fetchAlchemyPortfolio(args: GetAlchemyPortfolioArgs): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
    try {
        const response = await fetch(`https://alchemy.com/api/${args.chain}/getPortfolio?address=${args.walletAddress}&apiKey=${args.apiKey || process.env.ALCHEMY_API_KEY}`);
        if (!response.ok) {
            throw new Error(`Alchemy API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        results[args.chain] = data;
    } catch (error) {
        results[args.chain] = {
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
    return results;
}