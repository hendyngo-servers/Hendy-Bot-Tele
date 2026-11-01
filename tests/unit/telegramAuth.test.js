import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyTelegramInitData } from "../../backend/src/security/telegramAuth.js";

const botToken = "123456789:TEST_TOKEN_FOR_UNIT_TESTS";

function signedInitData(overrides = {}) {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "query-test-123",
    user: JSON.stringify({ id: 123456789, first_name: "Hendy", username: "hendy_test" }),
    ...overrides
  };
  const check = Object.keys(values).sort().map((key) => key + "=" + values[key]).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...values, hash }).toString();
}

test("accepts a Telegram initData payload with a valid HMAC and fresh auth_date", async () => {
  const result = await verifyTelegramInitData(signedInitData(), botToken);
  assert.equal(result.user.id, 123456789);
});

test("rejects tampered Telegram initData", async () => {
  const data = signedInitData().replace("Hendy", "Other");
  await assert.rejects(() => verifyTelegramInitData(data, botToken), /không xác thực|không hợp lệ/i);
});

test("rejects stale Telegram initData", async () => {
  const data = signedInitData({ auth_date: String(Math.floor(Date.now() / 1000) - 7200) });
  await assert.rejects(() => verifyTelegramInitData(data, botToken), /hết hạn/i);
});

test("rejects duplicate keys and malformed user IDs", async () => {
  const valid = signedInitData();
  await assert.rejects(() => verifyTelegramInitData(valid + "&auth_date=" + Math.floor(Date.now() / 1000), botToken), /không hợp lệ/i);
  const malformed = signedInitData({ user: JSON.stringify({ id: "not-a-number" }) });
  await assert.rejects(() => verifyTelegramInitData(malformed, botToken), /user ID hợp lệ/i);
});
