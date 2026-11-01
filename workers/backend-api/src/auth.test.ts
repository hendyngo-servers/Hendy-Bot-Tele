import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "./auth";

const encoder = new TextEncoder();
async function sign(key: CryptoKey, value: string) {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
async function createInitData(token: string, userId: string, authDate: number) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAE-test-query");
  params.set("user", JSON.stringify({ id: Number(userId), first_name: "Hendy", username: "hendy_test" }));
  const checkString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => key + "=" + value).join("\n");
  const secretKey = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await sign(secretKey, token);
  const dataKey = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  params.set("hash", hex(await sign(dataKey, checkString)));
  return params.toString();
}

describe("Telegram Mini App initData validation", () => {
  it("accepts a valid and recent Telegram signature", async () => {
    const token = "123456:example-token";
    const data = await createInitData(token, "123456789", Math.floor(Date.now() / 1000));
    await expect(verifyTelegramInitData(data, token)).resolves.toMatchObject({ id: "123456789", first_name: "Hendy" });
  });

  it("rejects tampered user data", async () => {
    const token = "123456:example-token";
    const data = await createInitData(token, "123456789", Math.floor(Date.now() / 1000));
    const tampered = data.replace("Hendy", "Attacker");
    await expect(verifyTelegramInitData(tampered, token)).resolves.toBeNull();
  });

  it("rejects old initData", async () => {
    const token = "123456:example-token";
    const data = await createInitData(token, "123456789", Math.floor(Date.now() / 1000) - 7200);
    await expect(verifyTelegramInitData(data, token)).resolves.toBeNull();
  });
});
