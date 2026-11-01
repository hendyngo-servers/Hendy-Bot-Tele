const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("APP_ENCRYPTION_KEY cần tối thiểu 32 ký tự.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Ciphertext format tương thích dữ liệu AES-256-GCM version 1 từ ứng dụng Node.js cũ. */
export async function encryptSecret(plainText: string, secret: string) {
  if (!plainText) throw new Error("Không có dữ liệu để mã hóa.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, encoder.encode(plainText)));
  const tag = encrypted.slice(encrypted.length - 16);
  const data = encrypted.slice(0, encrypted.length - 16);
  return { version: 1, iv: toBase64(iv), tag: toBase64(tag), data: toBase64(data) };
}

export async function decryptSecret(payload: unknown, secret: string): Promise<string> {
  if (!payload || typeof payload !== "object") throw new Error("Ciphertext không hợp lệ.");
  const value = payload as { version?: number; iv?: string; tag?: string; data?: string };
  if (value.version !== 1 || !value.iv || !value.tag || typeof value.data !== "string") {
    throw new Error("Phiên bản ciphertext không được hỗ trợ.");
  }
  const iv = fromBase64(value.iv);
  const tag = fromBase64(value.tag);
  const data = fromBase64(value.data);
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Ciphertext có định dạng sai.");
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data);
  combined.set(tag, data.length);
  const key = await deriveAesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, combined);
  return decoder.decode(plain);
}

export function serializeCiphertext(payload: object): string {
  return JSON.stringify(payload);
}
export function parseCiphertext(value: string): unknown {
  return JSON.parse(value);
}