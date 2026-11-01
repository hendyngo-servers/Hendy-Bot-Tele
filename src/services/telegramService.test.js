import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sendMessage,
  getWebhookInfo,
  getMe,
  setWebhook
} from "./telegramService.js";

describe("Telegram Service", () => {
  test("sends message without throwing even if offline/simulated", async () => {
    const res = await sendMessage(123456, "Hello from test suite");
    assert.ok(res.ok !== undefined);
  });

  test("retrieves webhook info structure", async () => {
    const info = await getWebhookInfo();
    assert.ok(info.ok);
    assert.ok(info.result);
    assert.ok(typeof info.result.url === "string");
  });

  test("retrieves bot identity information", async () => {
    const me = await getMe();
    assert.ok(me.ok);
    assert.ok(me.result.is_bot);
    assert.ok(me.result.first_name);
  });
});
