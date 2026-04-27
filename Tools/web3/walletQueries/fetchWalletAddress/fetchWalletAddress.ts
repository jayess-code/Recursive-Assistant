
// import { Address, ChainKey, PrivateKey } from "../types/viemChains-types";
// import { createViemWalletClient } from "../client/createWalletClient";
// import { getChainInfoForQuery } from "../../tools/finance/web3/wallet/getFilteredChainInfo";

// export async function fetchWalletAddress(
//   chainKey: ChainKey,
//   privateKey: PrivateKey
// ): Promise<Address> {
//   // ✅ Validate and get chain info
//   // const chainInfo = getChainInfoForQuery(chainKey);

//   // Now safe to execute RPC
//   const { account } = createViemWalletClient(chainKey, privateKey);
//   return account.address || "";
// }
