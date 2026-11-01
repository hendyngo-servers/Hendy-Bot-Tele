/**
 * Telegram Bot API network client.
 * Missing credentials are an explicit configuration error; production never fabricates Telegram responses.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

export function getBotToken() {
  return String(process.env.BOT_TOKEN || "").trim();
}

function missingTokenResult() {
  return {
    ok: false,
    error: "BOT_TOKEN environment variable is not configured.",
    description: "BOT_TOKEN environment variable is not configured."
  };
}

async function requestTelegram(method, payload) {
  const token = getBotToken();
  if (!token) return missingTokenResult();

  const options = payload === undefined
    ? { method: "GET" }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      };

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      ...options,
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok && result?.ok !== false) {
      return { ok: false, error: `Telegram API returned HTTP ${response.status}.` };
    }
    return result;
  } catch (error) {
    return { ok: false, error: error.message || "Telegram API request failed." };
  }
}

/** Send a message through Telegram Bot API. */
export async function sendMessage(chatId, text, options = {}) {
  return requestTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || "Markdown",
    disable_web_page_preview: options.disablePreview || false,
    ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {})
  });
}

/** Send a photo with caption through Telegram Bot API. */
export async function sendPhoto(chatId, photoUrl, caption = "", options = {}) {
  return requestTelegram("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: options.parseMode || "Markdown",
    ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {})
  });
}

/** Answer an inline callback query through Telegram Bot API. */
export async function answerCallbackQuery(callbackQueryId, text = "", showAlert = false) {
  return requestTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert
  });
}

/** Configure the Telegram webhook. */
export async function setWebhook(webhookUrl, secretToken = null) {
  const payload = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query", "inline_query"]
  };
  if (secretToken) payload.secret_token = secretToken;
  return requestTelegram("setWebhook", payload);
}

/** Get the current Telegram webhook information. */
export async function getWebhookInfo() {
  return requestTelegram("getWebhookInfo");
}

/** Delete the current Telegram webhook. */
export async function deleteWebhook(dropPendingUpdates = false) {
  return requestTelegram("deleteWebhook", { drop_pending_updates: dropPendingUpdates });
}

/** Get the actual bot identity from Telegram. */
export async function getMe() {
  return requestTelegram("getMe");
}
