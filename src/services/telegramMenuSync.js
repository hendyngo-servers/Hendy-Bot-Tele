import { executeD1Query } from "./productionD1.js";
import { buildMainKeyboard } from "./telegramKeyboard.js";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function editTelegramKeyboard(row, markup, token) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/editMessageReplyMarkup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: row.chat_id,
      message_id: row.message_id,
      reply_markup: markup
    }),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    if (String(result.description || "").toLowerCase().includes("message is not modified")) return;
    throw new Error(result.description || "Telegram editMessageReplyMarkup failed.");
  }
}

/**
 * Refresh the most recently recorded /start menu per chat.
 * Telegram's native inline keyboard cannot be color-styled; labels and button visibility are updated here.
 */
export async function refreshTelegramMenuMessages(settings) {
  const token = String(process.env.BOT_TOKEN || "").trim();
  if (!token) return { updated: 0, failed: 0, total: 0, skipped: true };
  const result = await executeD1Query(
    "SELECT chat_id,message_id FROM telegram_menu_messages ORDER BY updated_at DESC LIMIT 300"
  );
  const rows = result.results || [];
  const markup = buildMainKeyboard(process.env, settings);
  let updated = 0;
  let failed = 0;

  for (let offset = 0; offset < rows.length; offset += 20) {
    const batch = rows.slice(offset, offset + 20);
    const results = await Promise.all(batch.map(async (row) => {
      try { await editTelegramKeyboard(row, markup, token); return true; }
      catch (error) { console.warn("Telegram menu update failed for chat", row.chat_id, error.message); return false; }
    }));
    updated += results.filter(Boolean).length;
    failed += results.filter((value) => !value).length;
    if (offset + 20 < rows.length) await delay(1000);
  }

  return { updated, failed, total: rows.length, skipped: false };
}
