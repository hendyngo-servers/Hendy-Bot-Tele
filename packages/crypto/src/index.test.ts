import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./index";

const encoder = new TextEncoder();
const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
async function legacyV1(plainText: string, secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, encoder.encode(plainText)));
  return {
    version: 1,
    iv: toBase64(iv),
    tag: toBase64(sealed.slice(-16)),
    data: toBase64(sealed.slice(0, -16))
  };
}

describe("mã hóa dữ liệu tài khoản", () => {
  it("mã hóa dữ liệu mới bằng Libsodium XChaCha20-Poly1305 v2", async () => {
    const encrypted = await encryptSecret("mat-khau-thu-nghiem", "x".repeat(48));
    expect(encrypted.version).toBe(2);
    expect(encrypted.algorithm).toBe("xchacha20poly1305-ietf");
    await expect(decryptSecret(encrypted, "x".repeat(48))).resolves.toBe("mat-khau-thu-nghiem");
  });

  it("giải mã ciphertext AES-256-GCM v1 cũ từ Render", async () => {
    const encrypted = await legacyV1("mat-khau-cu", "x".repeat(48));
    await expect(decryptSecret(encrypted, "x".repeat(48))).resolves.toBe("mat-khau-cu");
  });

  it("từ chối khóa không đúng", async () => {
    const encrypted = await encryptSecret("secret", "a".repeat(48));
    await expect(decryptSecret(encrypted, "b".repeat(48))).rejects.toThrow();
  });

  it("từ chối ciphertext đã bị chỉnh sửa", async () => {
    const encrypted = await encryptSecret("secret", "a".repeat(48));
    const altered = { ...encrypted, data: encrypted.data.slice(0, -4) + "AAAA" };
    await expect(decryptSecret(altered, "a".repeat(48))).rejects.toThrow();
  });

  it("từ chối secret yếu hoặc payload sai phiên bản", async () => {
    await expect(encryptSecret("secret", "short")).rejects.toThrow(/32 ký tự/);
    await expect(decryptSecret({ version: 99 }, "x".repeat(48))).rejects.toThrow(/không được hỗ trợ/);
  });
});
