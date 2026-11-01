/**
 * Bot Settings & Maintenance Mode Service
 * 
 * Interacts with Cloudflare D1 to persist bot configuration,
 * toggle maintenance mode, and manage Telegram/VietQR settings.
 */

import { executeD1Query, getInternalD1Table } from "./d1Client.js";

export async function getBotSettings() {
  const queryRes = await executeD1Query("SELECT * FROM bot_settings");
  const settingsObj = {};

  if (queryRes && queryRes.results) {
    queryRes.results.forEach((row) => {
      settingsObj[row.key] = row.value;
    });
  }

  // Ensure default fallbacks
  return {
    maintenance_mode: settingsObj.maintenance_mode === "1",
    maintenance_message:
      settingsObj.maintenance_message ||
      "⚠️ Hệ thống Hendy Bot đang bảo trì kỹ thuật để nâng cấp hạ tầng Cloudflare D1 & R2. Xin quý khách vui lòng quay lại sau ít phút!",
    welcome_message:
      settingsObj.welcome_message ||
      "👋 Chào mừng bạn đến với Hendy Bot Telegram — Cloudflare Edition!",
    render_service_url: settingsObj.render_service_url || "https://hendy-bot-tele.onrender.com",
    telegram_webhook_path: settingsObj.telegram_webhook_path || "/api/telegram/webhook",
    vietqr_bank: settingsObj.vietqr_bank || "MB",
    vietqr_account_no: settingsObj.vietqr_account_no || "0988776655",
    vietqr_account_name: settingsObj.vietqr_account_name || "HENDY STUDIO CO",
    support_telegram: settingsObj.support_telegram || "@hendy_support",
    d1_database_name: settingsObj.d1_database_name || "d1-hendy-bot-db",
    updated_at: new Date().toISOString()
  };
}

export async function updateBotSettings(updates = {}) {
  const current = await getBotSettings();
  const table = getInternalD1Table("bot_settings");

  for (const [key, val] of Object.entries(updates)) {
    let strVal = val;
    if (typeof val === "boolean") {
      strVal = val ? "1" : "0";
    } else {
      strVal = String(val);
    }

    if (table) {
      table.set(key, { key, value: strVal, updated_at: new Date().toISOString() });
    }

    await executeD1Query(
      "INSERT OR REPLACE INTO bot_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      [key, strVal]
    );
  }

  return getBotSettings();
}

export async function isMaintenanceActive() {
  const settings = await getBotSettings();
  return Boolean(settings.maintenance_mode);
}

export async function toggleMaintenanceMode(enabled, customMessage = null) {
  const updates = {
    maintenance_mode: Boolean(enabled)
  };
  if (customMessage) {
    updates.maintenance_message = customMessage;
  }
  return updateBotSettings(updates);
}
