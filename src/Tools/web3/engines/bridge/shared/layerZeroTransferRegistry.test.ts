import test from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "viem";

import {
  __resetLayerZeroTransferMetadataCacheForTests,
  getLayerZeroTransferRoutingHint,
} from "./layerZeroTransferRegistry";

const originalFetch = global.fetch;
const originalDateNow = Date.now;

const TEST_TOKEN = getAddress("0x1111111111111111111111111111111111111111");

test.afterEach(() => {
  global.fetch = originalFetch;
  Date.now = originalDateNow;
  __resetLayerZeroTransferMetadataCacheForTests();
});

test("returns stale cached routing hint when metadata refresh fails", async () => {
  let shouldFail = false;

  global.fetch = async (url: string | URL | Request) => {
    const value = String(url);

    if (shouldFail) {
      throw new Error("layerzero metadata outage");
    }

    if (value.includes("experiment/ofts/list")) {
      return {
        ok: true,
        json: async () => ({
          USDC: [
            {
              name: "USDC",
              deployments: {
                base: {
                  type: "OFT_ADAPTER",
                  innerTokenAddress: TEST_TOKEN,
                  localDecimals: 6,
                },
              },
            },
          ],
        }),
      } as Response;
    }

    if (value.includes("/v1/metadata")) {
      return {
        ok: true,
        json: async () => ({ tokens: [] }),
      } as Response;
    }

    throw new Error(`unexpected url ${value}`);
  };

  const initialHint = await getLayerZeroTransferRoutingHint("base", TEST_TOKEN);
  assert.ok(initialHint);
  assert.equal(initialHint?.executionSurface, "adapter");

  const now = originalDateNow();
  Date.now = () => now + 7 * 60 * 60 * 1000;
  shouldFail = true;

  const staleHint = await getLayerZeroTransferRoutingHint("base", TEST_TOKEN);
  assert.ok(staleHint);
  assert.equal(staleHint?.executionSurface, "adapter");
  assert.equal(staleHint?.source, "transfer_ofts");
});

test("returns null when API is unavailable and no cache exists", async () => {
  global.fetch = async () => {
    throw new Error("layerzero outage");
  };

  const hint = await getLayerZeroTransferRoutingHint("base", TEST_TOKEN);
  assert.equal(hint, null);
});
