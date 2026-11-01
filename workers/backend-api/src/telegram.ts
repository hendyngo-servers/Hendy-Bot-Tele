import type { BackendEnv } from "../../../packages/shared/src/cloudflare";
import { isAdmin, constantTimeEqual } from "./auth";
import { upsertTelegramUser } from "./db";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[character] || character));
}

async function telegramCall(env: BackendEnv, method: string, payload: Record<string, unknown>) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Thiếu TELEGRAM_BOT_TOKEN.");
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) throw new Error("Telegram API lỗi HTTP " + response.status + ": " + String(result.description || "unknown"));
  return result;
}

export async function sendTelegramMessage(env: BackendEnv, chatId: string, text: string, replyMarkup?: unknown) {
  return telegramCall(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}

async function handleMessage(env: BackendEnv, message: Record<string, any>) {
  const from = message.from;
  const chatId = message.chat?.id;
  if (!from?.id || !chatId) return;
  const user = {
    id: String(from.id),
    username: String(from.username || ""),
    first_name: String(from.first_name || ""),
    last_name: String(from.last_name || "")
  };
  await upsertTelegramUser(env.DB, user, isAdmin(user.id, env));
  const text = String(message.text || "").trim();
  if (!text.startsWith("/")) return;

  if (text.startsWith("/id")) {
    await sendTelegramMessage(env, String(chatId), "Telegram ID: <code>" + user.id + "</code>");
    return;
  }
  if (text.startsWith("/start") || text.startsWith("/menu") || text.startsWith("/help")) {
    const keyboard = env.WEB_APP_URL ? {
      inline_keyboard: [[{ text: "Mở Hendy App", web_app: { url: env.WEB_APP_URL } }]]
    } : undefined;
    const greeting = escapeHtml(user.first_name || "bạn");
    await sendTelegramMessage(
      env,
      String(chatId),
      "Xin chào <b>" + greeting + "</b>!\\nChào mừng bạn đến với Hendy Bot. Chọn nút bên dưới để mở ứng dụng.",
      keyboard
    );
    return;
  }
  if (text.startsWith("/balance")) {
    const account = await env.DB.prepare("SELECT balance_vnd, vip_level FROM users WHERE telegram_id = ?")
      .bind(user.id).first<{ balance_vnd: number; vip_level: number }>();
    await sendTelegramMessage(
      env, String(chatId),
      "Số dư: <b>" + Number(account?.balance_vnd || 0).toLocaleString("vi-VN") + " VNĐ</b>\\nVIP: <b>" + Number(account?.vip_level || 0) + "</b>"
    );
  }
}

export async function handleTelegramWebhook(request: Request, env: BackendEnv): Promise<Response> {
  const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || !constantTimeEqual(receivedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return Response.json({ ok: false }, { status: 403 });
  }

  const update = await request.json() as Record<string, any>;
  const updateId = Number(update.update_id);
  if (!Number.isSafeInteger(updateId)) return Response.json({ ok: false, error: "update_id không hợp lệ" }, { status: 400 });

  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO telegram_updates (update_id) VALUES (?)")
    .bind(updateId).run();
  if (Number(inserted.meta?.changes || 0) === 0) return Response.json({ ok: true, duplicate: true });

  try {
    if (update.message) await handleMessage(env, update.message);
    if (update.callback_query?.id) {
      await telegramCall(env, "answerCallbackQuery", { callback_query_id: update.callback_query.id });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("telegram webhook handler failed", error instanceof Error ? error.message : "unknown");
    await env.DB.prepare("DELETE FROM telegram_updates WHERE update_id = ?").bind(updateId).run();
    return Response.json({ ok: false }, { status: 500 });
  }
}
