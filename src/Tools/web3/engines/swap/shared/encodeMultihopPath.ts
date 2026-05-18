import { Address, getAddress } from "viem";

function addressBody(address: Address): string {
  return getAddress(address).slice(2).toLowerCase();
}

function feeBody(feeTier: number): string {
  if (!Number.isInteger(feeTier) || feeTier < 1 || feeTier > 0xffffff) {
    throw new Error(`Invalid fee tier '${feeTier}'. Expected uint24-compatible integer.`);
  }

  return feeTier.toString(16).padStart(6, "0");
}

export function encodeV3Path(tokens: Address[], feeTiers: number[]): `0x${string}` {
  if (tokens.length < 2) {
    throw new Error("V3 packed path requires at least two token addresses.");
  }

  if (feeTiers.length !== tokens.length - 1) {
    throw new Error(`V3 packed path requires ${tokens.length - 1} fee tiers; received ${feeTiers.length}.`);
  }

  const firstToken = tokens[0];
  if (!firstToken) {
    throw new Error("V3 packed path requires a valid first token address.");
  }

  let encoded = addressBody(firstToken);

  for (let index = 0; index < feeTiers.length; index += 1) {
    const feeTier = feeTiers[index];
    const nextToken = tokens[index + 1];
    if (feeTier === undefined || !nextToken) {
      throw new Error(`Invalid packed path segment at index ${index}.`);
    }

    encoded += feeBody(feeTier);
    encoded += addressBody(nextToken);
  }

  const expectedLength = 40 * tokens.length + 6 * feeTiers.length;
  if (encoded.length !== expectedLength) {
    throw new Error(`V3 packed path length mismatch. Expected ${expectedLength} hex chars, received ${encoded.length}.`);
  }

  return `0x${encoded}`;
}

export function encodeAlgebraPath(tokens: Address[]): `0x${string}` {
  if (tokens.length < 2) {
    throw new Error("Algebra packed path requires at least two token addresses.");
  }

  const encoded = tokens.map(addressBody).join("");
  const expectedLength = 40 * tokens.length;
  if (encoded.length !== expectedLength) {
    throw new Error(
      `Algebra packed path length mismatch. Expected ${expectedLength} hex chars, received ${encoded.length}.`
    );
  }

  return `0x${encoded}`;
}