import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { initializeTelegramBot, validateTelegramWebhookHeader } from "./telegramStartup.js";

describe("TelegramStartup", () => {
  test("initializes bot in webhook mode", async () => {
    const config = await initializeTelegramBot({
      mode: "webhook",
      token: "123:test-token",
      baseUrl: "https://hendy.render.com"
    });
    assert.equal(config.mode, "webhook");
    assert.equal(config.configured, true);
    assert.equal(config.webhookUrl, "https://hendy.render.com/api/telegram/webhook");
  });

  test("validates webhook secret token", () => {
    assert.equal(validateTelegramWebhookHeader("secret-123", "secret-123"), true);
    assert.equal(validateTelegramWebhookHeader("wrong-secret", "secret-123"), false);
  });
});
