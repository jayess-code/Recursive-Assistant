import { Address, getAddress } from "viem";
import { resolveMatchedDstTokenAddress } from "../shared/StargateNormalizer";
import { StargatePoolGraphBuilder } from "../StargatePoolGraphBuilder";

export interface CrossChainMatchRequest {
  fromChain: string;
  toChain: string;
  tokenAddress: Address;
}

export interface CrossChainMatchResult {
  supported: boolean;

  reason?: string;

  fromChain: string;
  toChain: string;

  srcToken: Address;
  dstToken: Address;

  srcPoolId: number;
  dstPoolId: number;

  router: Address;

  metadata: Record<string, unknown>;
}

export class StargateV1Matcher {
  static async match(args: CrossChainMatchRequest): Promise<CrossChainMatchResult> {
    const { fromChain, toChain, tokenAddress } = args;

    const normalizedToken = getAddress(tokenAddress);

    const [fromGraph, toGraph] = await Promise.all([
      StargatePoolGraphBuilder.build(fromChain),
      StargatePoolGraphBuilder.build(toChain),
    ]);

    if (fromGraph.status !== "success" || !fromGraph.graph) {
      return this.unsupported(args, fromGraph.reason ?? "Source chain does not support Stargate V1");
    }

    if (toGraph.status !== "success" || !toGraph.graph) {
      return this.unsupported(args, toGraph.reason ?? "Destination chain does not support Stargate V1");
    }

    const sourceGraph = fromGraph.graph;
    const destinationGraph = toGraph.graph;

    const srcPoolId = sourceGraph.tokenToPoolId[normalizedToken];

    if (srcPoolId === undefined) {
      return this.unsupported(args, `Token ${normalizedToken} is not supported on source chain`);
    }

    const dstToken = destinationGraph.poolIdToToken[srcPoolId];

    if (!dstToken) {
      return this.unsupported(args, `No matching poolId=${srcPoolId} on destination chain`);
    }

    return {
      supported: true,

      fromChain,
      toChain,

      srcToken: normalizedToken,
      dstToken,

      srcPoolId,
      dstPoolId: srcPoolId,

      router: sourceGraph.router,

      metadata: {
        strategy: "poolId-match",
      },
    };
  }

  private static unsupported(args: CrossChainMatchRequest, reason: string): CrossChainMatchResult {
    return {
      supported: false,
      reason,

      fromChain: args.fromChain,
      toChain: args.toChain,

      srcToken: args.tokenAddress,
      dstToken: resolveMatchedDstTokenAddress({
        fromChain: args.fromChain,
        toChain: args.toChain,
        tokenAddress: args.tokenAddress,
      }),

      srcPoolId: -1,
      dstPoolId: -1,

      router: "0x0000000000000000000000000000000000000000",

      metadata: {},
    };
  }
}
