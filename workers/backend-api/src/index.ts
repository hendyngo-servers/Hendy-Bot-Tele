import type { BackendEnv, D1Result } from "../../../packages/shared/src/cloudflare";
import { cleanText, safeInteger, safeObjectKey } from "../../../packages/shared/src/validation";
import { decryptSecret, encryptSecret, parseCiphertext, serializeCiphertext } from "../../../packages/crypto/src/index";
import { constantTimeEqual, getTelegramUser, isAdmin } from "./auth";
import { audit, clientIp, consumeRateLimit, upsertTelegramUser } from "./db";
import { handleTelegramWebhook, sendTelegramMessage } from "./telegram";

type Session = { id: string; username: string; first_name: string; last_name: string };
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers }
  });
const failure = (message: string, status = 400) => json({ success: false, message }, status);
const success = (data: unknown, status = 200) => json({ success: true, data }, status);

function corsHeaders(request: Request, env: BackendEnv): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(item => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, x-telegram-init-data, authorization, x-file-content-type, x-file-name, x-file-size",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-credentials": "true",
    "vary": "Origin"
  };
}
async function bodyJson(request: Request): Promise<Record<string, any>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
  } catch {
    return {};
  }
}
async function getSession(request: Request, env: BackendEnv): Promise<Session | null> {
  const user = await getTelegramUser(request, env);
  if (!user) return null;
  await upsertTelegramUser(env.DB, user, isAdmin(user.id, env));
  return { id: user.id, username: user.username, first_name: user.first_name, last_name: user.last_name };
}
async function requireAdmin(request: Request, env: BackendEnv): Promise<Session | Response> {
  const session = await getSession(request, env);
  if (!session) return failure("Phiên Telegram không hợp lệ hoặc đã hết hạn.", 401);
  if (!isAdmin(session.id, env)) return failure("Bạn không có quyền quản trị.", 403);
  return session;
}
const asSession = (value: Session | Response): value is Session => !(value instanceof Response);

async function paymentSettings(env: BackendEnv): Promise<Record<string, any>> {
  const record = await env.DB.prepare("SELECT value_json FROM app_settings WHERE setting_key = 'payment'").first<{ value_json: string }>();
  let saved: Record<string, any> = {};
  try { saved = record ? JSON.parse(record.value_json) : {}; } catch { saved = {}; }
  return {
    bankBin: "", bankName: "", bankAccount: "", bankAccountName: "",
    instructions: "Chuyển khoản đúng số tiền và nội dung để quản trị viên đối soát.",
    minDeposit: 10000, referralCommissionPercent: 0, botUsername: env.TELEGRAM_BOT_USERNAME || "",
    groupChatUrl: "", newsChannelUrl: "", supportUsername: "", qrImageKey: "",
    ...saved
  };
}
async function storePaymentSettings(env: BackendEnv, settings: Record<string, any>, adminId: string) {
  await env.DB.prepare(
    "INSERT INTO app_settings (setting_key, value_json, updated_by) VALUES ('payment', ?, ?) " +
    "ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP"
  ).bind(JSON.stringify(settings), adminId).run();
}
async function rateLimit(request: Request, env: BackendEnv, identity: string): Promise<Response | null> {
  const max = safeInteger(env.RATE_LIMIT_PER_MINUTE || 90, 10, 1000) || 90;
  const allowed = await consumeRateLimit(env, identity || clientIp(request), max);
  return allowed ? null : failure("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
}
function referenceCode() {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return "HND" + Date.now().toString(36).toUpperCase() + random;
}
function paymentQr(settings: Record<string, any>, amount: number, reference: string): string | null {
  if (!settings.bankBin || !settings.bankAccount) return null;
  return "https://img.vietqr.io/image/" + encodeURIComponent(settings.bankBin) + "-" +
    encodeURIComponent(settings.bankAccount) + "-compact2.png?amount=" + amount +
    "&addInfo=" + encodeURIComponent(reference) + "&accountName=" + encodeURIComponent(settings.bankAccountName || "");
}

async function getRows(env: BackendEnv, sql: string, ...values: unknown[]) {
  return env.DB.prepare(sql).bind(...values).all();
}
async function adminOverview(env: BackendEnv) {
  const queries = [
    ["users", "SELECT COUNT(*) AS total FROM users"],
    ["linkedAccounts", "SELECT COUNT(*) AS total FROM linked_accounts"],
    ["pendingDeposits", "SELECT COUNT(*) AS total FROM deposits WHERE status='pending'"],
    ["pendingOrders", "SELECT COUNT(*) AS total FROM orders WHERE status='pending'"],
    ["openTickets", "SELECT COUNT(*) AS total FROM tickets WHERE status IN ('open','answered')"]
  ] as const;
  const entries = await Promise.all(queries.map(async ([key, sql]) => {
    const row = await env.DB.prepare(sql).first<{ total: number }>();
    return [key, Number(row?.total || 0)] as const;
  }));
  return Object.fromEntries(entries);
}

async function adminFiles(request: Request, env: BackendEnv, session: Session, path: string): Promise<Response> {
  if (request.method === "POST" && path === "/api/v1/admin/files") {
    const contentType = request.headers.get("x-file-content-type") || "application/octet-stream";
    const allowed = new Set(["application/vnd.android.package-archive", "application/zip", "application/octet-stream", "image/png", "image/jpeg", "image/webp", "application/x-msdownload", "application/x-apple-diskimage"]);
    if (!allowed.has(contentType)) return failure("Định dạng tệp không được hỗ trợ.", 415);
    const maxBytes = 100 * 1024 * 1024;
    const declaredSize = Number(request.headers.get("x-file-size") || request.headers.get("content-length") || 0);
    if (!request.body || !Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > maxBytes) {
      return failure("Tệp phải có kích thước khai báo từ 1 byte đến 100 MB.", 413);
    }
    const rawName = cleanText(request.headers.get("x-file-name") || "package.bin", 120).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = "applications/" + new Date().toISOString().slice(0, 10) + "/" + crypto.randomUUID() + "-" + rawName;
    let actualSize = 0;
    const limitedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        actualSize += chunk.byteLength;
        if (actualSize > maxBytes) {
          controller.error(new Error("Tệp vượt quá giới hạn 100 MB."));
          return;
        }
        controller.enqueue(chunk);
      }
    }));
    await env.FILES.put(key, limitedBody, { httpMetadata: { contentType }, customMetadata: { uploadedBy: session.id, originalName: rawName } });
    if (actualSize <= 0 || actualSize > maxBytes) {
      await env.FILES.delete(key);
      return failure("Kích thước tệp thực tế không hợp lệ.", 413);
    }
    await audit(env, session.id, "file.upload", "r2_object", key, { contentType, size: actualSize });
    return success({ key, name: rawName, contentType, size: actualSize }, 201);
  }
  if (request.method === "GET" && path === "/api/v1/admin/files") {
    const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
    const result = await env.FILES.list({ prefix: "applications/", cursor, limit: 100 });
    return success({ files: result.objects, truncated: result.truncated, cursor: result.cursor || null });
  }
  return failure("Không tìm thấy API tệp.", 404);
}

async function routeApi(request: Request, env: BackendEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/healthz" && method === "GET") {
    const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ success: row?.ok === 1, service: "hendy-backend-api", database: row?.ok === 1, timestamp: new Date().toISOString() }, row?.ok === 1 ? 200 : 503);
  }
  if (path === "/telegram/webhook" && method === "POST") return handleTelegramWebhook(request, env);
  if (path === "/internal/backup" && method === "POST") {
    const token = request.headers.get("x-backup-secret") || "";
    if (!env.BACKUP_SECRET || !constantTimeEqual(token, env.BACKUP_SECRET)) return failure("Forbidden", 403);
    await env.DB.prepare("DELETE FROM api_rate_limits WHERE bucket < ?").bind(Math.floor(Date.now() / 60000) - 1440).run();
    const tables = ["users", "app_settings", "packages", "orders", "deposits", "linked_accounts", "tickets", "giftcodes", "giftcode_redemptions", "referrals", "balance_transactions", "audit_logs"];
    const backup: Record<string, unknown> = { schemaVersion: 1, createdAt: new Date().toISOString(), tables: {} };
    for (const table of tables) {
      const rows = await env.DB.prepare("SELECT * FROM " + table).all();
      (backup.tables as Record<string, unknown>)[table] = rows.results || [];
    }
    const key = "backups/database-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    const text = JSON.stringify(backup);
    await env.FILES.put(key, text, { httpMetadata: { contentType: "application/json" }, customMetadata: { schemaVersion: "1" } });
    return success({ key, bytes: new TextEncoder().encode(text).length });
  }

  if (path.startsWith("/api/v1/")) {
    const session = await getSession(request, env);
    if (!session) return failure("Phiên Telegram không hợp lệ hoặc đã hết hạn.", 401);
    const limited = await rateLimit(request, env, "user:" + session.id);
    if (limited) return limited;

    if (path === "/api/v1/me" && method === "GET") {
      const row = await env.DB.prepare(
        "SELECT telegram_id, username, display_name, role, balance_vnd, vip_level, created_at FROM users WHERE telegram_id=?"
      ).bind(session.id).first();
      return success(row);
    }
    if (path === "/api/v1/catalog" && method === "GET") {
      const category = cleanText(url.searchParams.get("category"), 40);
      const result = category
        ? await getRows(env, "SELECT id, slug, name, description, category, price_vnd, duration_days, stock, vip_level FROM packages WHERE status='active' AND category=? ORDER BY name", category)
        : await getRows(env, "SELECT id, slug, name, description, category, price_vnd, duration_days, stock, vip_level FROM packages WHERE status='active' ORDER BY category,name");
      return success(result.results || []);
    }
    if (path === "/api/v1/orders" && method === "GET") {
      const rows = await getRows(env,
        "SELECT o.id,o.item_name,o.category,o.amount_vnd,o.status,o.created_at,o.processed_at,o.activated_at,o.expires_at,p.metadata_json " +
        "FROM orders o LEFT JOIN packages p ON p.id=o.package_id WHERE o.telegram_id=? ORDER BY o.created_at DESC LIMIT 100",
        session.id
      );
      const data = (rows.results || []).map((row: any) => {
        let metadata: Record<string, any> = {};
        try { metadata = JSON.parse(row.metadata_json || "{}"); } catch { metadata = {}; }
        const { metadata_json: _metadataJson, ...order } = row;
        return { ...order, fileKey: metadata.fileKey || null };
      });
      return success(data);
    }
    if (path === "/api/v1/orders" && method === "POST") {
      const body = await bodyJson(request);
      const packageId = cleanText(body.packageId, 80);
      if (!packageId) return failure("Thiếu mã sản phẩm.");
      const product = await env.DB.prepare("SELECT id,name,category,price_vnd,duration_days,vip_level,status,stock FROM packages WHERE id=?").bind(packageId).first<any>();
      if (!product || product.status !== "active") return failure("Sản phẩm không còn khả dụng.", 404);
      if (product.stock !== null && Number(product.stock) <= 0) return failure("Sản phẩm đã hết hàng.", 409);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO orders (id,telegram_id,package_id,item_name,category,amount_vnd,vip_level,duration_days) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(id, session.id, packageId, product.name, product.category, product.price_vnd, product.vip_level, product.duration_days).run();
      return success({ id, status: "pending", itemName: product.name, amountVnd: product.price_vnd }, 201);
    }
    if (path === "/api/v1/deposits" && method === "GET") {
      const rows = await getRows(env, "SELECT id,amount_vnd,reference,status,created_at,reviewed_at FROM deposits WHERE telegram_id=? ORDER BY created_at DESC LIMIT 100", session.id);
      return success(rows.results || []);
    }
    if (path === "/api/v1/deposits" && method === "POST") {
      const body = await bodyJson(request);
      const amount = safeInteger(body.amountVnd, 10000, 100000000);
      const settings = await paymentSettings(env);
      if (!amount || amount < Number(settings.minDeposit || 10000)) return failure("Số tiền nạp thấp hơn mức tối thiểu hoặc không hợp lệ.");
      const id = crypto.randomUUID();
      const reference = referenceCode();
      await env.DB.prepare("INSERT INTO deposits (id,telegram_id,amount_vnd,reference) VALUES (?,?,?,?)")
        .bind(id, session.id, amount, reference).run();
      return success({
        id, reference, amountVnd: amount, status: "pending",
        payment: {
          bankName: settings.bankName, bankAccount: settings.bankAccount,
          bankAccountName: settings.bankAccountName, instructions: settings.instructions,
          qrUrl: paymentQr(settings, amount, reference)
        }
      }, 201);
    }
    if (path === "/api/v1/tickets" && method === "GET") {
      const rows = await getRows(env, "SELECT id,message,status,reply,created_at,updated_at FROM tickets WHERE telegram_id=? ORDER BY created_at DESC LIMIT 100", session.id);
      return success(rows.results || []);
    }
    if (path === "/api/v1/tickets" && method === "POST") {
      const body = await bodyJson(request);
      const message = cleanText(body.message, 2000);
      if (message.length < 5) return failure("Nội dung hỗ trợ cần ít nhất 5 ký tự.");
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO tickets (id,telegram_id,message) VALUES (?,?,?)").bind(id, session.id, message).run();
      return success({ id, status: "open" }, 201);
    }
    if (path === "/api/v1/linked-accounts" && method === "GET") {
      const rows = await getRows(env, "SELECT id,provider,account_name,username,mini_code,created_at FROM linked_accounts WHERE telegram_id=? ORDER BY created_at DESC", session.id);
      return success(rows.results || []);
    }
    if (path === "/api/v1/linked-accounts" && method === "POST") {
      const body = await bodyJson(request);
      const provider = cleanText(body.provider, 50);
      const accountName = cleanText(body.accountName, 100);
      const username = cleanText(body.username, 100);
      const password = String(body.password || "");
      if (!provider || !accountName || !password || password.length > 1000) return failure("Thiếu hoặc sai thông tin tài khoản.");
      const encrypted = await encryptSecret(password, env.APP_ENCRYPTION_KEY);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO linked_accounts (id,telegram_id,provider,account_name,username,mini_code,secret_ciphertext) VALUES (?,?,?,?,?,?,?)"
      ).bind(id, session.id, provider, accountName, username, cleanText(body.miniCode || username, 100), serializeCiphertext(encrypted)).run();
      return success({ id, provider, accountName, username }, 201);
    }
    const linkedDelete = path.match(/^\/api\/v1\/linked-accounts\/([a-zA-Z0-9-]+)$/);
    if (linkedDelete && method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM linked_accounts WHERE id=? AND telegram_id=?").bind(linkedDelete[1], session.id).run();
      return Number(result.meta?.changes || 0) ? success({ deleted: true }) : failure("Không tìm thấy tài khoản.", 404);
    }

    if (path === "/api/v1/giftcodes/redeem" && method === "POST") {
      const body = await bodyJson(request);
      const code = cleanText(body.code, 40).toUpperCase();
      if (!/^[A-Z0-9_-]{4,40}$/.test(code)) return failure("Mã giftcode không hợp lệ.");
      const gift = await env.DB.prepare("SELECT id,reward_type,reward_value,max_uses,uses,expires_at,active FROM giftcodes WHERE code=?")
        .bind(code).first<any>();
      if (!gift || !gift.active || Number(gift.uses) >= Number(gift.max_uses) ||
        (gift.expires_at && new Date(gift.expires_at).getTime() < Date.now())) return failure("Giftcode không tồn tại, hết hạn hoặc đã hết lượt.", 404);
      const redemptionId = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO giftcode_redemptions (id,giftcode_id,telegram_id,reward_type,reward_value) " +
          "SELECT ?,g.id,u.telegram_id,g.reward_type,g.reward_value FROM giftcodes g JOIN users u ON u.telegram_id=? " +
          "WHERE g.code=? AND g.active=1 AND g.uses<g.max_uses AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP) " +
          "AND NOT EXISTS (SELECT 1 FROM giftcode_redemptions r WHERE r.giftcode_id=g.id AND r.telegram_id=u.telegram_id)")
          .bind(redemptionId, session.id, code),
        env.DB.prepare("UPDATE giftcodes SET uses=uses+1 WHERE id=? AND EXISTS (SELECT 1 FROM giftcode_redemptions WHERE id=?)")
          .bind(gift.id, redemptionId),
        env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd+(SELECT reward_value FROM giftcode_redemptions WHERE id=? AND reward_type='balance'),updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM giftcode_redemptions WHERE id=? AND reward_type='balance')")
          .bind(redemptionId, session.id, redemptionId),
        env.DB.prepare("UPDATE users SET vip_level=MAX(vip_level,(SELECT reward_value FROM giftcode_redemptions WHERE id=? AND reward_type='vip')),updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM giftcode_redemptions WHERE id=? AND reward_type='vip')")
          .bind(redemptionId, session.id, redemptionId)
      ]);
      if (Number(results[0]?.meta?.changes || 0) === 0) return failure("Giftcode đã được sử dụng hoặc hết lượt.", 409);
      await audit(env, session.id, "giftcode.redeem", "giftcode", gift.id);
      return success({ code, rewardType: gift.reward_type, rewardValue: gift.reward_value });
    }
    if (path === "/api/v1/referrals" && method === "GET") {
      const [stats, referralRows] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(commission_vnd),0) AS commission FROM referrals WHERE referrer_id=?")
          .bind(session.id).first<any>(),
        env.DB.prepare("SELECT referred_id,status,commission_vnd,created_at FROM referrals WHERE referrer_id=? ORDER BY created_at DESC LIMIT 100")
          .bind(session.id).all()
      ]);
      const botName = (env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
      return success({
        total: Number(stats?.total || 0),
        commissionVnd: Number(stats?.commission || 0),
        link: botName ? "https://t.me/" + botName + "?start=ref_" + session.id : null,
        referrals: referralRows.results || []
      });
    }

    if (path.startsWith("/api/v1/admin/")) {
      if (!isAdmin(session.id, env)) return failure("Bạn không có quyền quản trị.", 403);
      const adminLimit = await rateLimit(request, env, "admin:" + session.id);
      if (adminLimit) return adminLimit;

      if (path === "/api/v1/admin/overview" && method === "GET") return success({ totals: await adminOverview(env) });
      if (path === "/api/v1/admin/settings" && method === "GET") return success(await paymentSettings(env));
      if (path === "/api/v1/admin/settings" && method === "PUT") {
        const body = await bodyJson(request);
        const current = await paymentSettings(env);
        const next = { ...current };
        for (const key of ["bankBin","bankName","bankAccount","bankAccountName","instructions","botUsername","groupChatUrl","newsChannelUrl","supportUsername","qrImageKey"]) {
          if (body[key] !== undefined) next[key] = cleanText(body[key], key === "instructions" ? 500 : 160);
        }
        if (body.referralCommissionPercent !== undefined) {
          const value = Number(body.referralCommissionPercent);
          if (!Number.isFinite(value) || value < 0 || value > 20) return failure("Hoa hồng giới thiệu phải từ 0 đến 20%.");
          next.referralCommissionPercent = value;
        }
        if (body.minDeposit !== undefined) {
          const value = safeInteger(body.minDeposit, 10000, 100000000);
          if (!value) return failure("Mức nạp tối thiểu không hợp lệ.");
          next.minDeposit = value;
        }
        if (next.bankBin && !/^\d{6}$/.test(next.bankBin)) return failure("Mã BIN ngân hàng phải gồm 6 chữ số.");
        if (next.bankAccount && !/^\d{4,24}$/.test(next.bankAccount)) return failure("Số tài khoản ngân hàng không hợp lệ.");
        await storePaymentSettings(env, next, session.id);
        await audit(env, session.id, "settings.update", "payment");
        return success(next);
      }
      if (path === "/api/v1/admin/packages" && method === "GET") {
        const rows = await getRows(env, "SELECT * FROM packages ORDER BY created_at DESC");
        return success(rows.results || []);
      }
      if (path === "/api/v1/admin/packages" && method === "POST") {
        const body = await bodyJson(request);
        const name = cleanText(body.name, 120);
        const slug = cleanText(body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 120);
        const category = cleanText(body.category, 50);
        const price = safeInteger(body.priceVnd, 0, 1000000000);
        const durationDays = safeInteger(body.durationDays || 0, 0, 36500);
        const vipLevel = safeInteger(body.vipLevel || 0, 0, 10);
        const stock = body.stock === null || body.stock === undefined || body.stock === "" ? null : safeInteger(body.stock, 0, 1000000);
        if (!name || !slug || !category || price === null || durationDays === null || vipLevel === null ||
          (body.stock !== null && body.stock !== undefined && body.stock !== "" && stock === null) ||
          (category === "vip" && vipLevel < 1)) return failure("Thông tin sản phẩm không hợp lệ.");
        const fileKey = cleanText(body.fileKey || "", 512);
        if (fileKey && (!safeObjectKey(fileKey) || !fileKey.startsWith("applications/"))) return failure("R2 file key không hợp lệ.");
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO packages (id,slug,name,description,category,price_vnd,duration_days,stock,vip_level,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)"
        ).bind(id, slug, name, cleanText(body.description, 1000), category, price,
          durationDays, stock, vipLevel, JSON.stringify(fileKey ? { fileKey } : {})).run();
        await audit(env, session.id, "package.create", "package", id);
        return success({ id, slug, name }, 201);
      }
      const packageAction = path.match(/^\/api\/v1\/admin\/packages\/([a-zA-Z0-9-]+)$/);
      if (packageAction && method === "PUT") {
        const body = await bodyJson(request);
        const name = cleanText(body.name, 120);
        const slug = cleanText(body.slug, 120);
        const category = cleanText(body.category, 50);
        const price = safeInteger(body.priceVnd, 0, 1000000000);
        const existingPackage = await env.DB.prepare("SELECT status FROM packages WHERE id=?").bind(packageAction[1]).first<{status:string}>();
        if (!existingPackage) return failure("Không tìm thấy sản phẩm.",404);
        const status = ["active", "hidden", "archived"].includes(body.status) ? body.status : existingPackage.status;
        const durationDays = safeInteger(body.durationDays ?? 0, 0, 36500);
        const vipLevel = safeInteger(body.vipLevel ?? 0, 0, 10);
        const stock = body.stock === null || body.stock === undefined || body.stock === ""
          ? null : safeInteger(body.stock, 0, 1000000);
        if (!name || !slug || !category || price === null || durationDays === null || vipLevel === null ||
          (category === "vip" && vipLevel < 1) ||
          (body.stock !== null && body.stock !== undefined && body.stock !== "" && stock === null)) {
          return failure("Thông tin sản phẩm không hợp lệ.");
        }
        const fileKey = cleanText(body.fileKey || "", 512);
        if (fileKey && (!safeObjectKey(fileKey) || !fileKey.startsWith("applications/"))) return failure("R2 file key không hợp lệ.");
        const result = await env.DB.prepare(
          "UPDATE packages SET slug=?,name=?,description=?,category=?,price_vnd=?,duration_days=?,stock=?,vip_level=?,status=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).bind(slug,name,cleanText(body.description,1000),category,price,durationDays,stock,vipLevel,status,
          JSON.stringify(fileKey ? { fileKey } : {}),packageAction[1]).run();
        if (!Number(result.meta?.changes || 0)) return failure("Không tìm thấy sản phẩm.",404);
        await audit(env,session.id,"package.update","package",packageAction[1]);
        return success({ id:packageAction[1],name,status });
      }
      if (packageAction && method === "DELETE") {
        const result = await env.DB.prepare("UPDATE packages SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='archived'")
          .bind(packageAction[1]).run();
        if (!Number(result.meta?.changes || 0)) return failure("Không tìm thấy sản phẩm hoặc sản phẩm đã lưu trữ.",404);
        await audit(env,session.id,"package.archive","package",packageAction[1]);
        return success({ id:packageAction[1],archived:true });
      }
      if (path === "/api/v1/admin/deposits" && method === "GET") {
        const rows = await getRows(env, "SELECT d.*,u.display_name,u.username FROM deposits d JOIN users u ON u.telegram_id=d.telegram_id ORDER BY d.created_at DESC LIMIT 300");
        return success(rows.results || []);
      }
      const depositAction = path.match(/^\/api\/v1\/admin\/deposits\/([a-zA-Z0-9-]+)\/(approve|reject)$/);
      if (depositAction && method === "POST") {
        const id = depositAction[1];
        const action = depositAction[2];
        const reviewId = crypto.randomUUID();
        const status = action === "approve" ? "approved" : "rejected";
        const deposit = await env.DB.prepare("SELECT telegram_id,amount_vnd,status FROM deposits WHERE id=?").bind(id).first<any>();
        if (!deposit) return failure("Không tìm thấy giao dịch.", 404);
        if (deposit.status !== "pending") return failure("Giao dịch đã được xử lý.", 409);
        const settings = await paymentSettings(env);
        const commission = action === "approve"
          ? Math.floor(Number(deposit.amount_vnd) * Number(settings.referralCommissionPercent || 0) / 100)
          : 0;
        const referralReference = "REFERRAL-" + id + "-" + reviewId;
        const statements = [
          env.DB.prepare("UPDATE deposits SET status=?,review_id=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(status, reviewId, session.id, id),
          ...(action === "approve" ? [
            env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd+(SELECT amount_vnd FROM deposits WHERE id=? AND review_id=?), updated_at=CURRENT_TIMESTAMP WHERE telegram_id=(SELECT telegram_id FROM deposits WHERE id=? AND review_id=?)")
              .bind(id, reviewId, id, reviewId),
            env.DB.prepare("INSERT INTO balance_transactions (id,telegram_id,amount_vnd,reference,description) SELECT ?,telegram_id,amount_vnd,reference,? FROM deposits WHERE id=? AND review_id=?")
              .bind(crypto.randomUUID(), "Duyệt nạp tiền " + id, id, reviewId),
            ...(commission > 0 ? [
              env.DB.prepare("INSERT OR IGNORE INTO balance_transactions (id,telegram_id,amount_vnd,reference,description) " +
                "SELECT ?,referrer_id,?,?,? FROM referrals WHERE referred_id=? AND EXISTS (SELECT 1 FROM deposits WHERE id=? AND review_id=?)")
                .bind(crypto.randomUUID(), commission, referralReference, "Hoa hồng từ nạp tiền " + id, deposit.telegram_id, id, reviewId),
              env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd+(SELECT amount_vnd FROM balance_transactions WHERE reference=?),updated_at=CURRENT_TIMESTAMP " +
                "WHERE telegram_id=(SELECT telegram_id FROM balance_transactions WHERE reference=?) AND EXISTS (SELECT 1 FROM balance_transactions WHERE reference=?)")
                .bind(referralReference, referralReference, referralReference),
              env.DB.prepare("UPDATE referrals SET commission_vnd=commission_vnd+? WHERE referred_id=? AND EXISTS (SELECT 1 FROM balance_transactions WHERE reference=?)")
                .bind(commission, deposit.telegram_id, referralReference)
            ] : [])
          ] : [])
        ];
        const batchResult = await env.DB.batch(statements);
        if (Number(batchResult[0]?.meta?.changes || 0) === 0) return failure("Giao dịch đã được xử lý ở một thao tác khác.", 409);
        await audit(env, session.id, "deposit." + action, "deposit", id, { amount: deposit.amount_vnd });
        try { await sendTelegramMessage(env, deposit.telegram_id, action === "approve" ? "Yêu cầu nạp tiền đã được duyệt." : "Yêu cầu nạp tiền đã bị từ chối."); } catch (error) { console.warn("Telegram notify failed", error instanceof Error ? error.message : "unknown"); }
        return success({ id, status });
      }
      if (path === "/api/v1/admin/orders" && method === "GET") {
        const rows = await getRows(env, "SELECT o.*,u.display_name,u.username FROM orders o JOIN users u ON u.telegram_id=o.telegram_id ORDER BY o.created_at DESC LIMIT 300");
        return success(rows.results || []);
      }
      const orderAction = path.match(/^\/api\/v1\/admin\/orders\/([a-zA-Z0-9-]+)\/(approve|reject)$/);
      if (orderAction && method === "POST") {
        const id = orderAction[1];
        const action = orderAction[2];
        const order = await env.DB.prepare("SELECT package_id,status,telegram_id,amount_vnd,vip_level,category,item_name,duration_days FROM orders WHERE id=?").bind(id).first<any>();
        if (!order) return failure("Không tìm thấy đơn hàng.", 404);
        if (order.status !== "pending") return failure("Đơn hàng đã được xử lý.", 409);
        const newStatus = action === "approve" ? "approved" : "rejected";
        if (action === "approve") {
          if (order.category === "vip" && (Number(order.vip_level) < 1 || Number(order.vip_level) > 10)) return failure("Sản phẩm VIP chưa có cấp nâng cấp hợp lệ.", 409);
          const approvalId = crypto.randomUUID();
          const reference = "ORDER-" + id;
          const result = await env.DB.batch([
            env.DB.prepare(
              "UPDATE orders SET status='approved',approval_id=?,processed_by=?,processed_at=CURRENT_TIMESTAMP, " +
              "activated_at=CASE WHEN duration_days>0 THEN CURRENT_TIMESTAMP ELSE NULL END, " +
              "expires_at=CASE WHEN duration_days>0 THEN datetime(CURRENT_TIMESTAMP,'+' || duration_days || ' days') ELSE NULL END " +
              "WHERE id=? AND status='pending' " +
              "AND EXISTS (SELECT 1 FROM users WHERE users.telegram_id=orders.telegram_id AND users.balance_vnd>=orders.amount_vnd) " +
              "AND (package_id IS NULL OR EXISTS (SELECT 1 FROM packages WHERE packages.id=orders.package_id AND packages.status='active' AND (packages.stock IS NULL OR packages.stock>0)))"
            ).bind(approvalId, session.id, id),
            env.DB.prepare(
              "UPDATE users SET balance_vnd=balance_vnd-(SELECT amount_vnd FROM orders WHERE id=? AND approval_id=?), " +
              "vip_level=CASE WHEN (SELECT category FROM orders WHERE id=? AND approval_id=?)='vip' THEN MAX(vip_level,(SELECT vip_level FROM orders WHERE id=? AND approval_id=?)) ELSE vip_level END, " +
              "updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND approval_id=?)"
            ).bind(id,approvalId,id,approvalId,id,approvalId,order.telegram_id,id,approvalId),
            env.DB.prepare(
              "INSERT INTO balance_transactions (id,telegram_id,amount_vnd,reference,description) " +
              "SELECT ?,telegram_id,-amount_vnd,?,'Thanh toán đơn hàng ' || item_name FROM orders WHERE id=? AND approval_id=?"
            ).bind(crypto.randomUUID(), reference, id, approvalId),
            ...(order.package_id ? [
              env.DB.prepare("UPDATE packages SET stock=stock-1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock IS NOT NULL AND stock>0 AND EXISTS (SELECT 1 FROM orders WHERE id=? AND approval_id=?)")
                .bind(order.package_id,id,approvalId)
            ] : [])
          ]);
          if (Number(result[0]?.meta?.changes || 0) === 0) return failure("Số dư không đủ, đơn đã xử lý hoặc sản phẩm hết hàng.", 409);
        } else {
          const result = await env.DB.prepare("UPDATE orders SET status='rejected',processed_by=?,processed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'")
            .bind(session.id,id).run();
          if (Number(result.meta?.changes || 0) === 0) return failure("Đơn đã được xử lý.",409);
        }
        await audit(env, session.id, "order." + action, "order", id);
        try {
          await sendTelegramMessage(env, order.telegram_id, action === "approve"
            ? "Đơn hàng " + order.item_name + " đã được duyệt và trừ số dư."
            : "Đơn hàng " + order.item_name + " đã bị từ chối. Số dư chưa bị trừ.");
        } catch { /* Không rollback giao dịch đã hoàn tất */ }
        return success({ id, status: newStatus });
      }
      if (path === "/api/v1/admin/tickets" && method === "GET") {
        const rows = await getRows(env, "SELECT t.*,u.display_name,u.username FROM tickets t JOIN users u ON u.telegram_id=t.telegram_id ORDER BY t.created_at DESC LIMIT 300");
        return success(rows.results || []);
      }
      const ticketAction = path.match(/^\/api\/v1\/admin\/tickets\/([a-zA-Z0-9-]+)$/);
      if (ticketAction && method === "PATCH") {
        const body = await bodyJson(request);
        const status = ["open","answered","closed"].includes(body.status) ? body.status : "answered";
        const reply = cleanText(body.reply || "", 2000);
        const result = await env.DB.prepare("UPDATE tickets SET status=?,reply=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(status, reply, ticketAction[1]).run();
        if (!Number(result.meta?.changes || 0)) return failure("Không tìm thấy yêu cầu hỗ trợ.", 404);
        await audit(env, session.id, "ticket.update", "ticket", ticketAction[1], { status });
        return success({ id: ticketAction[1], status });
      }
      if (path === "/api/v1/admin/users" && method === "GET") {
        const rows = await getRows(env, "SELECT telegram_id,username,display_name,role,balance_vnd,vip_level,created_at FROM users ORDER BY created_at DESC LIMIT 500");
        return success(rows.results || []);
      }
      const userBalance = path.match(/^\/api\/v1\/admin\/users\/(\d+)\/balance$/);
      if (userBalance && method === "PATCH") {
        const body = await bodyJson(request);
        const amount = safeInteger(body.amountVnd, -1000000000, 1000000000);
        const note = cleanText(body.note, 200);
        if (amount === null || amount === 0 || !note) return failure("Số tiền điều chỉnh hoặc lý do không hợp lệ.");
        const result = await env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd+?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND balance_vnd+?>=0")
          .bind(amount, userBalance[1], amount).run();
        if (!Number(result.meta?.changes || 0)) return failure("Không tìm thấy thành viên hoặc số dư không đủ.", 404);
        await env.DB.prepare("INSERT INTO balance_transactions (id,telegram_id,amount_vnd,reference,description) VALUES (?,?,?,?,?)")
          .bind(crypto.randomUUID(), userBalance[1], amount, "ADMIN-" + crypto.randomUUID(), note).run();
        await audit(env, session.id, "user.balance.adjust", "user", userBalance[1], { amount, note });
        return success({ telegramId: userBalance[1], adjustedBy: amount });
      }
      if (path === "/api/v1/admin/files") return adminFiles(request, env, session, path);
      if (path === "/api/v1/admin/giftcodes" && method === "GET") {
        const rows = await getRows(env, "SELECT id,code,reward_type,reward_value,max_uses,uses,expires_at,active,created_at FROM giftcodes ORDER BY created_at DESC");
        return success(rows.results || []);
      }
      if (path === "/api/v1/admin/giftcodes" && method === "POST") {
        const body = await bodyJson(request);
        const code = cleanText(body.code, 40).toUpperCase();
        const rewardType = ["balance","vip"].includes(body.rewardType) ? body.rewardType : "";
        const rewardValue = safeInteger(body.rewardValue, 1, 100000000);
        const maxUses = safeInteger(body.maxUses || 1, 1, 1000000);
        if (!/^[A-Z0-9_-]{4,40}$/.test(code) || !rewardType || !rewardValue || !maxUses || (rewardType === "vip" && rewardValue > 10)) return failure("Thông tin giftcode không hợp lệ.");
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO giftcodes (id,code,reward_type,reward_value,max_uses) VALUES (?,?,?,?,?)")
          .bind(id, code, rewardType, rewardValue, maxUses).run();
        await audit(env, session.id, "giftcode.create", "giftcode", id);
        return success({ id, code }, 201);
      }
      if (path === "/api/v1/admin/broadcast" && method === "POST") {
        const body = await bodyJson(request);
        const message = cleanText(body.message, 3000);
        if (message.length < 3) return failure("Nội dung thông báo quá ngắn.");
        const users = await env.DB.prepare("SELECT telegram_id FROM users ORDER BY created_at DESC LIMIT 25").all<{ telegram_id: string }>();
        let sent = 0;
        for (const user of users.results || []) {
          try { await sendTelegramMessage(env, user.telegram_id, message); sent += 1; } catch { /* tiếp tục người dùng tiếp theo */ }
        }
        await audit(env, session.id, "broadcast.send", "telegram", null, { sent });
        return success({ sent, attempted: users.results?.length || 0 });
      }
    }
  }

  const fileMatch = path.match(/^\/api\/v1\/files\/(.+)$/);
  if (fileMatch && method === "GET") {
    const session = await getSession(request, env);
    if (!session) return failure("Cần xác thực Telegram.", 401);
    const key = decodeURIComponent(fileMatch[1]);
    if (!safeObjectKey(key)) return failure("Đường dẫn tệp không hợp lệ.", 400);
    const object = await env.FILES.get(key);
    if (!object) return failure("Không tìm thấy tệp.", 404);
    if (!isAdmin(session.id, env)) {
      const purchases = await env.DB.prepare(
        "SELECT p.metadata_json FROM orders o JOIN packages p ON p.id=o.package_id " +
        "WHERE o.telegram_id=? AND o.status='approved'"
      ).bind(session.id).all<{ metadata_json: string }>();
      const ownsFile = (purchases.results || []).some(row => {
        try { return JSON.parse(row.metadata_json || "{}").fileKey === key; } catch { return false; }
      });
      if (!ownsFile) return failure("Bạn chưa có đơn hàng được duyệt cho tệp này.", 403);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.etag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    headers.set("content-disposition", "attachment");
    return new Response(object.body, { headers });
  }
  return failure("Không tìm thấy API.", 404);
}

export default {
  async fetch(request: Request, env: BackendEnv): Promise<Response> {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const response = await routeApi(request, env);
      const merged = new Headers(response.headers);
      new Headers(headers).forEach((value, key) => merged.set(key, value));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
    } catch (error) {
      console.error("backend-api request failed", error instanceof Error ? error.message : "unknown");
      return json({ success: false, message: "Có lỗi xảy ra khi xử lý yêu cầu." }, 500, headers);
    }
  }
};
