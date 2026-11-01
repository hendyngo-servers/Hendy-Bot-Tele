export async function telegramCall(env, method, payload = {}) {
  if (!env.BOT_TOKEN) throw new Error("BOT_TOKEN chưa được cấu hình.");
  const response = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("Telegram API: " + (result.description || response.status));
  return result.result;
}

export function sendMessage(env, chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text, disable_web_page_preview: true };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall(env, "sendMessage", payload);
}

export function editMessage(env, chatId, messageId, text, replyMarkup) {
  const payload = { chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall(env, "editMessageText", payload);
}

export function answerCallback(env, callbackId, text = "Đã xử lý.") {
  return telegramCall(env, "answerCallbackQuery", { callback_query_id: callbackId, text });
}