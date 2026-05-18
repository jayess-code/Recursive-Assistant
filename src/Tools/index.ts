import { getWeatherTool } from "./geographic/getWeather/getWeatherTool";
import type { ToolConfig } from "../Runtime/ToolExecutor/toolConfig";
import { sendTransactionTool } from "../Tools/web3/tools/general/transactions/sendTransactions/sendTransactionTool";
import { getAvailableChainsTool } from "./web3/tools/general/chains/chainMetadata/getChainMetaDataTool";
import { getWalletAddressTool } from "./web3/tools/general/fetchWalletAddress/getWalletAddressTool";
import { getWalletBalancesTool } from "./web3/tools/general/balances/walletBalances/getWalletBalancesTool";
import { getPortfolioBalancesTool } from "./web3/tools/general/balances/enrichedPortfolio/getPortfolioBalancesTool";
import { fetchTokenPairsTool } from "./web3/tools/marketData/pairs/fetchTokenPairsTool";
import { bridgeDiscoveryTool, bridgeExecuteTool, bridgeQuoteTool, bridgeStatusTool, swapBuildTool, swapDetectTool, swapQuoteTool } from "./web3/tools/index";
import { manageAllowancesTool } from "./web3/tools/general/allowances/manageAllowancesTool";
import { searchTokenTool } from "./web3/tools/marketData/searchToken/searchTokenTool";
export const localTools: Record<string, ToolConfig> = {
    get_weather: getWeatherTool,
    get_available_chains: getAvailableChainsTool,
    get_crypto_wallet_address: getWalletAddressTool,
    get_wallet_balances: getWalletBalancesTool,
    get_portfolio_balances: getPortfolioBalancesTool,
    fetch_token_pairs:fetchTokenPairsTool,
    swap_detect: swapDetectTool,
    swap_quote: swapQuoteTool,
    swap_build:swapBuildTool,
    manage_allowances: manageAllowancesTool,
    send_transaction: sendTransactionTool,
    search_token: searchTokenTool,
    bridge_discovery: bridgeDiscoveryTool,
    bridge_execute: bridgeExecuteTool,
    bridge_quote: bridgeQuoteTool,
    bridge_status: bridgeStatusTool
        

};
