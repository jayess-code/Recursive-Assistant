import { encodeFunctionData, getAddress } from "viem";
import { StargateV1Matcher } from "./stargateV1CrossChainMatcher";
import { BridgeAssetArgs, BridgeExecutionPlan } from "../../../core/BridgeTypes";
import { getViemPublicClient } from "../../../../../clients/viem/getViemPublicClient";

const QUOTE_ABI = [
  {
    name: "quoteLayerZeroFee",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_dstChainId", type: "uint16" },
      { name: "_functionType", type: "uint8" },
      { name: "_toAddress", type: "bytes" },
      { name: "_transferAndCallPayload", type: "bytes" },
      {
        name: "_lzTxParams",
        type: "tuple",
        components: [
          { name: "dstGasForCall", type: "uint256" },
          { name: "dstNativeAmount", type: "uint256" },
          { name: "dstNativeAddr", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "nativeFee", type: "uint256" },
      { name: "zroFee", type: "uint256" },
    ],
  },
] as const;

const SWAP_ABI = [
  {
    name: "swap",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_dstChainId", type: "uint16" },
      { name: "_srcPoolId", type: "uint256" },
      { name: "_dstPoolId", type: "uint256" },
      { name: "_refundAddress", type: "address" },
      { name: "_amountLD", type: "uint256" },
      { name: "_minAmountLD", type: "uint256" },
      {
        name: "_lzTxParams",
        type: "tuple",
        components: [
          { name: "dstGasForCall", type: "uint256" },
          { name: "dstNativeAmount", type: "uint256" },
          { name: "dstNativeAddr", type: "bytes" },
        ],
      },
      { name: "_to", type: "bytes" },
      { name: "_payload", type: "bytes" },
    ],
  },
] as const;

const ERC20_ALLOWANCE_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function buildStargateV1ExecutionPlan(
  args: BridgeAssetArgs
): Promise<BridgeExecutionPlan> {
  const {
    fromChain,
    toChain,
    srcTokenAddress,
    amount,
    recipient,
    slippageBps = 100,
  } = args;

  if (!srcTokenAddress) {
    throw new Error("srcTokenAddress is required");
  }

  const normalizedToken = getAddress(srcTokenAddress);

  const match = await StargateV1Matcher.match({
    fromChain,
    toChain,
    tokenAddress: normalizedToken,
  });

  if (!match.supported) {
    throw new Error(`Route not supported: ${match.reason}`);
  }

  // const resolvedChain = resolveChainKey(fromChain);
  const publicClient = getViemPublicClient(fromChain);

  const dstChainId = await 137;

  const amountLD = BigInt(amount);
  const minAmountLD = (amountLD * BigInt(10_000 - slippageBps)) / BigInt(10_000);

  const toBytes = `0x${recipient.slice(2).padStart(64, "0")}` as `0x${string}`;

  const lzTxParams = {
    dstGasForCall: 0n,
    dstNativeAmount: 0n,
    dstNativeAddr: "0x" as `0x${string}`,
  };

  const feeQuote = (await publicClient.readContract({
    address: match.router,
    abi: QUOTE_ABI,
    functionName: "quoteLayerZeroFee",
    args: [
      dstChainId,
      1,
      toBytes,
      "0x",
      lzTxParams,
    ],
  })) as readonly [bigint, bigint];

  const [nativeFee] = feeQuote;
  const bufferedFee = (nativeFee * 110n) / 100n;

  let approvalRequired = true;
  if (args.sender) {
    const currentAllowance = (await publicClient.readContract({
      address: normalizedToken,
      abi: ERC20_ALLOWANCE_ABI,
      functionName: "allowance",
      args: [args.sender, match.router],
    })) as bigint;
    approvalRequired = currentAllowance < amountLD;
  }

  const calldata = encodeFunctionData({
    abi: SWAP_ABI,
    functionName: "swap",
    args: [
      dstChainId,
      BigInt(match.srcPoolId),
      BigInt(match.dstPoolId),
      recipient,
      amountLD,
      minAmountLD,
      lzTxParams,
      toBytes,
      "0x",
    ],
  });

  return {
    provider: "stargate_v1",
    executionMode: "v1_pool",
    fromChain,
    toChain,
    token: normalizedToken,
    amount,
    recipient,
    slippageBps,
    fee: {
      quotedNativeFee: nativeFee.toString(),
      bufferedNativeFee: bufferedFee.toString(),
      bufferBps: 1000,
    },
    approval: {
      required: approvalRequired,
      token: normalizedToken,
      spender: match.router,
      amount: amountLD,
    },
    steps: [
      ...(approvalRequired
        ? [
            {
              type: "approval" as const,
              tool: "write_contract" as const,
              description: "Approve token for Stargate router",
              args: {
                chain: fromChain,
                address: normalizedToken,
                abi: [
                  {
                    name: "approve",
                    type: "function",
                    stateMutability: "nonpayable",
                    inputs: [
                      { name: "spender", type: "address" },
                      { name: "amount", type: "uint256" },
                    ],
                    outputs: [{ type: "bool" }],
                  },
                ] as const,
                functionName: "approve",
                args: [match.router, amountLD],
              },
            },
          ]
        : []),
      {
        type: "bridge" as const,
        tool: "send_transaction" as const,
        description: "Execute Stargate bridge swap",
        args: {
          chain: fromChain,
          to: match.router,
          data: calldata,
          value: bufferedFee.toString(),
        },
      },
    ],
    metadata: {
      stargateProtocol: "v1",
      executionMethod: "pool_swap",
      router: match.router,
      srcPoolId: match.srcPoolId,
      dstPoolId: match.dstPoolId,
      dstToken: match.dstToken,
    },
  };
}
