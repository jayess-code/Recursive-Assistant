import { getFilteredChainInfo } from "../chainMetadata/chainMetadata";

export interface GetAvailableChainsBooleanArgs {
  chain: string;
}

export async function getAvailableChains(args: GetAvailableChainsBooleanArgs): Promise<boolean> {
  const chain = String(args.chain ?? "").trim();
  if (!chain) {
    return false;
  }

  const matches = getFilteredChainInfo(undefined, [chain], true, 1);
  return matches.length > 0;
}
