function decodeBase64(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  } catch {
    throw new Error("Dữ liệu mã hóa base64 không hợp lệ.");
  }
}
function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < value.length; i += 0x8000) {
    binary += String.fromCharCode(...value.subarray(i, Math.min(i + 0x8000, value.length)));
  }
  return btoa(binary);
}
async function importEncryptionKey(secret: string): Promise<CryptoKey> {
  const raw = decodeBase64(secret);
  if (raw.byteLength !== 32) throw new Error("APP_ENCRYPTION_KEY phải là base64 của khóa ngẫu nhiên 32 byte.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptSecret(value: string, secret: string): Promise<string> {
  if (!value || value.length > 10000) throw new Error("Dữ liệu cần mã hóa không hợp lệ.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importEncryptionKey(secret),
    new TextEncoder().encode(value)
  );
  return JSON.stringify({
    v: 1,
    alg: "A256GCM",
    iv: encodeBase64(iv),
    data: encodeBase64(new Uint8Array(encrypted))
  });
}
export async function decryptSecret(payload: string, secret: string): Promise<string> {
  const parsed = JSON.parse(payload) as { v?: number; alg?: string; iv?: string; data?: string };
  if (parsed.v !== 1 || parsed.alg !== "A256GCM" || !parsed.iv || !parsed.data) {
    throw new Error("Định dạng dữ liệu mã hóa không được hỗ trợ.");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(parsed.iv) },
    await importEncryptionKey(secret),
    decodeBase64(parsed.data)
  );
  return new TextDecoder().decode(decrypted);
}
