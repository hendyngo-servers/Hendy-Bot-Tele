import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sendMessage,
  getWebhookInfo,
  getMe,
  setWebhook,
  getBotToken
} from "./telegramService.js";

function telegramResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function withBotToken(t, run) {
  const previous = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = "123456:test-token";
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = previous;
  }
}

describe("Telegram Service", () => {
  test("returns an explicit configuration error when the token is missing", async (t) => {
    const previous = process.env.BOT_TOKEN;
    delete process.env.BOT_TOKEN;
    try {
      assert.equal(getBotToken(), "");
      const result = await sendMessage(123456, "No token");
      assert.equal(result.ok, false);
      assert.match(result.error, /BOT_TOKEN/);
    } finally {
      if (previous !== undefined) process.env.BOT_TOKEN = previous;
    }
  });

  test("sends a message using the Telegram Bot API", async (t) => {
    await withBotToken(t, async () => {
      let request;
      t.mock.method(globalThis, "fetch", async (url, options) => {
        request = { url: String(url), options };
        return telegramResponse({ ok: true, result: { message_id: 42, chat: { id: 123456 }, text: "Hello" } });
      });
      const result = await sendMessage(123456, "Hello");
      assert.equal(result.ok, true);
      assert.equal(request.url, "https://api.telegram.org/bot123456:test-token/sendMessage");
      assert.equal(request.options.method, "POST");
      assert.equal(JSON.parse(request.options.body).chat_id, 123456);
    });
  });

  test("retrieves webhook information from Telegram", async (t) => {
    await withBotToken(t, async () => {
      t.mock.method(globalThis, "fetch", async () => telegramResponse({
        ok: true,
        result: { url: "https://example.test/api/telegram/webhook", pending_update_count: 0 }
      }));
      const info = await getWebhookInfo();
      assert.equal(info.ok, true);
      assert.equal(info.result.url, "https://example.test/api/telegram/webhook");
    });
  });

  test("retrieves the actual bot identity from Telegram", async (t) => {
    await withBotToken(t, async () => {
      t.mock.method(globalThis, "fetch", async () => telegramResponse({
        ok: true,
        result: { id: 100, is_bot: true, first_name: "Test Bot", username: "test_bot" }
      }));
      const me = await getMe();
      assert.equal(me.ok, true);
      assert.equal(me.result.is_bot, true);
      assert.equal(me.result.first_name, "Test Bot");
    });
  });

  test("sets the Telegram webhook with its secret token", async (t) => {
    await withBotToken(t, async () => {
      let payload;
      t.mock.method(globalThis, "fetch", async (_url, options) => {
        payload = JSON.parse(options.body);
        return telegramResponse({ ok: true, result: true });
      });
      const result = await setWebhook("https://example.test/api/telegram/webhook", "webhook-secret-value");
      assert.equal(result.ok, true);
      assert.equal(payload.url, "https://example.test/api/telegram/webhook");
      assert.equal(payload.secret_token, "webhook-secret-value");
    });
  });
});
