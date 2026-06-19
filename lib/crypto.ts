import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";

/**
 * Secret encryption for API keys at rest (AES-256-GCM) and password hashing
 * (scrypt). No external dependencies — only Node's crypto.
 *
 * The encryption key is derived from APP_SECRET. Set a strong value in
 * production; a dev fallback keeps the demo working out of the box.
 */
const APP_SECRET = process.env.APP_SECRET || "peymanet-dev-secret-change-me-please-32b";

function keyFor(salt: Buffer): Buffer {
  return scryptSync(APP_SECRET, salt, 32);
}

/** Encrypt a UTF-8 secret → base64 "salt:iv:tag:ciphertext". */
export function encryptSecret(plain: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = keyFor(salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [salt, iv, tag, enc].map((b) => b.toString("base64")).join(":");
}

/** Decrypt a value produced by encryptSecret. Returns "" on failure. */
export function decryptSecret(payload: string): string {
  try {
    const [saltB, ivB, tagB, encB] = payload.split(":");
    const salt = Buffer.from(saltB, "base64");
    const iv = Buffer.from(ivB, "base64");
    const tag = Buffer.from(tagB, "base64");
    const enc = Buffer.from(encB, "base64");
    const decipher = createDecipheriv("aes-256-gcm", keyFor(salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** Hash a password → "salt:hash" (scrypt). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time password verification. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Mask a secret for display (keeps the last 4 chars). */
export function maskSecret(s: string): string {
  if (s.length <= 4) return "••••";
  return "••••••" + s.slice(-4);
}
