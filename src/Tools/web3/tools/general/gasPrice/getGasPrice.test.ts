import test from "node:test";
import assert from "node:assert/strict";

import { resolveChainKey, viemChains } from "../../../clients/viem/viemChains";
import { buildChainMetadataFromConfig } from "./getGasPrice";

test("buildChainMetadataFromConfig returns metadata from viem chain config", () => {
  const chain = "base";
  const resolved = resolveChainKey(chain);
  const config = viemChains[resolved];
  assert.ok(config, `viem config not found for resolved chain key: ${resolved}`);

  const metadata = buildChainMetadataFromConfig(chain);

  assert.equal(metadata.protocol, "evm");
  assert.equal(metadata.chain, chain);
  assert.equal(metadata.chainId, config.id ?? null);
  assert.equal(metadata.nativeSymbol, config.nativeCurrency?.symbol ?? "NATIVE");
  assert.equal(metadata.nativeDecimals, config.nativeCurrency?.decimals ?? 18);
  assert.deepEqual(metadata.rpcUrls, config.rpcUrls ? { default: { http: config.rpcUrls.default?.http ?? null } } : null);
  assert.equal(metadata.testnet, config.testnet ?? null);
});

test("buildChainMetadataFromConfig throws for unknown chain", () => {
  assert.throws(
    () => buildChainMetadataFromConfig("definitely-not-a-real-chain"),
    /Unsupported or unknown chain key/
  );
});
