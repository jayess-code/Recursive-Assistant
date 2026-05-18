import { Abi, encodeDeployData, formatUnits } from "viem";
import { ChainKey } from "../../../../clients/viem/viem-types";
import { getViemPublicClient } from "../../../../clients/viem/getViemPublicClient";

export interface EstimateContractDeploymentArgs {
	chain: ChainKey;
	bytecode: `0x${string}`;
	abi: Abi;
	constructorArgs?: unknown[] | null;
}

export async function estimateContractDeployment(args: EstimateContractDeploymentArgs): Promise<{
	chain: ChainKey;
	estimatedGas: string;
	gasPriceGwei: string;
	estimatedCostETH: string;
}> {
	const { chain, bytecode, abi, constructorArgs = [] } = args;
	const publicClient = getViemPublicClient(chain);

	const deployData = encodeDeployData({
		abi,
		bytecode,
		args: constructorArgs ?? [],
	});

	const estimatedGas = await publicClient.estimateGas({ data: deployData });
	const gasPrice = await publicClient.getGasPrice();
	const estimatedCostWei = estimatedGas * gasPrice;

	return {
		chain,
		estimatedGas: estimatedGas.toString(),
		gasPriceGwei: formatUnits(gasPrice, 9),
		estimatedCostETH: formatUnits(estimatedCostWei, 18),
	};
}
