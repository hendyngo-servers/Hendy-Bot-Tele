import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleTelegramWebhook, getBotStatus, BOT_MODULES } from "./botController.js";

describe("BotController", () => {
  test("contains exactly 14 Telegram Core Modules", () => {
    assert.equal(BOT_MODULES.length, 14);
    assert.ok(BOT_MODULES.find((m) => m.id === "store"));
    assert.ok(BOT_MODULES.find((m) => m.id === "wallet"));
    assert.ok(BOT_MODULES.find((m) => m.id === "admin_portal"));
  });

  test("handles /start telegram command via webhook", async () => {
    const req = {
      body: {
        message: {
          chat: { id: 12345 },
          from: { id: 99887766, first_name: "Hendy" },
          text: "/start"
        }
      }
    };
    let responseData = null;
    let responseStatus = 200;
    const res = {
      status(s) {
        responseStatus = s;
        return this;
      },
      json(d) {
        responseData = d;
        return this;
      }
    };

    await handleTelegramWebhook(req, res, () => {});
    assert.equal(responseStatus, 200);
    assert.equal(responseData.ok, true);
    assert.ok(responseData.replyText.includes("Cloudflare Edition"));
  });

  test("handles /wallet command and returns formatted balance", async () => {
    const req = {
      body: {
        message: {
          chat: { id: 12345 },
          from: { id: 99887766, first_name: "Hendy" },
          text: "/wallet"
        }
      }
    };
    let responseData = null;
    const res = {
      status() { return this; },
      json(d) { responseData = d; return this; }
    };

    await handleTelegramWebhook(req, res, () => {});
    assert.ok(responseData.replyText.includes("Số dư chính"));
  });
});
