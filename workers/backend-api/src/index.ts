import { encryptSecret } from "../../../packages/crypto/src/index";

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ALLOWED_ORIGINS: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ADMIN_IDS?: string;
  TELEGRAM_WEBAPP_URL?: string;
  TELEGRAM_ADMIN_WEBAPP_URL?: string;
  APP_ENCRYPTION_KEY?: string;
}
type TelegramUser = { id: string; username: string; first_name: string; last_name: string };
type PackageRow = { id: string; slug: string; name: string; description: string; category: string; price_vnd: number; status: string };
const encoder = new TextEncoder();
const MAX_JSON_BYTES = 32 * 1024;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...headers
    }
  });
function corsHeaders(req: Request, env: Env): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
  const headers: Record<string, string> = { "vary": "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    headers["access-control-allow-headers"] = "content-type,x-telegram-init-data";
    headers["access-control-max-age"] = "600";
  }
  return headers;
}
async function readJson<T>(req: Request, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Dữ liệu gửi lên quá lớn.");
  const text = await req.text();
  if (encoder.encode(text).byteLength > maxBytes) throw new HttpError(413, "Dữ liệu gửi lên quá lớn.");
  try { return JSON.parse(text) as T; }
  catch { throw new HttpError(400, "Nội dung JSON không hợp lệ."); }
}
function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
async function signHmac(key: CryptoKey, value: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}
async function verifyInitData(raw: string, botToken: string): Promise<TelegramUser | null> {
  if (!raw || raw.length > 8192 || !botToken) return null;
  try {
    const params = new URLSearchParams(raw);
    const hash = (params.get("hash") || "").toLowerCase();
    const authDate = Number(params.get("auth_date") || 0);
    const now = Math.floor(Date.now() / 1000);
    if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isInteger(authDate) || authDate > now + 60 || now - authDate > 86400) return null;

    params.delete("hash");
    const checkString = Array.from(params.entries())
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, value]) => key + "=" + value)
      .join("\n");

    const webAppKey = await crypto.subtle.importKey(
      "raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const secret = await signHmac(webAppKey, botToken);
    const dataKey = await crypto.subtle.importKey(
      "raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const calculated = toHex(new Uint8Array(await signHmac(dataKey, checkString)));
    if (!safeEqual(calculated, hash)) return null;

    const user = JSON.parse(params.get("user") || "{}") as Record<string, unknown>;
    const id = String(user.id || "");
    if (!/^\d{1,24}$/.test(id)) return null;
    return {
      id,
      username: String(user.username || "").slice(0, 64),
      first_name: String(user.first_name || "").slice(0, 128),
      last_name: String(user.last_name || "").slice(0, 128)
    };
  } catch {
    return null;
  }
}
function adminIds(env: Env): Set<string> {
  return new Set((env.TELEGRAM_ADMIN_IDS || "").split(",").map(v => v.trim()).filter(Boolean));
}
function isAdmin(id: string, env: Env): boolean { return adminIds(env).has(id); }
async function maintenanceEnabled(env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value_json FROM app_settings WHERE setting_key='maintenance_mode'").first<{ value_json: string }>();
  try { return row ? JSON.parse(row.value_json) === true : false; } catch { return false; }
}
async function authenticate(req: Request, env: Env): Promise<TelegramUser> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new HttpError(503, "Chưa cấu hình xác thực Telegram.");
  const user = await verifyInitData(req.headers.get("X-Telegram-Init-Data") || "", env.TELEGRAM_BOT_TOKEN);
  if (!user) throw new HttpError(401, "Phiên Telegram không hợp lệ hoặc đã hết hạn. Hãy mở lại Mini App từ bot.");
  const role = isAdmin(user.id, env) ? "admin" : "user";
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  await env.DB.prepare(
    "INSERT INTO users (telegram_id,username,display_name,role) VALUES (?,?,?,?) " +
    "ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name," +
    "role=CASE WHEN excluded.role='admin' THEN 'admin' ELSE users.role END,updated_at=CURRENT_TIMESTAMP"
  ).bind(user.id, user.username || null, displayName, role).run();
  return user;
}
async function requireAdmin(req: Request, env: Env): Promise<TelegramUser> {
  const user = await authenticate(req, env);
  if (!isAdmin(user.id, env)) throw new HttpError(403, "Bạn không có quyền quản trị.");
  return user;
}
async function audit(env: Env, actor: string, action: string, type: string, resourceId: string | null = null) {
  await env.DB.prepare(
    "INSERT INTO audit_logs (id,actor_id,action,resource_type,resource_id) VALUES (?,?,?,?,?)"
  ).bind(crypto.randomUUID(), actor, action, type, resourceId).run();
}
async function telegramSend(env: Env, chatId: string, message: string, showApp = false, showAdminApp = false): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot is not configured");
  const appUrl = showAdminApp ? env.TELEGRAM_ADMIN_WEBAPP_URL : env.TELEGRAM_WEBAPP_URL;
  const buttonText = showAdminApp ? "Mở Hendy Control Center" : "Mở Hendy App";
  const replyMarkup = (showApp || showAdminApp) && appUrl
    ? { inline_keyboard: [[{ text: buttonText, web_app: { url: appUrl } }]] }
    : undefined;
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, reply_markup: replyMarkup })
  });
  if (!response.ok) throw new Error("Telegram API request failed");
  const result = await response.json() as { ok?: boolean };
  if (!result.ok) throw new Error("Telegram rejected sendMessage");
}
async function telegramWebhook(req: Request, env: Env): Promise<Response> {
  const received = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(received, env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }
  const update = await readJson<Record<string, any>>(req, 64 * 1024);
  const updateId = Number(update.update_id);
  if (Number.isInteger(updateId)) {
    const claimed = await env.DB.prepare("INSERT OR IGNORE INTO webhook_updates (update_id) VALUES (?)").bind(updateId).run();
    if ((claimed.meta?.changes || 0) === 0) return json({ ok: true, duplicate: true });
  }
  const message = update.message;
  if (message?.from?.id && message?.chat?.id) {
    const user = message.from;
    const id = String(user.id);
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ");
    await env.DB.prepare(
      "INSERT INTO users (telegram_id,username,display_name,role) VALUES (?,?,?,?) " +
      "ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP"
    ).bind(id, user.username || null, displayName, isAdmin(id, env) ? "admin" : "user").run();
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (text.startsWith("/start")) {
      await telegramSend(env, String(message.chat.id), "Chào mừng bạn đến với Hendy. Nhấn nút bên dưới để mở ứng dụng.", true);
    } else if (text === "/id") {
      await telegramSend(env, String(message.chat.id), "Telegram ID: " + id);
    } else if (text === "/admin") {
      if (isAdmin(id, env) && env.TELEGRAM_ADMIN_WEBAPP_URL) {
        await telegramSend(env, String(message.chat.id), "Bảng điều khiển quản trị Hendy.", false, true);
      } else {
        await telegramSend(env, String(message.chat.id), "Bạn không có quyền truy cập hoặc trang quản trị chưa được cấu hình.");
      }
    } else if (text === "/help") {
      await telegramSend(env, String(message.chat.id), "Lệnh hỗ trợ: /start — mở ứng dụng; /admin — mở quản trị (admin); /id — xem Telegram ID; /help — trợ giúp.", true);
    }
  }
  return json({ ok: true });
}
function money(value: unknown, min = 0, max = 2000000000): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new HttpError(400, "Số tiền hoặc số lượng không hợp lệ.");
  return parsed;
}
function shortText(value: unknown, field: string, max: number, min = 1): string {
  if (typeof value !== "string") throw new HttpError(400, field + " không hợp lệ.");
  const result = value.trim();
  if (result.length < min || result.length > max) throw new HttpError(400, field + " phải có từ " + min + " đến " + max + " ký tự.");
  return result;
}
async function handleApi(req: Request, env: Env, url: URL, headers: HeadersInit): Promise<Response> {
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/v1/packages") {
    if (await maintenanceEnabled(env)) throw new HttpError(503, "Hệ thống đang bảo trì. Vui lòng quay lại sau.");
    const rows = await env.DB.prepare(
      "SELECT id,slug,name,description,category,price_vnd FROM packages WHERE status='active' ORDER BY created_at DESC LIMIT 100"
    ).all<PackageRow>();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (path.startsWith("/api/v1/admin/")) return handleAdmin(req, env, url, headers);

  const user = await authenticate(req, env);
  if (!isAdmin(user.id, env) && await maintenanceEnabled(env)) throw new HttpError(503, "Hệ thống đang bảo trì. Vui lòng quay lại sau.");
  if (req.method === "GET" && path === "/api/v1/me") {
    const row = await env.DB.prepare(
      "SELECT telegram_id,username,display_name,role,balance_vnd,vip_level,created_at FROM users WHERE telegram_id=?"
    ).bind(user.id).first();
    return json({ ok: true, data: row }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/me/orders") {
    const rows = await env.DB.prepare(
      "SELECT o.id,o.quantity,o.total_vnd,o.status,o.created_at,p.name AS package_name " +
      "FROM orders o JOIN packages p ON p.id=o.package_id WHERE o.telegram_id=? ORDER BY o.created_at DESC LIMIT 50"
    ).bind(user.id).all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/me/deposits") {
    const rows = await env.DB.prepare(
      "SELECT id,amount_vnd,reference,status,created_at,reviewed_at FROM deposits WHERE telegram_id=? ORDER BY created_at DESC LIMIT 50"
    ).bind(user.id).all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "POST" && path === "/api/v1/orders") {
    const body = await readJson<Record<string, unknown>>(req);
    const packageId = shortText(body.packageId, "Mã gói", 80);
    const quantity = money(body.quantity ?? 1, 1, 100);
    const pkg = await env.DB.prepare("SELECT id,price_vnd,status FROM packages WHERE id=?")
      .bind(packageId).first<{ id: string; price_vnd: number; status: string }>();
    if (!pkg || pkg.status !== "active") throw new HttpError(404, "Gói dịch vụ không tồn tại hoặc đã ẩn.");
    const total = pkg.price_vnd * quantity;
    if (!Number.isSafeInteger(total) || total < 0) throw new HttpError(400, "Tổng tiền không hợp lệ.");
    const account = await env.DB.prepare("SELECT balance_vnd FROM users WHERE telegram_id=?")
      .bind(user.id).first<{ balance_vnd: number }>();
    const oldBalance = account?.balance_vnd ?? 0;
    if (oldBalance < total) throw new HttpError(409, "Số dư không đủ. Vui lòng nạp thêm.");
    const id = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd-?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND balance_vnd=? AND balance_vnd>=?")
        .bind(total, user.id, oldBalance, total),
      env.DB.prepare(
        "INSERT INTO orders (id,telegram_id,package_id,quantity,total_vnd,status) " +
        "SELECT ?,?,?,?,?,'pending' FROM users WHERE telegram_id=? AND balance_vnd=?"
      ).bind(id, user.id, pkg.id, quantity, total, user.id, oldBalance - total)
    ]);
    if ((results[0]?.meta?.changes || 0) !== 1 || (results[1]?.meta?.changes || 0) !== 1) {
      throw new HttpError(409, "Số dư vừa thay đổi. Vui lòng tải lại và thử lại.");
    }
    await audit(env, user.id, "order.create", "order", id);
    return json({ ok: true, data: { id, totalVnd: total, status: "pending" } }, 201, headers);
  }
  if (req.method === "POST" && path === "/api/v1/deposits") {
    const body = await readJson<Record<string, unknown>>(req);
    const amount = money(body.amountVnd, 10000, 100000000);
    const id = crypto.randomUUID();
    const reference = "HD" + crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    await env.DB.prepare(
      "INSERT INTO deposits (id,telegram_id,amount_vnd,reference,status) VALUES (?,?,?,?,'pending')"
    ).bind(id, user.id, amount, reference).run();
    await audit(env, user.id, "deposit.create", "deposit", id);
    return json({ ok: true, data: {
      id, reference, amountVnd: amount, status: "pending",
      instruction: "Chuyển khoản theo thông tin thanh toán do quản trị viên công bố và ghi đúng nội dung chuyển khoản."
    } }, 201, headers);
  }
  if (req.method === "GET" && path === "/api/v1/me/tickets") {
    const rows = await env.DB.prepare(
      "SELECT id,subject,message,status,admin_reply,created_at,updated_at FROM support_tickets WHERE telegram_id=? ORDER BY created_at DESC LIMIT 30"
    ).bind(user.id).all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "POST" && path === "/api/v1/tickets") {
    const body = await readJson<Record<string, unknown>>(req);
    const id = crypto.randomUUID();
    const subject = shortText(body.subject, "Tiêu đề", 120);
    const message = shortText(body.message, "Nội dung", 4000);
    await env.DB.prepare(
      "INSERT INTO support_tickets (id,telegram_id,subject,message,status) VALUES (?,?,?,?,'open')"
    ).bind(id, user.id, subject, message).run();
    await audit(env, user.id, "ticket.create", "support_ticket", id);
    return json({ ok: true, data: { id, status: "open" } }, 201, headers);
  }
  if (req.method === "GET" && path === "/api/v1/accounts") {
    const rows = await env.DB.prepare(
      "SELECT id,provider,account_name,created_at FROM linked_accounts WHERE telegram_id=? ORDER BY created_at DESC"
    ).bind(user.id).all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "POST" && path === "/api/v1/accounts") {
    if (!env.APP_ENCRYPTION_KEY) throw new HttpError(503, "Chưa cấu hình khóa mã hóa tài khoản.");
    const body = await readJson<Record<string, unknown>>(req);
    const provider = shortText(body.provider, "Nhà cung cấp", 40);
    const accountName = shortText(body.accountName, "Tên tài khoản", 120);
    const secret = shortText(body.secret, "Thông tin bí mật", 4000);
    const ciphertext = await encryptSecret(secret, env.APP_ENCRYPTION_KEY);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO linked_accounts (id,telegram_id,provider,account_name,secret_ciphertext) VALUES (?,?,?,?,?)"
      ).bind(id, user.id, provider, accountName, ciphertext).run();
    } catch {
      throw new HttpError(409, "Tài khoản này đã được liên kết hoặc dữ liệu không hợp lệ.");
    }
    await audit(env, user.id, "account.link", "linked_account", id);
    return json({ ok: true, data: { id, provider, accountName } }, 201, headers);
  }
  const accountDelete = path.match(/^\/api\/v1\/accounts\/([a-f0-9-]{36})$/i);
  if (req.method === "DELETE" && accountDelete) {
    const result = await env.DB.prepare("DELETE FROM linked_accounts WHERE id=? AND telegram_id=?")
      .bind(accountDelete[1], user.id).run();
    if ((result.meta?.changes || 0) !== 1) throw new HttpError(404, "Không tìm thấy tài khoản liên kết.");
    await audit(env, user.id, "account.unlink", "linked_account", accountDelete[1]);
    return json({ ok: true }, 200, headers);
  }
  if (req.method === "GET" && path.startsWith("/api/v1/files/")) {
    let key = "";
    try { key = decodeURIComponent(path.slice("/api/v1/files/".length)); }
    catch { throw new HttpError(400, "Tên tệp không hợp lệ."); }
    if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\")) throw new HttpError(400, "Tên tệp không hợp lệ.");
    if (!isAdmin(user.id, env) && !key.startsWith(user.id + "/")) throw new HttpError(403, "Không có quyền truy cập tệp này.");
    const object = await env.FILES.get(key);
    if (!object) throw new HttpError(404, "Không tìm thấy tệp.");
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "application/octet-stream",
        "cache-control": "private, no-store",
        "content-length": String(object.size),
        "x-content-type-options": "nosniff",
        ...headers
      }
    });
  }
  throw new HttpError(404, "Không tìm thấy API.");
}
async function handleAdmin(req: Request, env: Env, url: URL, headers: HeadersInit): Promise<Response> {
  const user = await requireAdmin(req, env);
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/v1/admin/overview") {
    const [users, pendingOrders, pendingDeposits, openTickets, completedValue] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='pending'").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM deposits WHERE status='pending'").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE status IN ('open','answered')").first<{ n: number }>(),
      env.DB.prepare("SELECT COALESCE(SUM(total_vnd),0) AS n FROM orders WHERE status='completed'").first<{ n: number }>()
    ]);
    return json({ ok: true, data: {
      users: users?.n || 0, pendingOrders: pendingOrders?.n || 0,
      pendingDeposits: pendingDeposits?.n || 0, openTickets: openTickets?.n || 0, completedOrderValueVnd: completedValue?.n || 0
    } }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/admin/settings") {
    const rows = await env.DB.prepare("SELECT setting_key,value_json,updated_at FROM app_settings ORDER BY setting_key").all<{ setting_key: string; value_json: string; updated_at: string }>();
    return json({ ok: true, data: (rows.results || []).map(row => {
      let value: unknown = null;
      try { value = JSON.parse(row.value_json); } catch { value = null; }
      return { key: row.setting_key, value, updatedAt: row.updated_at };
    }) }, 200, headers);
  }
  if (req.method === "PUT" && path === "/api/v1/admin/settings") {
    const body = await readJson<Record<string, unknown>>(req);
    if (!isRecord(body.settings)) throw new HttpError(400, "Cấu hình không hợp lệ.");
    const allowed = new Set(["site_name", "support_username", "news_channel_url", "group_chat_url", "maintenance_mode", "bank_transfer_info", "terms_url"]);
    const statements: D1PreparedStatement[] = [];
    for (const [key, value] of Object.entries(body.settings)) {
      if (!allowed.has(key) || JSON.stringify(value).length > 2000) throw new HttpError(400, "Khóa cấu hình không hợp lệ.");
      statements.push(env.DB.prepare(
        "INSERT INTO app_settings (setting_key,value_json,updated_by) VALUES (?,?,?) " +
        "ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP"
      ).bind(key, JSON.stringify(value), user.id));
    }
    if (!statements.length) throw new HttpError(400, "Không có thiết lập để lưu.");
    await env.DB.batch(statements);
    await audit(env, user.id, "settings.update", "app_settings");
    return json({ ok: true }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/admin/orders") {
    const status = url.searchParams.get("status");
    const valid = ["pending", "processing", "completed", "rejected", "cancelled"];
    const rows = status && valid.includes(status)
      ? await env.DB.prepare("SELECT o.*,u.username,u.display_name,p.name AS package_name FROM orders o JOIN users u ON u.telegram_id=o.telegram_id JOIN packages p ON p.id=o.package_id WHERE o.status=? ORDER BY o.created_at DESC LIMIT 100").bind(status).all()
      : await env.DB.prepare("SELECT o.*,u.username,u.display_name,p.name AS package_name FROM orders o JOIN users u ON u.telegram_id=o.telegram_id JOIN packages p ON p.id=o.package_id ORDER BY o.created_at DESC LIMIT 100").all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "PATCH" && /^\/api\/v1\/admin\/orders\/[a-f0-9-]{36}$/i.test(path)) {
    const id = path.split("/").pop() || "";
    const body = await readJson<Record<string, unknown>>(req);
    const status = String(body.status || "");
    if (!["processing", "completed", "rejected", "cancelled"].includes(status)) throw new HttpError(400, "Trạng thái đơn không hợp lệ.");
    let results: D1Result<unknown>[];
    if (status === "rejected" || status === "cancelled") {
      results = await env.DB.batch([
        env.DB.prepare(
          "UPDATE users SET balance_vnd=balance_vnd+(SELECT total_vnd FROM orders WHERE id=? AND status IN ('pending','processing')),updated_at=CURRENT_TIMESTAMP " +
          "WHERE telegram_id=(SELECT telegram_id FROM orders WHERE id=? AND status IN ('pending','processing'))"
        ).bind(id, id),
        env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','processing')").bind(status, id)
      ]);
    } else {
      results = await env.DB.batch([
        env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','processing')").bind(status, id)
      ]);
    }
    if ((results[results.length - 1]?.meta?.changes || 0) !== 1) throw new HttpError(409, "Đơn không tồn tại hoặc đã được xử lý.");
    await audit(env, user.id, "order.status." + status, "order", id);
    return json({ ok: true }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/admin/deposits") {
    const status = url.searchParams.get("status");
    const valid = ["pending", "approved", "rejected"];
    const rows = status && valid.includes(status)
      ? await env.DB.prepare("SELECT d.*,u.username,u.display_name FROM deposits d JOIN users u ON u.telegram_id=d.telegram_id WHERE d.status=? ORDER BY d.created_at DESC LIMIT 100").bind(status).all()
      : await env.DB.prepare("SELECT d.*,u.username,u.display_name FROM deposits d JOIN users u ON u.telegram_id=d.telegram_id ORDER BY d.created_at DESC LIMIT 100").all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "PATCH" && /^\/api\/v1\/admin\/deposits\/[a-f0-9-]{36}$/i.test(path)) {
    const id = path.split("/").pop() || "";
    const body = await readJson<Record<string, unknown>>(req);
    const status = String(body.status || "");
    if (!["approved", "rejected"].includes(status)) throw new HttpError(400, "Trạng thái nạp tiền không hợp lệ.");
    const statements: D1PreparedStatement[] = [];
    if (status === "approved") {
      statements.push(env.DB.prepare(
        "UPDATE users SET balance_vnd=balance_vnd+(SELECT amount_vnd FROM deposits WHERE id=? AND status='pending'),updated_at=CURRENT_TIMESTAMP " +
        "WHERE telegram_id=(SELECT telegram_id FROM deposits WHERE id=? AND status='pending')"
      ).bind(id, id));
    }
    statements.push(env.DB.prepare(
      "UPDATE deposits SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'"
    ).bind(status, user.id, id));
    const results = await env.DB.batch(statements);
    if ((results[results.length - 1]?.meta?.changes || 0) !== 1) throw new HttpError(409, "Yêu cầu nạp không tồn tại hoặc đã được xử lý.");
    await audit(env, user.id, "deposit." + status, "deposit", id);
    return json({ ok: true }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/admin/users") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 64);
    const rows = q
      ? await env.DB.prepare("SELECT telegram_id,username,display_name,role,balance_vnd,vip_level,created_at FROM users WHERE telegram_id LIKE ? OR username LIKE ? OR display_name LIKE ? ORDER BY created_at DESC LIMIT 100").bind("%" + q + "%", "%" + q + "%", "%" + q + "%").all()
      : await env.DB.prepare("SELECT telegram_id,username,display_name,role,balance_vnd,vip_level,created_at FROM users ORDER BY created_at DESC LIMIT 100").all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/admin/packages") {
    const rows = await env.DB.prepare("SELECT * FROM packages ORDER BY created_at DESC LIMIT 200").all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "POST" && path === "/api/v1/admin/packages") {
    const body = await readJson<Record<string, unknown>>(req);
    const name = shortText(body.name, "Tên gói", 120);
    const slug = shortText(body.slug, "Slug", 80).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, "Slug chỉ gồm chữ thường, số và dấu gạch ngang.");
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
    const category = shortText(body.category, "Danh mục", 60);
    const price = money(body.priceVnd, 0, 1000000000);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare("INSERT INTO packages (id,slug,name,description,category,price_vnd,status) VALUES (?,?,?,?,?,?,'active')")
        .bind(id, slug, name, description, category, price).run();
    } catch {
      throw new HttpError(409, "Slug đã tồn tại hoặc không thể tạo gói.");
    }
    await audit(env, user.id, "package.create", "package", id);
    return json({ ok: true, data: { id } }, 201, headers);
  }
  if (req.method === "PUT" && /^\/api\/v1\/admin\/packages\/[a-f0-9-]{36}$/i.test(path)) {
    const id = path.split("/").pop() || "";
    const body = await readJson<Record<string, unknown>>(req);
    const name = shortText(body.name, "Tên gói", 120);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
    const category = shortText(body.category, "Danh mục", 60);
    const price = money(body.priceVnd, 0, 1000000000);
    const status = ["active", "hidden", "archived"].includes(String(body.status)) ? String(body.status) : "active";
    const result = await env.DB.prepare("UPDATE packages SET name=?,description=?,category=?,price_vnd=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(name, description, category, price, status, id).run();
    if ((result.meta?.changes || 0) !== 1) throw new HttpError(404, "Không tìm thấy gói.");
    await audit(env, user.id, "package.update", "package", id);
    return json({ ok: true }, 200, headers);
  }
  if (req.method === "GET" && path === "/api/v1/admin/tickets") {
    const rows = await env.DB.prepare(
      "SELECT t.*,u.username,u.display_name FROM support_tickets t JOIN users u ON u.telegram_id=t.telegram_id " +
      "ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 100"
    ).all();
    return json({ ok: true, data: rows.results || [] }, 200, headers);
  }
  if (req.method === "PATCH" && /^\/api\/v1\/admin\/tickets\/[a-f0-9-]{36}$/i.test(path)) {
    const id = path.split("/").pop() || "";
    const body = await readJson<Record<string, unknown>>(req);
    const status = ["open", "answered", "closed"].includes(String(body.status)) ? String(body.status) : "answered";
    const reply = typeof body.reply === "string" ? body.reply.trim().slice(0, 4000) : "";
    const result = await env.DB.prepare("UPDATE support_tickets SET status=?,admin_reply=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(status, reply || null, id).run();
    if ((result.meta?.changes || 0) !== 1) throw new HttpError(404, "Không tìm thấy yêu cầu hỗ trợ.");
    await audit(env, user.id, "ticket.reply", "support_ticket", id);
    return json({ ok: true }, 200, headers);
  }
  throw new HttpError(404, "Không tìm thấy API quản trị.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const headers = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      if (url.pathname === "/healthz" && req.method === "GET") {
        const db = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        const ok = db?.ok === 1;
        return json({ ok, service: "hendy-backend-api", database: ok, time: new Date().toISOString() }, ok ? 200 : 503, headers);
      }
      if (url.pathname === "/telegram/webhook" && req.method === "POST") return telegramWebhook(req, env);
      if (url.pathname.startsWith("/api/v1/")) return await handleApi(req, env, url, headers);
      throw new HttpError(404, "Không tìm thấy API.");
    } catch (error) {
      if (error instanceof HttpError) return json({ ok: false, error: error.message }, error.status, headers);
      console.error("backend-api request failed");
      return json({ ok: false, error: "Lỗi máy chủ. Vui lòng thử lại sau." }, 500, headers);
    }
  }
};
