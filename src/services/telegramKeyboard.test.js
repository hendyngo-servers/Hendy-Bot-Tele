import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMainKeyboard } from "./telegramKeyboard.js";

describe("Production Telegram keyboard", () => {
  test("provides ten core actions and only configured community links", () => {
    const keyboard = buildMainKeyboard({
      WEBAPP_URL: "https://mini.example.com",
      GROUP_CHAT_URL: "https://t.me/example_group",
      NEWS_CHANNEL_URL: "",
      SUPPORT_URL: "https://t.me/example_support"
    });
    const buttons = keyboard.inline_keyboard.flat();
    assert.equal(buttons.length, 12);
    assert.equal(buttons.filter((button) => button.web_app).length, 10);
    assert.equal(buttons.filter((button) => button.url).length, 2);
    assert.ok(buttons.every((button) => !button.url || button.url !== "https://t.me/"));
    assert.ok(buttons[0].web_app.url.includes("module=mini_game_live"));
  });

  test("does not invent URLs when public domains are not configured", () => {
    const keyboard = buildMainKeyboard({});
    const buttons = keyboard.inline_keyboard.flat();
    assert.equal(buttons.length, 10);
    assert.ok(buttons.every((button) => button.callback_data && !button.web_app && !button.url));
  });

  test("rejects non-HTTPS Mini App and non-Telegram community URLs", () => {
    const keyboard = buildMainKeyboard({
      WEBAPP_URL: "http://mini.example.com",
      GROUP_CHAT_URL: "https://example.com/community",
      NEWS_CHANNEL_URL: "https://t.me/",
      SUPPORT_URL: "javascript:alert(1)"
    });
    const buttons = keyboard.inline_keyboard.flat();
    assert.equal(buttons.length, 10);
    assert.ok(buttons.every((button) => button.callback_data));
  });
});
