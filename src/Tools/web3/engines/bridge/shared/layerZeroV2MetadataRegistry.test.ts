import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetLayerZeroV2MetadataCacheForTests,
  getLayerZeroChainMetadata,
  getLayerZeroV1ChainId,
  getLayerZeroV2EndpointAddress,
  getLayerZeroV2EndpointId,
} from "./layerZeroV2MetadataRegistry";

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
  __resetLayerZeroV2MetadataCacheForTests();
});

test("getLayerZeroV2EndpointId resolves metadata-backed ids and caches the response", async () => {
  let fetchCount = 0;

  global.fetch = async () => {
    fetchCount += 1;

    return {
      ok: true,
      json: async () => ({
        ethereum: {
          chainKey: "ethereum",
          chainName: "ethereum",
          deployments: [
            { eid: "101", version: 1 },
            {
              eid: "30101",
              version: 2,
              endpointV2: { address: "0x1234000000000000000000000000000000000000" },
            },
          ],
          chainDetails: {
            chainKey: "ethereum",
            shortName: "Ethereum",
            name: "Ethereum",
          },
        },
        katana: {
          chainKey: "katana",
          chainName: "katana",
          deployments: [{ eid: "30375", version: 2 }],
        },
      }),
    } as Response;
  };

  assert.equal(await getLayerZeroV2EndpointId("mainnet"), 30101);
  assert.equal(await getLayerZeroV2EndpointId("katana"), 30375);
  assert.equal(await getLayerZeroV1ChainId("ethereum"), 101);
  assert.equal(
    await getLayerZeroV2EndpointAddress("ethereum"),
    "0x1234000000000000000000000000000000000000"
  );
  const chainInfo = await getLayerZeroChainMetadata("ethereum");
  assert.equal(chainInfo?.chainDetails?.name, "Ethereum");
  assert.equal(fetchCount, 1);
});

test("getLayerZeroV2EndpointId falls back to seeded ids when metadata fetch fails", async () => {
  global.fetch = async () => {
    throw new Error("metadata unavailable");
  };

  assert.equal(await getLayerZeroV2EndpointId("base"), 30184);
  assert.equal(await getLayerZeroV2EndpointId("ethereum"), 30101);
});

test("getLayerZeroV2EndpointId keeps canonical EIDs despite alias collisions", async () => {
  global.fetch = async () => {
    return {
      ok: true,
      json: async () => ({
        arbitrum: {
          environment: "mainnet",
          chainKey: "arbitrum",
          chainName: "arbitrum",
          deployments: [{ eid: "30110", version: 2 }],
          chainDetails: {
            chainKey: "arbitrum",
            name: "Arbitrum",
            shortName: "Arbitrum",
          },
        },
        "arb-sepolia": {
          environment: "testnet",
          chainKey: "arb-sepolia",
          chainName: "arb-sepolia",
          deployments: [{ eid: "40231", version: 2 }],
          chainDetails: {
            chainKey: "arb-sepolia",
            mainnetChainName: "arbitrum",
          },
        },
        "arb-shadow": {
          environment: "mainnet",
          chainKey: "arb-shadow",
          chainName: "arb-shadow",
          deployments: [{ eid: "40231", version: 2 }],
          chainDetails: {
            mainnetChainName: "arbitrum",
          },
        },
      }),
    } as Response;
  };

  assert.equal(await getLayerZeroV2EndpointId("arbitrum"), 30110);
});