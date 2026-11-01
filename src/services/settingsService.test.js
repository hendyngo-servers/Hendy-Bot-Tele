import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getBotSettings,
  updateBotSettings,
  isMaintenanceActive,
  toggleMaintenanceMode
} from "./settingsService.js";

describe("Bot Settings Service", () => {
  test("reads default bot settings from D1", async () => {
    const settings = await getBotSettings();
    assert.equal(typeof settings.maintenance_mode, "boolean");
    assert.ok(settings.welcome_message.includes("Hendy Bot"));
    assert.ok(settings.render_service_url);
    assert.equal(settings.vietqr_bank, "MB");
  });

  test("toggles maintenance mode on and off", async () => {
    await toggleMaintenanceMode(true, "Maintenance test message");
    assert.equal(await isMaintenanceActive(), true);

    const activeSettings = await getBotSettings();
    assert.equal(activeSettings.maintenance_mode, true);
    assert.equal(activeSettings.maintenance_message, "Maintenance test message");

    // Toggle back off
    await toggleMaintenanceMode(false);
    assert.equal(await isMaintenanceActive(), false);
  });

  test("updates custom bot settings", async () => {
    const updated = await updateBotSettings({
      support_telegram: "@hendy_custom_support",
      vietqr_bank: "VCB"
    });
    assert.equal(updated.support_telegram, "@hendy_custom_support");
    assert.equal(updated.vietqr_bank, "VCB");
  });
});
