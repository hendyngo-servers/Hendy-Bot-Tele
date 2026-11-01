import sodium from "libsodium-wrappers";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const sodiumReady = sodium.ready;
const LEGACY_V1 = 1;
const SODIUM_V2 = 2;
const SODIUM_ALGORITHM = "xchacha20poly1305-ietf";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("Ciphertext base64 không hợp lệ.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
function validateSecret(secret: string): void {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY cần tối thiểu 32 ký tự.");
  }
}

/** V1 giữ nguyên cách dẫn xuất khóa SHA-256 và AES-256-GCM của bản Node.js/Render. */
async function deriveLegacyAesKey(secret: string): Promise<CryptoKey> {
  validateSecret(secret);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

/** V2 dùng HKDF-SHA256 để dẫn xuất khóa 256-bit riêng cho Libsodium AEAD. */
async function deriveSodiumKey(secret: string): Promise<Uint8Array> {
  validateSecret(secret);
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveBits"]);
  const key = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: encoder.encode("hendy-bot-tele/libsodium/v2"),
    info: encoder.encode("linked-account/secret-encryption")
  }, material, 256);
  return new Uint8Array(key);
}

async function decryptLegacyV1(value: { iv?: string; tag?: string; data?: string }, secret: string): Promise<string> {
  if (!value.iv || !value.tag || typeof value.data !== "string") {
    throw new Error("Ciphertext AES-GCM v1 không hợp lệ.");
  }
  const iv = fromBase64(value.iv);
  const tag = fromBase64(value.tag);
  const data = fromBase64(value.data);
  if (iv.length !== 12 || tag.length !== 16 || data.length > 1024 * 1024) {
    throw new Error("Ciphertext AES-GCM v1 có kích thước sai.");
  }
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data);
  combined.set(tag, data.length);
  const key = await deriveLegacyAesKey(secret);
  const plain = await crypto.subtle.decrypt({
    name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128
  }, key, toArrayBuffer(combined));
  return decoder.decode(plain);
}

/**
 * New writes use Libsodium XChaCha20-Poly1305 (version 2).
 * Existing AES-256-GCM v1 records remain decryptable for safe migration.
 */
export async function encryptSecret(plainText: string, secret: string) {
  if (typeof plainText !== "string" || !plainText || plainText.length > 4096) {
    throw new Error("Dữ liệu cần mã hóa phải có độ dài từ 1 đến 4.096 ký tự.");
  }
  validateSecret(secret);
  await sodiumReady;
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const key = await deriveSodiumKey(secret);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    encoder.encode(plainText), null, null, nonce, key
  );
  sodium.memzero(key);
  return {
    version: SODIUM_V2,
    algorithm: SODIUM_ALGORITHM,
    nonce: toBase64(nonce),
    data: toBase64(ciphertext)
  };
}

export async function decryptSecret(payload: unknown, secret: string): Promise<string> {
  if (!payload || typeof payload !== "object") throw new Error("Ciphertext không hợp lệ.");
  const value = payload as {
    version?: number;
    algorithm?: string;
    iv?: string;
    tag?: string;
    nonce?: string;
    data?: string;
  };
  if (value.version === LEGACY_V1) return decryptLegacyV1(value, secret);
  if (value.version !== SODIUM_V2 || value.algorithm !== SODIUM_ALGORITHM ||
      !value.nonce || typeof value.data !== "string") {
    throw new Error("Phiên bản ciphertext không được hỗ trợ.");
  }
  validateSecret(secret);
  await sodiumReady;
  const nonce = fromBase64(value.nonce);
  const ciphertext = fromBase64(value.data);
  if (nonce.length !== sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES ||
      ciphertext.length < sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES ||
      ciphertext.length > 1024 * 1024) {
    throw new Error("Ciphertext Libsodium v2 có kích thước sai.");
  }
  const key = await deriveSodiumKey(secret);
  try {
    const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, null, nonce, key);
    return decoder.decode(plain);
  } finally {
    sodium.memzero(key);
  }
}

export function serializeCiphertext(payload: object): string {
  return JSON.stringify(payload);
}
export function parseCiphertext(value: string): unknown {
  return JSON.parse(value);
}
