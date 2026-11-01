import { describe, expect, it } from "vitest";
import { createSignedQrUrl, verifySignedQrUrl } from "./signedAssets";

describe("signed QR assets", () => {
  const secret = "test-signing-secret-with-at-least-32-characters";
  it("creates a short-lived HTTPS link for an application asset key", async () => {
    const url = await createSignedQrUrl(secret, "https://api.example.com", "applications/qr/bank.png");
    expect(url).toContain("https://api.example.com/public/qr/applications/qr/bank.png?exp=");
  });
  it("rejects altered keys, signatures and expired links", async () => {
    const url = new URL(await createSignedQrUrl(secret, "https://api.example.com", "applications/qr/bank.png") || "");
    const expires = Number(url.searchParams.get("exp"));
    const signature = url.searchParams.get("sig") || "";
    await expect(verifySignedQrUrl(secret, "applications/qr/bank.png", expires, signature)).resolves.toBe(true);
    await expect(verifySignedQrUrl(secret, "applications/qr/other.png", expires, signature)).resolves.toBe(false);
    await expect(verifySignedQrUrl(secret, "applications/qr/bank.png", expires - 1000, signature, expires)).resolves.toBe(false);
  });
  it("does not sign keys outside the private application namespace", async () => {
    await expect(createSignedQrUrl(secret, "https://api.example.com", "../database.json")).resolves.toBeNull();
    await expect(createSignedQrUrl(secret, "http://api.example.com", "applications/qr/bank.png")).resolves.toBeNull();
  });
});
