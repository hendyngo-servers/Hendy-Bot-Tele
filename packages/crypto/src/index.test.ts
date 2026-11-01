import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./index";

describe("mã hóa dữ liệu tài khoản", () => {
  it("mã hóa và giải mã AES-GCM", async () => {
    const encrypted = await encryptSecret("mat-khau-thu-nghiem", "x".repeat(48));
    await expect(decryptSecret(encrypted, "x".repeat(48))).resolves.toBe("mat-khau-thu-nghiem");
  });
  it("từ chối khóa không đúng", async () => {
    const encrypted = await encryptSecret("secret", "a".repeat(48));
    await expect(decryptSecret(encrypted, "b".repeat(48))).rejects.toThrow();
  });
});