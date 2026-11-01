import test from "node:test";
import assert from "node:assert/strict";
import { CloudflareBridge } from "../../services/render-bot/cloudflareBridge.js";
import { mainMenu } from "../../backend/src/bot/keyboards.js";

test("CloudflareBridge generates valid Mini App URLs with module parameters", () => {
  const bridge = new CloudflareBridge({
    WEBAPP_URL: "https://hendy-web-user.pages.dev",
    ADMIN_WEBAPP_URL: "https://hendy-web-admin.pages.dev"
  });

  const url = bridge.getMiniAppUrl("app_tool", { section: "rent" });
  assert.ok(url.startsWith("https://hendy-web-user.pages.dev"));
  assert.ok(url.includes("module=app_tool"));
  assert.ok(url.includes("section=rent"));

  const adminUrl = bridge.getAdminConsoleUrl();
  assert.equal(adminUrl, "https://hendy-web-admin.pages.dev");
});

test("CloudflareBridge returns structured integration status", async () => {
  const bridge = new CloudflareBridge({
    CLOUDFLARE_D1_DATABASE_ID: "db-test-id",
    CLOUDFLARE_R2_BUCKET: "my-bucket",
    CLOUDFLARE_API_BASE_URL: "http://localhost:3000"
  });

  const status = await bridge.getStatus();
  assert.equal(status.renderHost, "Render Cloud Platform");
  assert.equal(status.cloudflare.r2.bucket, "my-bucket");
  assert.equal(status.cloudflare.pages.userApp, "https://hendy-web-user.pages.dev");
});

test("14-button main menu keyboard contains expected service modules", () => {
  const mockEnv = {
    WEBAPP_URL: "https://hendy-web-user.pages.dev",
    GROUP_CHAT_URL: "https://t.me/hendy_community",
    NEWS_CHANNEL_URL: "https://t.me/hendy_news",
    SUPPORT_URL: "https://t.me/hendy_support"
  };

  const keyboard = mainMenu(mockEnv);
  assert.ok(Array.isArray(keyboard.inline_keyboard));
  const totalButtons = keyboard.inline_keyboard.reduce((sum, row) => sum + row.length, 0);
  assert.equal(totalButtons, 14);

  // Check critical buttons have web_app URLs configured
  const firstRow = keyboard.inline_keyboard[0];
  assert.equal(firstRow[0].text, "🚀 MINIGAME LIVE");
  assert.ok(firstRow[0].web_app?.url?.includes("module=mini_game_live"));

  assert.equal(firstRow[1].text, "🧰 THUÊ TOOL (NEW)");
  assert.ok(firstRow[1].web_app?.url?.includes("module=app_tool"));
});
