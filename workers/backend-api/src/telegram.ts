import type { BackendEnv } from "../../../packages/shared/src/cloudflare";
import { cleanText } from "../../../packages/shared/src/validation";
import { encryptSecret, serializeCiphertext } from "../../../packages/crypto/src/index";
import { isAdmin, constantTimeEqual } from "./auth";
import { upsertTelegramUser } from "./db";

type Button = { text: string; callback_data?: string; web_app?: { url: string } };
type Keyboard = { inline_keyboard: Button[][] };
type User = { id: string; username: string; first_name: string; last_name: string };

const BRANDS = ["QQ88", "78WIN", "SC88", "C168", "CM88", "F8BET"];
const PRESET_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];
const SESSION_TTL_MS = 10 * 60 * 1000;

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[character] || character));
}
const money = (value: unknown) => Number(value || 0).toLocaleString("vi-VN") + " VNĐ";
const dateText = (value: unknown) => value ? new Date(String(value)).toLocaleString("vi-VN") : "—";
const button = (text: string, data: string): Button => ({ text, callback_data: data });
const homeKeyboard = (): Keyboard => ({ inline_keyboard: [[button("🏠 MENU CHÍNH", "member:home")]] });

export function buildMainMenu(userId: string, env: Pick<BackendEnv, "TELEGRAM_ADMIN_IDS" | "WEB_APP_URL" | "WEB_USER_URL" | "WEB_ADMIN_URL">): Keyboard {
  const rows: Button[][] = [
    [button("🚀 MINIGAME LIVE", "member:live"), button("🧰 THUÊ TOOL", "member:tools")],
    [button("🎁 MUA LÌ XÌ · CODE MÀN · CODE TELE", "member:codes")],
    [button("💳 NẠP TIỀN", "member:wallet"), button("⚙️ OTP & PROXY", "member:otp")],
    [button("🏆 VIP KHO CÔNG CỤ ĐẶC QUYỀN", "member:viptools")],
    [button("💎 TRUNG TÂM KHÁCH HÀNG", "member:customer")],
    [button("⚔️ HỆ THỐNG GHÉP ĐỐI ĐẦU", "member:duel")],
    [button("🎊 GIỚI THIỆU REF", "member:ref"), button("👑 TRUNG TÂM VIP", "member:vip")],
    [button("🗣️ NHÓM CHAT", "member:group"), button("📢 KÊNH THÔNG BÁO", "member:news")],
    [button("🎟️ NHẬP GIFTCODE", "member:gift"), button("🧑‍💻 LIÊN HỆ CSKH", "member:support")]
  ];
  const userUrl = env.WEB_USER_URL || env.WEB_APP_URL || "";
  if (isHttpsUrl(userUrl)) rows.push([{ text: "📱 MỞ HENDY APP", web_app: { url: userUrl } }]);
  if ((env.TELEGRAM_ADMIN_IDS || "").split(",").map(value => value.trim()).filter(Boolean).includes(userId)) {
    const adminUrl = env.WEB_ADMIN_URL || env.WEB_APP_URL || "";
    if (isHttpsUrl(adminUrl)) rows.push([{ text: "🛡️ BẢNG ĐIỀU KHIỂN ADMIN", web_app: { url: adminUrl } }]);
  }
  return { inline_keyboard: rows };
}
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function parseBotCommand(value: string): { name: string; args: string } | null {
  const match = String(value || "").trim().match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  return match ? { name: match[1].toLowerCase(), args: String(match[2] || "").trim() } : null;
}

async function telegramCall(env: BackendEnv, method: string, payload: Record<string, unknown>) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Thiếu TELEGRAM_BOT_TOKEN.");
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
  });
  const result = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) {
    const safeDescription = String(result.description || "unknown").replace(/https?:\/\/api\.telegram\.org\/bot[^/\s]+/gi, "[TELEGRAM_TOKEN]");
    throw new Error("Telegram API lỗi HTTP " + response.status + ": " + safeDescription);
  }
  return result;
}

export async function sendTelegramMessage(env: BackendEnv, chatId: string, text: string, replyMarkup?: unknown) {
  return telegramCall(env, "sendMessage", {
    chat_id: chatId, text: String(text).slice(0, 4000), parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
}
async function editOrSend(env: BackendEnv, chatId: string, messageId: number | undefined, text: string, keyboard: Keyboard) {
  if (messageId) {
    try {
      return await telegramCall(env, "editMessageText", {
        chat_id: chatId, message_id: messageId, text: String(text).slice(0, 4000),
        parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard
      });
    } catch (error) {
      if (/message is not modified/i.test(error instanceof Error ? error.message : "")) return null;
    }
  }
  return sendTelegramMessage(env, chatId, text, keyboard);
}
async function getPaymentSettings(env: BackendEnv): Promise<Record<string, any>> {
  const row = await env.DB.prepare("SELECT value_json FROM app_settings WHERE setting_key='payment'").first<{ value_json: string }>();
  let saved: Record<string, any> = {};
  try { saved = row ? JSON.parse(row.value_json) : {}; } catch { saved = {}; }
  return {
    bankBin: "", bankName: "", bankAccount: "", bankAccountName: "",
    instructions: "Chuyển khoản đúng số tiền và nội dung để quản trị viên đối soát.",
    minDeposit: 10000, referralCommissionPercent: 0, groupChatUrl: "", newsChannelUrl: "",
    supportUsername: "", ...saved
  };
}
async function getUser(env: BackendEnv, userId: string) {
  return env.DB.prepare("SELECT telegram_id,username,display_name,balance_vnd,vip_level,created_at FROM users WHERE telegram_id=?")
    .bind(userId).first<any>();
}
async function getSession(env: BackendEnv, userId: string) {
  const row = await env.DB.prepare("SELECT state,payload_json,expires_at FROM telegram_sessions WHERE telegram_id=?")
    .bind(userId).first<{state:string;payload_json:string;expires_at:string}>();
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) await env.DB.prepare("DELETE FROM telegram_sessions WHERE telegram_id=?").bind(userId).run();
    return null;
  }
  let payload: Record<string, any> = {};
  try { payload = JSON.parse(row.payload_json || "{}"); } catch { payload = {}; }
  return { state: row.state, payload };
}
async function setSession(env: BackendEnv, userId: string, state: string, payload: Record<string, unknown> = {}) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO telegram_sessions (telegram_id,state,payload_json,expires_at) VALUES (?,?,?,?) " +
    "ON CONFLICT(telegram_id) DO UPDATE SET state=excluded.state,payload_json=excluded.payload_json,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP"
  ).bind(userId, state, JSON.stringify(payload), expiresAt).run();
}
async function clearSession(env: BackendEnv, userId: string) {
  await env.DB.prepare("DELETE FROM telegram_sessions WHERE telegram_id=?").bind(userId).run();
}
async function showWelcome(env: BackendEnv, chatId: string, user: User, messageId?: number) {
  const account = await getUser(env, user.id);
  const linked = await env.DB.prepare("SELECT COUNT(*) AS total FROM linked_accounts WHERE telegram_id=?").bind(user.id).first<any>();
  const text = [
    "🤖 <b>HENDY BOT | HENDY CYBERTECH</b>",
    "Xin chào <b>" + escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" ") || "bạn") + "</b>!",
    "🆔 ID Telegram: <code>" + escapeHtml(user.id) + "</code>",
    "━━━━━━━━━━━━━━━━━━━━",
    "💰 Ví chính: <b>" + money(account?.balance_vnd) + "</b>",
    "👑 Cấp thành viên: <b>VIP " + Number(account?.vip_level || 0) + "</b>",
    "🔗 Tài khoản đã liên kết: <b>" + Number(linked?.total || 0) + "</b>",
    "━━━━━━━━━━━━━━━━━━━━",
    "Chọn chức năng bên dưới để tiếp tục."
  ].join("\n");
  return editOrSend(env, chatId, messageId, text, buildMainMenu(user.id, env));
}
async function listCatalog(env: BackendEnv, chatId: string, messageId: number | undefined, userId: string, category: string, title: string) {
  const rows = await env.DB.prepare(
    "SELECT id,name,price_vnd,stock,vip_level,duration_days FROM packages WHERE status='active' AND category=? ORDER BY name LIMIT 20"
  ).bind(category).all<any>();
  const items = rows.results || [];
  const buttons = items.map(item => [button(
    String(item.name + " · " + money(item.price_vnd)).slice(0, 60),
    "member:order:" + item.id
  )]);
  buttons.push([button("📦 ĐƠN GẦN ĐÂY", "member:orders"), button("🏠 MENU CHÍNH", "member:home")]);
  const recent = await env.DB.prepare("SELECT item_name,amount_vnd,status FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 5")
    .bind(userId).all<any>();
  const recentLines = (recent.results || []).map(item =>
    "• " + escapeHtml(item.item_name) + " — " + money(item.amount_vnd) + " · " + escapeHtml(item.status)
  );
  return editOrSend(env, chatId, messageId, [
    "🛍️ <b>" + escapeHtml(title) + "</b>", "━━━━━━━━━━━━━━━━━━━━",
    items.length ? "Chọn sản phẩm bên dưới để tạo yêu cầu đặt dịch vụ:" : "Hiện chưa có sản phẩm nào được Admin đăng bán.",
    "", "<b>ĐƠN GẦN ĐÂY</b>", ...(recentLines.length ? recentLines : ["Chưa có đơn hàng."])
  ].join("\n"), { inline_keyboard: buttons });
}
async function createDeposit(env: BackendEnv, chatId: string, userId: string, amount: number) {
  const settings = await getPaymentSettings(env);
  const min = Math.max(10000, Number(settings.minDeposit || 10000));
  if (!Number.isSafeInteger(amount) || amount < min || amount > 100000000) {
    return sendTelegramMessage(env, chatId, "Số tiền nạp phải từ " + money(min) + " đến " + money(100000000) + ".");
  }
  const reference = "HND" + Date.now().toString(36).toUpperCase() + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO deposits (id,telegram_id,amount_vnd,reference) VALUES (?,?,?,?)")
    .bind(id, userId, amount, reference).run();
  const qrUrl = settings.bankBin && settings.bankAccount
    ? "https://img.vietqr.io/image/" + encodeURIComponent(settings.bankBin) + "-" + encodeURIComponent(settings.bankAccount) +
      "-compact2.png?amount=" + amount + "&addInfo=" + encodeURIComponent(reference) +
      "&accountName=" + encodeURIComponent(settings.bankAccountName || "")
    : null;
  const text = [
    "💳 <b>THÔNG TIN NẠP TIỀN</b>", "━━━━━━━━━━━━━━━━━━━━",
    "Số tiền: <b>" + money(amount) + "</b>",
    "Ngân hàng: <b>" + escapeHtml(settings.bankName || "Chưa cấu hình") + "</b>",
    "Số tài khoản: <code>" + escapeHtml(settings.bankAccount || "Chưa cấu hình") + "</code>",
    "Chủ tài khoản: <b>" + escapeHtml(settings.bankAccountName || "—") + "</b>",
    "Nội dung chuyển khoản: <code>" + escapeHtml(reference) + "</code>",
    "━━━━━━━━━━━━━━━━━━━━", "Trạng thái: <b>Chờ đối soát</b>",
    escapeHtml(settings.instructions || "Chuyển khoản đúng số tiền và nội dung.")
  ];
  const keyboard = { inline_keyboard: [[button("🔄 LỊCH SỬ NẠP", "member:deposit-history")], [button("🏠 MENU CHÍNH", "member:home")]] };
  if (qrUrl) {
    const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendPhoto", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: qrUrl, caption: text.join("\n").slice(0, 1024), parse_mode: "HTML", reply_markup: keyboard })
    });
    const result = await response.json() as { ok?: boolean; description?: string };
    if (!response.ok || !result.ok) throw new Error("Không thể gửi mã QR Telegram: " + String(result.description || response.status));
    return result;
  }
  return sendTelegramMessage(env, chatId, text.join("\n"), keyboard);
}
async function redeemGiftcode(env: BackendEnv, userId: string, codeInput: string) {
  const code = codeInput.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) return { error: "invalid" };
  const gift = await env.DB.prepare("SELECT id,reward_type,reward_value,max_uses,uses,expires_at,active FROM giftcodes WHERE code=?")
    .bind(code).first<any>();
  if (!gift || !gift.active || Number(gift.uses) >= Number(gift.max_uses) ||
    (gift.expires_at && Date.parse(gift.expires_at) < Date.now())) return { error: "invalid" };
  const redemptionId = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO giftcode_redemptions (id,giftcode_id,telegram_id,reward_type,reward_value) " +
      "SELECT ?,g.id,?,g.reward_type,g.reward_value FROM giftcodes g WHERE g.id=? AND g.active=1 AND g.uses<g.max_uses " +
      "AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP) " +
      "AND NOT EXISTS (SELECT 1 FROM giftcode_redemptions r WHERE r.giftcode_id=g.id AND r.telegram_id=?)"
    ).bind(redemptionId, userId, gift.id, userId),
    env.DB.prepare("UPDATE giftcodes SET uses=uses+1 WHERE id=? AND EXISTS (SELECT 1 FROM giftcode_redemptions WHERE id=?)")
      .bind(gift.id, redemptionId),
    env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd+(SELECT reward_value FROM giftcode_redemptions WHERE id=? AND reward_type='balance'),updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM giftcode_redemptions WHERE id=? AND reward_type='balance')")
      .bind(redemptionId, userId, redemptionId),
    env.DB.prepare("UPDATE users SET vip_level=MAX(vip_level,(SELECT reward_value FROM giftcode_redemptions WHERE id=? AND reward_type='vip')),updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM giftcode_redemptions WHERE id=? AND reward_type='vip')")
      .bind(redemptionId, userId, redemptionId)
  ]);
  if (!Number(results[0]?.meta?.changes || 0)) return { error: "used" };
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_id,action,resource_type,resource_id,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, "giftcode.redeem", "giftcode", gift.id, JSON.stringify({ code })).run();
  return { rewardType: gift.reward_type, rewardValue: Number(gift.reward_value), code };
}
async function handlePendingText(env: BackendEnv, message: Record<string, any>, userId: string, chatId: string, text: string) {
  const pending = await getSession(env, userId);
  if (!pending) return false;
  if (text.startsWith("/") && parseBotCommand(text)?.name !== "cancel") return false;
  if (pending.state === "link_username") {
    if (text.length < 2 || text.length > 80) {
      await sendTelegramMessage(env, chatId, "Tên đăng nhập phải từ 2 đến 80 ký tự. Hãy nhập lại.");
      return true;
    }
    await setSession(env, userId, "link_password", { provider: pending.payload.provider, username: text });
    await sendTelegramMessage(env, chatId, "🔒 Gửi mật khẩu tài khoản. Tin nhắn mật khẩu sẽ được Bot yêu cầu xóa sau khi nhận.");
    return true;
  }
  if (pending.state === "link_password") {
    await clearSession(env, userId);
    await telegramCall(env, "deleteMessage", { chat_id: chatId, message_id: message.message_id }).catch(() => undefined);
    if (!env.APP_ENCRYPTION_KEY || text.length > 256) {
      await sendTelegramMessage(env, chatId, "Không thể lưu mật khẩu. Hãy kiểm tra cấu hình mã hóa hoặc nhập mật khẩu ngắn hơn.");
      return true;
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM linked_accounts WHERE telegram_id=?").bind(userId).first<any>();
    if (Number(count?.total || 0) >= 10) {
      await sendTelegramMessage(env, chatId, "Bạn đã đạt giới hạn 10 tài khoản liên kết.");
      return true;
    }
    const encrypted = await encryptSecret(text, env.APP_ENCRYPTION_KEY);
    const provider = String(pending.payload.provider || "");
    const username = String(pending.payload.username || "");
    await env.DB.prepare(
      "INSERT INTO linked_accounts (id,telegram_id,provider,account_name,username,mini_code,secret_ciphertext) VALUES (?,?,?,?,?,?,?)"
    ).bind(crypto.randomUUID(), userId, provider, username, username, username, serializeCiphertext(encrypted)).run();
    await sendTelegramMessage(env, chatId, "✅ Đã liên kết tài khoản <b>" + escapeHtml(provider) + "</b> · " + escapeHtml(username) + ". Mật khẩu đã được mã hóa.", buildMainMenu(userId, env));
    return true;
  }
  if (pending.state === "deposit_amount") {
    await clearSession(env, userId);
    const amount = Number(text.replace(/[,. ]/g, ""));
    if (!/^\d+$/.test(text.replace(/[,. ]/g, "")) || !Number.isSafeInteger(amount)) {
      await sendTelegramMessage(env, chatId, "Số tiền phải là số nguyên dương. Vui lòng thử lại.");
      return true;
    }
    await createDeposit(env, chatId, userId, amount);
    return true;
  }
  if (pending.state === "giftcode") {
    await clearSession(env, userId);
    const result = await redeemGiftcode(env, userId, text);
    if (result.error) {
      const messages: Record<string,string> = { invalid: "Giftcode không tồn tại, hết hạn hoặc đã hết lượt.", used: "Bạn đã sử dụng giftcode này." };
      await sendTelegramMessage(env, chatId, "❌ " + (messages[result.error] || "Không thể đổi giftcode."));
      return true;
    }
    await sendTelegramMessage(env, chatId, result.rewardType === "balance"
      ? "🎉 Giftcode hợp lệ! Ví được cộng " + money(result.rewardValue) + "."
      : "🎉 Giftcode hợp lệ! Bạn được nâng lên VIP " + result.rewardValue + ".");
    return true;
  }
  if (pending.state === "support") {
    if (text.length < 5 || text.length > 2000) {
      await sendTelegramMessage(env, chatId, "Nội dung hỗ trợ cần từ 5 đến 2.000 ký tự.");
      return true;
    }
    await clearSession(env, userId);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tickets (id,telegram_id,message) VALUES (?,?,?)").bind(id, userId, text).run();
    const admins = (env.TELEGRAM_ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (admins[0]) {
      await sendTelegramMessage(env, admins[0], "🧑‍💻 <b>YÊU CẦU CSKH MỚI</b>\nUID: <code>" + userId + "</code>\nTicket: <code>" + id + "</code>\n\n" + escapeHtml(text)).catch(() => undefined);
    }
    await sendTelegramMessage(env, chatId, "✅ Đã gửi yêu cầu hỗ trợ. Mã ticket: " + id.slice(0, 8) + ".", homeKeyboard());
    return true;
  }
  return false;
}
async function showMemberSection(env: BackendEnv, chatId: string, user: User, action: string, messageId?: number) {
  const userId = user.id;
  const settings = await getPaymentSettings(env);
  if (action === "home") {
    await clearSession(env, userId);
    return showWelcome(env, chatId, user, messageId);
  }
  if (action === "live") {
    const rows = await env.DB.prepare("SELECT id,provider,account_name,username,created_at FROM linked_accounts WHERE telegram_id=? ORDER BY created_at DESC")
      .bind(userId).all<any>();
    const accounts = rows.results || [];
    const buttons = accounts.map(item => [button("🗑 " + item.provider + " · " + item.account_name, "member:link-delete:" + item.id)]);
    buttons.push([button("➕ LIÊN KẾT TÀI KHOẢN", "member:link-new")], [button("🏠 MENU CHÍNH", "member:home")]);
    return editOrSend(env, chatId, messageId, [
      "🚀 <b>MINIGAME LIVE · QUẢN LÝ TÀI KHOẢN</b>", "━━━━━━━━━━━━━━━━━━━━",
      "Tài khoản đã liên kết: <b>" + accounts.length + "/10</b>", "",
      ...(accounts.length ? accounts.map((item, index) => (index + 1) + ". <b>" + escapeHtml(item.provider) + "</b> · " + escapeHtml(item.account_name) + " · " + dateText(item.created_at)) : ["Bạn chưa liên kết tài khoản nào."]),
      "", "Mật khẩu không hiển thị trong danh sách."
    ].join("\n"), { inline_keyboard: buttons });
  }
  const categories: Record<string, [string,string]> = {
    tools: ["tool","THUÊ TOOL"], codes: ["code","MUA LÌ XÌ · CODE MÀN · CODE TELE"],
    otp: ["otp_proxy","OTP & PROXY"], viptools: ["tool","KHO CÔNG CỤ ĐẶC QUYỀN"],
    duel: ["duel","HỆ THỐNG GHÉP ĐỐI ĐẦU"]
  };
  if (categories[action]) return listCatalog(env, chatId, messageId, userId, categories[action][0], categories[action][1]);
  if (action === "wallet") {
    await clearSession(env, userId);
    const amounts = PRESET_AMOUNTS.filter(value => value >= Number(settings.minDeposit || 10000));
    const rows: Button[][] = [];
    for (let index = 0; index < amounts.length; index += 2) {
      rows.push(amounts.slice(index, index + 2).map(value => button(money(value), "member:deposit:" + value)));
    }
    rows.push([button("✍️ NHẬP SỐ TIỀN KHÁC", "member:deposit-custom")], [button("📜 LỊCH SỬ GIAO DỊCH", "member:deposit-history")], [button("🏠 MENU CHÍNH", "member:home")]);
    const account = await getUser(env, userId);
    const pending = await env.DB.prepare("SELECT COUNT(*) AS total FROM deposits WHERE telegram_id=? AND status='pending'").bind(userId).first<any>();
    return editOrSend(env, chatId, messageId, [
      "💳 <b>VÍ ĐIỆN TỬ</b>", "━━━━━━━━━━━━━━━━━━━━",
      "Số dư hiện tại: <b>" + money(account?.balance_vnd) + "</b>",
      "Yêu cầu nạp đang chờ: <b>" + Number(pending?.total || 0) + "</b>",
      "Mức nạp tối thiểu: <b>" + money(settings.minDeposit) + "</b>",
      "", "Chọn số tiền cần nạp."
    ].join("\n"), { inline_keyboard: rows });
  }
  if (action === "deposit-history") {
    const result = await env.DB.prepare("SELECT amount_vnd,reference,status,created_at FROM deposits WHERE telegram_id=? ORDER BY created_at DESC LIMIT 10")
      .bind(userId).all<any>();
    return editOrSend(env, chatId, messageId, [
      "📜 <b>LỊCH SỬ NẠP TIỀN</b>", "━━━━━━━━━━━━━━━━━━━━",
      ...((result.results || []).length ? (result.results || []).map(item =>
        "• <b>" + money(item.amount_vnd) + "</b> · " + escapeHtml(item.reference) + "\n  " + dateText(item.created_at) + " · " + escapeHtml(item.status)
      ) : ["Chưa có giao dịch nạp tiền."])
    ].join("\n"), { inline_keyboard: [[button("💳 TẠO YÊU CẦU NẠP", "member:wallet")], [button("🏠 MENU CHÍNH", "member:home")]] });
  }
  if (action === "customer") {
    const [account, linked, deposits, orders, tickets] = await Promise.all([
      getUser(env, userId),
      env.DB.prepare("SELECT COUNT(*) AS total FROM linked_accounts WHERE telegram_id=?").bind(userId).first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM deposits WHERE telegram_id=? AND status='pending'").bind(userId).first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE telegram_id=?").bind(userId).first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM tickets WHERE telegram_id=? AND status IN ('open','answered')").bind(userId).first<any>()
    ]);
    return editOrSend(env, chatId, messageId, [
      "💎 <b>TRUNG TÂM KHÁCH HÀNG</b>", "━━━━━━━━━━━━━━━━━━━━",
      "Thành viên: <b>" + escapeHtml(account?.display_name || "Người dùng") + "</b>",
      "Telegram ID: <code>" + userId + "</code>",
      "Username: " + escapeHtml(account?.username ? "@" + account.username : "—"),
      "Số dư: <b>" + money(account?.balance_vnd) + "</b>",
      "VIP: <b>" + Number(account?.vip_level || 0) + "</b>",
      "Tài khoản liên kết: <b>" + Number(linked?.total || 0) + "</b>",
      "Nạp chờ xử lý: <b>" + Number(deposits?.total || 0) + "</b>",
      "Đơn hàng: <b>" + Number(orders?.total || 0) + "</b>",
      "Ticket đang mở: <b>" + Number(tickets?.total || 0) + "</b>"
    ].join("\n"), { inline_keyboard: [[button("🧑‍💻 GỬI YÊU CẦU CSKH", "member:support")], [button("📦 LỊCH SỬ ĐƠN HÀNG", "member:orders")], [button("🏠 MENU CHÍNH", "member:home")]] });
  }
  if (action === "orders") {
    const result = await env.DB.prepare("SELECT item_name,amount_vnd,status,created_at,expires_at FROM orders WHERE telegram_id=? ORDER BY created_at DESC LIMIT 20")
      .bind(userId).all<any>();
    return editOrSend(env, chatId, messageId, [
      "📦 <b>LỊCH SỬ ĐƠN HÀNG</b>", "━━━━━━━━━━━━━━━━━━━━",
      ...((result.results || []).length ? (result.results || []).map(item =>
        "• <b>" + escapeHtml(item.item_name) + "</b> · " + money(item.amount_vnd) +
        "\n  " + dateText(item.created_at) + " · " + escapeHtml(item.status) +
        (item.expires_at ? " · Hết hạn: " + dateText(item.expires_at) : "")
      ) : ["Bạn chưa có đơn hàng."])
    ].join("\n"), homeKeyboard());
  }
  if (action === "vip") {
    const result = await env.DB.prepare("SELECT id,name,price_vnd,vip_level FROM packages WHERE category='vip' AND status='active' ORDER BY price_vnd LIMIT 10").all<any>();
    const rows = (result.results || []).map(item => [button(item.name + " · " + money(item.price_vnd), "member:order:" + item.id)]);
    rows.push([button("🏠 MENU CHÍNH", "member:home")]);
    const account = await getUser(env, userId);
    return editOrSend(env, chatId, messageId, [
      "👑 <b>TRUNG TÂM VIP</b>", "━━━━━━━━━━━━━━━━━━━━",
      "Cấp hiện tại: <b>VIP " + Number(account?.vip_level || 0) + "</b>",
      "", "VIP 0 · Thành viên thường", "VIP 1–10 · Đặc quyền theo sản phẩm được Admin cấu hình", "",
      "<b>GÓI NÂNG CẤP</b>",
      ...((result.results || []).map(item => "• " + escapeHtml(item.name) + " — " + money(item.price_vnd)).length
        ? (result.results || []).map(item => "• " + escapeHtml(item.name) + " — " + money(item.price_vnd))
        : ["Chưa có gói VIP."])
    ].join("\n"), { inline_keyboard: rows });
  }
  if (action === "ref") {
    const [account, stats, referrals] = await Promise.all([
      getUser(env, userId),
      env.DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(commission_vnd),0) AS commission FROM referrals WHERE referrer_id=?").bind(userId).first<any>(),
      env.DB.prepare("SELECT referred_id,created_at FROM referrals WHERE referrer_id=? ORDER BY created_at DESC LIMIT 10").bind(userId).all<any>()
    ]);
    const botName = String(env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
    const link = /^[a-zA-Z0-9_]{5,32}$/.test(botName) ? "https://t.me/" + botName + "?start=ref_" + userId : "";
    return editOrSend(env, chatId, messageId, [
      "🎊 <b>CHƯƠNG TRÌNH GIỚI THIỆU REF</b>", "━━━━━━━━━━━━━━━━━━━━",
      "Mã giới thiệu: <code>ref_" + userId + "</code>",
      "Liên kết: " + escapeHtml(link || "Admin chưa cấu hình BOT_USERNAME."),
      "Số thành viên đã mời: <b>" + Number(stats?.total || 0) + "</b>",
      "Hoa hồng tích lũy: <b>" + money(stats?.commission) + "</b>",
      "Tỷ lệ hiện tại: <b>" + Number(settings.referralCommissionPercent || 0) + "%</b>"
    ].join("\n"), { inline_keyboard: [
      ...(link ? [[{ text: "🔗 CHIA SẺ LINK GIỚI THIỆU", url: link } as any]] : []),
      [button("🏠 MENU CHÍNH", "member:home")]
    ] });
  }
  if (action === "gift" || action === "support") {
    await setSession(env, userId, action === "gift" ? "giftcode" : "support");
    return editOrSend(env, chatId, messageId, action === "gift"
      ? "🎟️ <b>NHẬP GIFTCODE</b>\nGửi mã giftcode vào khung chat này. Bạn có 10 phút để nhập. Dùng /cancel để hủy."
      : "🧑‍💻 <b>LIÊN HỆ CSKH</b>\nGửi nội dung cần hỗ trợ (5–2.000 ký tự). Ticket sẽ được chuyển tới Admin. Dùng /cancel để hủy.",
      { inline_keyboard: [[button("❌ HỦY", "member:home")]] });
  }
  if (action === "group" || action === "news") {
    const target = action === "group" ? settings.groupChatUrl : settings.newsChannelUrl;
    const title = action === "group" ? "NHÓM CHAT" : "KÊNH THÔNG BÁO";
    const rows: Button[][] = [];
    if (isHttpsUrl(String(target || ""))) rows.push([{ text: "MỞ " + title, url: String(target) } as any]);
    rows.push([button("🏠 MENU CHÍNH", "member:home")]);
    return editOrSend(env, chatId, messageId, "🔗 <b>" + title + "</b>\n" +
      (target ? "Nhấn nút bên dưới để mở Telegram." : "Admin chưa cấu hình liên kết."), { inline_keyboard: rows });
  }
  return editOrSend(env, chatId, messageId, "Chức năng chưa được hỗ trợ.", homeKeyboard());
}
async function handleOrder(env: BackendEnv, chatId: string, userId: string, packageId: string) {
  const product = await env.DB.prepare("SELECT id,name,category,price_vnd,vip_level,duration_days,status,stock FROM packages WHERE id=?")
    .bind(packageId).first<any>();
  if (!product || product.status !== "active" || (product.stock !== null && Number(product.stock) <= 0)) {
    return sendTelegramMessage(env, chatId, "Sản phẩm không còn khả dụng.", homeKeyboard());
  }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO orders (id,telegram_id,package_id,item_name,category,amount_vnd,vip_level,duration_days) VALUES (?,?,?,?,?,?,?,?)")
    .bind(id, userId, product.id, product.name, product.category, product.price_vnd, product.vip_level, product.duration_days).run();
  return sendTelegramMessage(env, chatId, [
    "✅ <b>ĐÃ TẠO YÊU CẦU ĐẶT DỊCH VỤ</b>", "━━━━━━━━━━━━━━━━━━━━",
    "Sản phẩm: <b>" + escapeHtml(product.name) + "</b>",
    "Giá: <b>" + money(product.price_vnd) + "</b>",
    "Mã đơn: <code>" + id + "</code>",
    "Trạng thái: <b>Chờ Admin xử lý</b>",
    "Đơn chỉ trừ số dư khi được duyệt."
  ].join("\n"), { inline_keyboard: [[button("📦 LỊCH SỬ ĐƠN HÀNG", "member:orders")], [button("🏠 MENU CHÍNH", "member:home")]] });
}
async function handleCallback(env: BackendEnv, query: Record<string, any>) {
  const from = query.from;
  if (!from?.id) return;
  const user: User = {
    id: String(from.id), username: String(from.username || ""),
    first_name: String(from.first_name || ""), last_name: String(from.last_name || "")
  };
  const chatId = String(query.message?.chat?.id || user.id);
  const messageId = Number(query.message?.message_id) || undefined;
  const data = String(query.data || "");
  await telegramCall(env, "answerCallbackQuery", { callback_query_id: query.id }).catch(() => undefined);
  await upsertTelegramUser(env.DB, user, isAdmin(user.id, env));
  if (data === "member:link-new") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM linked_accounts WHERE telegram_id=?").bind(user.id).first<any>();
    if (Number(count?.total || 0) >= 10) return editOrSend(env, chatId, messageId, "Bạn đã đạt giới hạn 10 tài khoản liên kết.", homeKeyboard());
    const rows = BRANDS.map(brand => [button(brand, "member:link-brand:" + brand)]);
    rows.push([button("🏠 MENU CHÍNH", "member:home")]);
    return editOrSend(env, chatId, messageId, "🔐 <b>CHỌN NHÀ CUNG CẤP</b>\nChọn thương hiệu tài khoản muốn liên kết:", { inline_keyboard: rows });
  }
  if (data.startsWith("member:link-brand:")) {
    const provider = data.slice("member:link-brand:".length).toUpperCase();
    if (!BRANDS.includes(provider)) return sendTelegramMessage(env, chatId, "Nhà cung cấp không hợp lệ.");
    await setSession(env, user.id, "link_username", { provider });
    return editOrSend(env, chatId, messageId, "🔐 <b>LIÊN KẾT " + escapeHtml(provider) + "</b>\nGửi tên đăng nhập tài khoản vào khung chat. Dùng /cancel để hủy.", { inline_keyboard: [[button("❌ HỦY", "member:live")]] });
  }
  if (data.startsWith("member:link-delete:")) {
    const result = await env.DB.prepare("DELETE FROM linked_accounts WHERE id=? AND telegram_id=?")
      .bind(data.slice("member:link-delete:".length), user.id).run();
    return editOrSend(env, chatId, messageId, Number(result.meta?.changes || 0) ? "✅ Đã xóa tài khoản liên kết." : "Không tìm thấy tài khoản cần xóa.", { inline_keyboard: [[button("↩️ QUẢN LÝ TÀI KHOẢN", "member:live")]] });
  }
  if (data.startsWith("member:deposit:")) return createDeposit(env, chatId, user.id, Number(data.slice("member:deposit:".length)));
  if (data === "member:deposit-custom") {
    await setSession(env, user.id, "deposit_amount");
    return editOrSend(env, chatId, messageId, "✍️ <b>NHẬP SỐ TIỀN NẠP</b>\nGửi số tiền bằng VNĐ (chỉ nhập chữ số). Dùng /cancel để hủy.", { inline_keyboard: [[button("❌ HỦY", "member:wallet")]] });
  }
  if (data.startsWith("member:order:")) return handleOrder(env, chatId, user.id, data.slice("member:order:".length));
  const action = data.match(/^member:([a-z-]+)$/)?.[1];
  if (!action) return;
  if (action === "admin-unavailable" && !isAdmin(user.id, env)) return sendTelegramMessage(env, chatId, "Bạn không có quyền quản trị.");
  return showMemberSection(env, chatId, user, action, messageId);
}
async function handleAdminCommand(env: BackendEnv, chatId: string, userId: string, name: string, args: string) {
  if (!isAdmin(userId, env)) return false;
  if (name === "admin") {
    const adminUrl = env.WEB_ADMIN_URL || env.WEB_APP_URL || "";
    return sendTelegramMessage(env, chatId, "🛡️ <b>HENDY ADMIN CENTER</b>\nChọn nút để mở bảng điều khiển quản trị.", isHttpsUrl(adminUrl)
      ? { inline_keyboard: [[{ text: "🛡️ MỞ ADMIN CENTER", web_app: { url: adminUrl } }]] }
      : undefined).then(() => true);
  }
  if (name === "status") {
    const [users, accounts, deposits, orders, tickets] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM linked_accounts").first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM deposits WHERE status='pending'").first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM orders WHERE status='pending'").first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM tickets WHERE status IN ('open','answered')").first<any>()
    ]);
    await sendTelegramMessage(env, chatId, [
      "⚙️ <b>TRẠNG THÁI HỆ THỐNG</b>", "👥 Thành viên: " + Number(users?.total || 0),
      "🔗 Tài khoản liên kết: " + Number(accounts?.total || 0),
      "💳 Nạp chờ duyệt: " + Number(deposits?.total || 0),
      "📦 Đơn chờ xử lý: " + Number(orders?.total || 0),
      "🧑‍💻 Ticket đang mở: " + Number(tickets?.total || 0)
    ].join("\n"));
    return true;
  }
  if (name === "user") {
    const target = args.split(/\s+/)[0] || "";
    const user = target ? await getUser(env, target) : null;
    await sendTelegramMessage(env, chatId, user
      ? "👤 <b>THÔNG TIN THÀNH VIÊN</b>\nID: <code>" + target + "</code>\nTên: " + escapeHtml(user.display_name) +
        "\nUsername: " + escapeHtml(user.username ? "@" + user.username : "—") + "\nSố dư: " + money(user.balance_vnd) + "\nVIP: " + Number(user.vip_level || 0)
      : "Không tìm thấy thành viên. Cú pháp: /user ID");
    return true;
  }
  if (name === "addmoney") {
    const [target, amountText, ...noteParts] = args.split(/\s+/);
    const amount = Number(amountText);
    if (!/^\d+$/.test(target || "") || !/^-?\d+$/.test(amountText || "") || !Number.isSafeInteger(amount) || amount === 0) {
      await sendTelegramMessage(env, chatId, "Cú pháp: /addmoney ID SỐ_TIỀN [LÝ_DO]");
      return true;
    }
    const note = cleanText(noteParts.join(" ") || "Điều chỉnh số dư bằng lệnh Admin.", 200);
    const reference = "ADMIN-" + crypto.randomUUID();
    const updated = await env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd+?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND balance_vnd+?>=0")
      .bind(amount, target, amount).run();
    if (!Number(updated.meta?.changes || 0)) {
      await sendTelegramMessage(env, chatId, "Không tìm thấy thành viên hoặc số dư mới không hợp lệ.");
    } else {
      await env.DB.prepare("INSERT INTO balance_transactions (id,telegram_id,amount_vnd,reference,description) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID(), target, amount, reference, note).run();
      await sendTelegramMessage(env, chatId, "✅ Đã cập nhật số dư " + target + " " + (amount > 0 ? "+" : "") + money(amount) + ".");
      await sendTelegramMessage(env, target, "💰 Số dư vừa được Admin điều chỉnh: " + (amount > 0 ? "+" : "") + money(amount) + ".").catch(() => undefined);
    }
    return true;
  }
  if (name === "broadcast") {
    if (args.length < 2 || args.length > 3500) {
      await sendTelegramMessage(env, chatId, "Cú pháp: /broadcast nội dung (tối đa 3.500 ký tự).");
      return true;
    }
    const users = await env.DB.prepare("SELECT telegram_id FROM users ORDER BY created_at DESC LIMIT 25").all<{telegram_id:string}>();
    let sent = 0;
    let failed = 0;
    for (const user of users.results || []) {
      try { await sendTelegramMessage(env, user.telegram_id, "📢 <b>THÔNG BÁO TỪ HENDY</b>\n\n" + escapeHtml(args)); sent += 1; }
      catch { failed += 1; }
    }
    await sendTelegramMessage(env, chatId, "📢 Hoàn tất gửi thông báo.\nTổng: " + (users.results || []).length + "\nThành công: " + sent + "\nThất bại: " + failed);
    return true;
  }
  return false;
}
async function handleMessage(env: BackendEnv, message: Record<string, any>) {
  const from = message.from;
  const chatId = message.chat?.id;
  if (!from?.id || !chatId) return;
  const user: User = {
    id: String(from.id), username: String(from.username || ""),
    first_name: String(from.first_name || ""), last_name: String(from.last_name || "")
  };
  const existing = await getUser(env, user.id);
  await upsertTelegramUser(env.DB, user, isAdmin(user.id, env));
  const text = String(message.text || "").trim();
  const command = parseBotCommand(text);
  if (command?.name === "cancel") {
    await clearSession(env, user.id);
    await sendTelegramMessage(env, String(chatId), "Đã hủy thao tác đang thực hiện.", buildMainMenu(user.id, env));
    return;
  }
  if (command?.name === "start" || command?.name === "menu" || command?.name === "help") {
    const referral = command.args.match(/^ref_(\d{1,20})$/);
    if (!existing && referral && referral[1] !== user.id) {
      await env.DB.prepare("INSERT OR IGNORE INTO referrals (id,referrer_id,referred_id) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE telegram_id=?)")
        .bind(crypto.randomUUID(), referral[1], user.id, referral[1]).run();
    }
    await clearSession(env, user.id);
    await showWelcome(env, String(chatId), user);
    return;
  }
  if (command?.name === "id") {
    await sendTelegramMessage(env, String(chatId), "Telegram ID: <code>" + user.id + "</code>");
    return;
  }
  if (command?.name === "balance") {
    const account = await getUser(env, user.id);
    await sendTelegramMessage(env, String(chatId), "Số dư: <b>" + money(account?.balance_vnd) + "</b>\nVIP: <b>" + Number(account?.vip_level || 0) + "</b>");
    return;
  }
  if (command?.name === "wallet") return showMemberSection(env, String(chatId), user, "wallet");
  if (command?.name === "orders") return showMemberSection(env, String(chatId), user, "orders");
  if (command?.name === "support") {
    await setSession(env, user.id, "support");
    await sendTelegramMessage(env, String(chatId), "Gửi nội dung cần hỗ trợ (5–2.000 ký tự). Dùng /cancel để hủy.");
    return;
  }
  if (command && await handleAdminCommand(env, String(chatId), user.id, command.name, command.args)) return;
  if (typeof message.text === "string" && await handlePendingText(env, message, user.id, String(chatId), text)) return;
}
export async function handleTelegramWebhook(request: Request, env: BackendEnv): Promise<Response> {
  const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || !constantTimeEqual(receivedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return Response.json({ ok: false }, { status: 403 });
  }
  let update: Record<string, any>;
  try { update = await request.json() as Record<string, any>; }
  catch { return Response.json({ ok: false, error: "JSON không hợp lệ" }, { status: 400 }); }
  const updateId = Number(update.update_id);
  if (!Number.isSafeInteger(updateId)) return Response.json({ ok: false, error: "update_id không hợp lệ" }, { status: 400 });
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO telegram_updates (update_id) VALUES (?)").bind(updateId).run();
  if (Number(inserted.meta?.changes || 0) === 0) return Response.json({ ok: true, duplicate: true });
  try {
    if (update.message) await handleMessage(env, update.message);
    if (update.callback_query) await handleCallback(env, update.callback_query);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("telegram webhook handler failed", error instanceof Error ? error.message : "unknown");
    await env.DB.prepare("DELETE FROM telegram_updates WHERE update_id=?").bind(updateId).run();
    return Response.json({ ok: false }, { status: 500 });
  }
}
