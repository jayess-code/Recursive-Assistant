import type { GetGasPriceArgs } from "./getGasPriceTool.js";

export async function getGasPrice(args: GetGasPriceArgs) {
          return {
            message:"Mocked gas price data based on provided arguments.",
            chain: args.chain,
            feeNative: 0.0025, // Mocked value for testing
            feeETH: 0.0025, // Mocked value for testing
            gasPriceGwei: 50, // Mocked value for testing
            ...classifyGasByCost(0.0025), // Classify based on mocked fee   
          }

}

 function classifyGasByCost(feeNative: number) {
  if (feeNative < 0.001) {
    return { level: "low", advice: "Very cheap to transact." };
  }
  if (feeNative < 0.01) {
    return { level: "normal", advice: "Reasonable cost." };
  }
  if (feeNative < 0.05) {
    return { level: "high", advice: "Slightly expensive." };
  }
  return { level: "extreme", advice: "Expensive transaction. Consider waiting." };
}