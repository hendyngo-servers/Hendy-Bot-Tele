import { safeObjectKey } from "../../../packages/shared/src/validation";

const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
function safeAssetKey(key: string): boolean {
  return safeObjectKey(key) && key.startsWith("applications/") && key.length <= 512;
}
async function sign(secret: string, message: string): Promise<string> {
  if (secret.length < 32) throw new Error("BACKUP_SECRET cần tối thiểu 32 ký tự để ký URL tài nguyên.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
export async function createSignedQrUrl(secret: string, origin: string, key: string, ttlSeconds = 300): Promise<string | null> {
  if (!safeAssetKey(key) || !Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 600) return null;
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password) return null;
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = await sign(secret, key + "\n" + expires);
  const path = key.split("/").map(segment => encodeURIComponent(segment)).join("/");
  return base.origin + "/public/qr/" + path + "?exp=" + expires + "&sig=" + signature;
}
export async function verifySignedQrUrl(secret: string, key: string, expires: number, signature: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!safeAssetKey(key) || !Number.isSafeInteger(expires) || expires <= nowSeconds || expires > nowSeconds + 600 ||
      !/^[a-f0-9]{64}$/i.test(signature) || secret.length < 32) return false;
  const expected = await sign(secret, key + "\n" + expires);
  return constantTimeEqual(expected, signature.toLowerCase());
}
