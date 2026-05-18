import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(rawKey, "utf8");

  // aes-256 requires exactly 32 bytes
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (utf8)");
  }

  return key;
}

function parseEncryptedPayload(payload: string): { ivHex: string; encryptedHex: string } {
  const parts = payload.split(":");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid encrypted payload format. Expected iv:ciphertext");
  }

  return { ivHex: parts[0], encryptedHex: parts[1] };
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(payload: string): string {
  const key = getEncryptionKey();
  const { ivHex, encryptedHex } = parseEncryptedPayload(payload);

  const iv = Buffer.from(ivHex, "hex");
  const encryptedText = Buffer.from(encryptedHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);

  return decrypted.toString("utf8");
}
