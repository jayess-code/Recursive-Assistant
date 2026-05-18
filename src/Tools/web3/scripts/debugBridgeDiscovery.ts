import { bridgeDiscoveryTool } from "../tools/bridge/bridgeDiscoveryTool";

async function testBridgeDiscovery() {
  console.log("🔍 Bridge Discovery Tool Test\n");
  console.log("=====================================\n");

  const testCases = [
    {
      name: "WETH on Ethereum → Available Destinations",
      args: {
        sourceChain: "ethereum",
        sourceTokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      },
    },
    {
      name: "DAI on Ethereum → Available Destinations",
      args: {
        sourceChain: "ethereum",
        sourceTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      },
    },
    {
      name: "WETH on Base → Available Destinations",
      args: {
        sourceChain: "base",
        sourceTokenAddress: "0x4200000000000000000000000000000000000006", // WETH
      },
    },
  ];

  for (const testCase of testCases) {
    console.log(`📍 ${testCase.name}`);
    console.log(`   Chain: ${testCase.args.sourceChain}`);
    console.log(`   Token: ${testCase.args.sourceTokenAddress}\n`);

    try {
      const result = await (bridgeDiscoveryTool.tool.handler as any)(
        testCase.args
      );

      console.log(`Status: ${result.status}`);

      if (result.status === "supported") {
        console.log(
          `✅ Found ${result.destinationTokens?.length || 0} destination options:`
        );
        result.destinationTokens?.slice(0, 5).forEach((token: any) => {
          console.log(
            `   • ${token.symbol} on ${token.chainKey} @ ${token.address}`
          );
          if (token.price?.usd) {
            console.log(`     Price: $${token.price.usd.toFixed(4)}`);
          }
        });
        if ((result.destinationTokens?.length || 0) > 5) {
          console.log(
            `   ... and ${(result.destinationTokens?.length || 0) - 5} more`
          );
        }
      } else {
        console.log(`Reason: ${result.reason}`);
        if (result.details) {
          console.log(`Details: ${result.details}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error:`, error);
    }

    console.log("\n");
  }

  console.log("=====================================");
  console.log("✅ Bridge discovery tests complete!");
}

testBridgeDiscovery().catch(console.error);
