import { handleLinks } from "./api/linkAccount.js";
import { handleUploadApp } from "./api/uploadApp.js";
import { handleCallback } from "./bot/actions.js";
import { handleCommand } from "./bot/commands.js";
import { handleWebAppData } from "./bot/handlers.js";
import { telegramCall } from "./bot/telegram.js";
import { envValidator, getAllowedOrigins, getRequiredSecret } from "./config/env.js";
import { getRelease, getReleaseStats, listReleases } from "./db/appModel.js";
import { createOrder, createOrderQuote, getAdminOrder, getAdminOrderStats, getOrderForUser, getOrderStats, listAdminOrders, listOrders, payOrderWithWallet, respondToOrderQuote, updateOrderStatus } from "./db/orderModel.js";
import { upsertUser } from "./db/userModel.js";
import { createDepositRequest, getWalletOverview, listAdminDeposits, reviewDepositRequest } from "./db/walletModel.js";
import {
  addSupportMessage, claimReferral, createGiftcode, createSupportTicket, ensureReferralCode,
  getReferralSummary, getSupportTicket, getVipProfile, listAdminCatalog, listAdminGiftcodes,
  listAdminReferralCommissions, listCatalog, listSupportTickets, redeemGiftcode,
  saveCatalogItem, setCatalogItemActive, setGiftcodeActive, settleReferralCommission,
  updateCatalogItem, updateSupportTicketStatus
} from "./db/commerceModel.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { rateLimitMiddleware } from "./middlewares/rateLimiter.js";
import { authenticateTelegramRequest, verifyTelegramInitData } from "./security/telegramAuth.js";
import { constantTimeEqual } from "./security/cryptoService.js";
import { json, safeText } from "./utils/helpers.js";
import { logger } from "./utils/logger.js";

async function readJsonLimited(request, maxBytes = 8192) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) {
    const error = new Error("Nội dung yêu cầu vượt quá giới hạn 8 KB.");
    error.status = 413;
    throw error;
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    const error = new Error("Nội dung yêu cầu vượt quá giới hạn 8 KB.");
    error.status = 413;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("JSON không hợp lệ.");
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Setup-Key, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && getAllowedOrigins(env).has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function requireAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = env.ADMIN_API_TOKEN;
  if (token && authorization.startsWith("Bearer ") && constantTimeEqual(authorization.slice(7), token)) {
    return { id: "api-admin", method: "token" };
  }
  if (authorization.startsWith("tma ")) {
    const verified = await verifyTelegramInitData(authorization.slice(4), getRequiredSecret(env, "BOT_TOKEN"));
    const allowed = String(env.ADMIN_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (allowed.includes(String(verified.user.id))) return { id: String(verified.user.id), method: "telegram" };
  }
  const error = new Error("Không có quyền quản trị.");
  error.status = 403;
  throw error;
}

async function telegramWebhook(request, env) {
  const expected = getRequiredSecret(env, "WEBHOOK_SECRET_TOKEN");
  const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!constantTimeEqual(expected, supplied)) return json({ error: "Unauthorized" }, 401);
  const update = await request.json();
  if (update.callback_query) await handleCallback(update, env);
  else if (update.message?.web_app_data) await handleWebAppData(update, env);
  else if (update.message?.text) {
    const handled = await handleCommand(update, env);
    if (!handled) logger.info("telegram_message_ignored", { updateId: update.update_id });
  }
  return json({ ok: true });
}

async function setupWebhook(request, env) {
  const setupKey = getRequiredSecret(env, "WEBHOOK_SETUP_KEY");
  const supplied = request.headers.get("X-Webhook-Setup-Key") || "";
  if (!constantTimeEqual(setupKey, supplied)) return json({ error: "Unauthorized" }, 401);
  const baseUrl = String(env.PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl.startsWith("https://")) return json({ error: "PUBLIC_API_BASE_URL phải là URL HTTPS của Worker." }, 400);
  const secretToken = getRequiredSecret(env, "WEBHOOK_SECRET_TOKEN");
  await telegramCall(env, "setWebhook", {
    url: baseUrl + "/telegram/webhook",
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"]
  });
  return json({ success: true, message: "Đã đăng ký webhook Telegram." });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  if (path === "/" || path === "/healthz" || path === "/api/v1/health") {
    return json({ ok: true, service: "hendy-bot-backend", platform: "cloudflare-workers", timestamp: new Date().toISOString() });
  }

  if (path === "/api/v1/public-config" && request.method === "GET") {
    const safeUrl = value => /^https:\/\//i.test(String(value || "").trim()) ? String(value).trim() : "";
    const supportUsername = String(env.SUPPORT_USERNAME || "").replace(/^@/, "").trim();
    const safeUsername = /^[A-Za-z0-9_]{5,32}$/.test(supportUsername) ? supportUsername : "";
    return json({
      groupChatUrl: safeUrl(env.GROUP_CHAT_URL),
      newsChannelUrl: safeUrl(env.NEWS_CHANNEL_URL),
      supportUrl: safeUrl(env.SUPPORT_URL) || (safeUsername ? "https://t.me/" + safeUsername : ""),
      supportUsername: safeUsername
    });
  }

  if (path === "/telegram/webhook" && request.method === "POST") {
    envValidator(env);
    return telegramWebhook(request, env);
  }

  if (!path.startsWith("/api/v1/")) return json({ error: "Not found." }, 404);
  envValidator(env);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const allowed = await rateLimitMiddleware(env.RATE_LIMITER, ip, 90, 60);
  if (!allowed) return json({ error: "Quá nhiều yêu cầu. Hãy thử lại sau." }, 429);

  if (path === "/api/v1/releases" && request.method === "GET") {
    const releases = await listReleases(env);
    return json({ releases: releases.map(({ r2_path, ...item }) => item) });
  }

  const downloadMatch = path.match(/^\/api\/v1\/releases\/([0-9a-f-]+)\/download$/i);
  if (downloadMatch && request.method === "GET") {
    const authorization = request.headers.get("Authorization") || "";
    if (authorization.startsWith("Bearer ")) await requireAdmin(request, env);
    else await authenticateTelegramRequest(request, env);
    const release = await getRelease(env, downloadMatch[1]);
    if (!release) return json({ error: "Không tìm thấy bản phát hành." }, 404);
    const object = await env.STORAGE.get(release.r2_path);
    if (!object) return json({ error: "Tệp không còn tồn tại trong R2." }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Disposition", "attachment; filename=\"" + safeText(release.file_name || "release.bin", 180).replace(/"/g, "") + "\"");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(object.body, { headers });
  }

  if (path === "/api/v1/catalog" && request.method === "GET") {
    return json({ items: await listCatalog(env, url.searchParams.get("module") || "all") });
  }

  if (path === "/api/v1/wallet" && request.method === "GET") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    return json(await getWalletOverview(env, telegramUser.id));
  }

  if (path === "/api/v1/deposits" && request.method === "POST") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    const result = await createDepositRequest(env, telegramUser.id, await readJsonLimited(request), request.headers.get("Idempotency-Key"));
    return json(result, result.duplicate ? 200 : 201);
  }

  if (path === "/api/v1/vip" && request.method === "GET") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    return json(await getVipProfile(env, telegramUser.id));
  }

  if (path === "/api/v1/referral" && request.method === "GET") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    return json(await getReferralSummary(env, telegramUser.id));
  }

  if (path === "/api/v1/referral/claim" && request.method === "POST") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    return json(await claimReferral(env, telegramUser.id, await readJsonLimited(request)));
  }

  if (path === "/api/v1/giftcodes/redeem" && request.method === "POST") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    return json(await redeemGiftcode(env, telegramUser.id, await readJsonLimited(request), request.headers.get("Idempotency-Key")));
  }

  if (path === "/api/v1/support/tickets" && (request.method === "GET" || request.method === "POST")) {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    if (request.method === "GET") return json({ tickets: await listSupportTickets(env, telegramUser.id) });
    const created = await createSupportTicket(env, telegramUser.id, await readJsonLimited(request), request.headers.get("Idempotency-Key"));
    return json(created, created.duplicate ? 200 : 201);
  }

  const customerTicketMatch = path.match(/^\/api\/v1\/support\/tickets\/([0-9a-f-]{36})(?:\/(messages))?$/i);
  if (customerTicketMatch && request.method === "GET" && !customerTicketMatch[2]) {
    const telegramUser = await authenticateTelegramRequest(request, env);
    const ticket = await getSupportTicket(env, customerTicketMatch[1], telegramUser.id);
    if (!ticket) return json({ error: "Không tìm thấy ticket hỗ trợ." }, 404);
    return json(ticket);
  }

  if (customerTicketMatch && request.method === "POST" && customerTicketMatch[2] === "messages") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    const body = await readJsonLimited(request);
    const ticket = await addSupportMessage(env, customerTicketMatch[1], { type: "user", id: telegramUser.id }, body.message, request.headers.get("Idempotency-Key"), telegramUser.id);
    return json(ticket);
  }

  if (path === "/api/v1/home" && request.method === "GET") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    const user = await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    const [orderSummary, vipProfile] = await Promise.all([
      getOrderStats(env, telegramUser.id),
      getVipProfile(env, telegramUser.id)
    ]);
    return json({
      user: {
        id: user.id,
        name: user.name,
        balance: Number(user.balance || 0),
        voucher: Number(user.voucher || 0),
        createdAt: user.created_at
      },
      membership: {
        tier: vipProfile.currentTier?.name || "Cơ bản",
        code: vipProfile.currentTier?.code || "basic",
        points: vipProfile.points,
        status: "active"
      },
      orderSummary,
      serverTime: new Date().toISOString()
    });
  }

  if (path === "/api/v1/me" && request.method === "GET") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    const user = await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    return json({ user: { id: user.id, name: user.name, balance: user.balance, voucher: user.voucher } });
  }

  if (path === "/api/v1/orders" && (request.method === "GET" || request.method === "POST")) {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");

    if (request.method === "GET") {
      const orders = await listOrders(env, telegramUser.id, {
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
        status: url.searchParams.get("status")
      });
      return json({ orders });
    }

    const body = await readJsonLimited(request);
    const result = await createOrder(env, telegramUser.id, body, request.headers.get("Idempotency-Key"));
    return json(result, result.duplicate ? 200 : 201);
  }

  const orderPaymentMatch = path.match(/^\/api\/v1\/orders\/([0-9a-f-]{36})\/pay$/i);
  if (orderPaymentMatch && request.method === "POST") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    const result = await payOrderWithWallet(
      env,
      telegramUser.id,
      orderPaymentMatch[1],
      request.headers.get("Idempotency-Key")
    );
    return json(result, 200);
  }

  const orderMatch = path.match(/^\/api\/v1\/orders\/([0-9a-f-]{36})$/i);
  if (orderMatch && request.method === "GET") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    const order = await getOrderForUser(env, telegramUser.id, orderMatch[1]);
    if (!order) return json({ error: "Không tìm thấy đơn hàng." }, 404);
    return json({ order });
  }

  if (path === "/api/v1/links" || /^\/api\/v1\/links\//.test(path)) {
    const telegramUser = await authenticateTelegramRequest(request, env);
    await upsertUser(env, telegramUser.id, telegramUser.first_name || "Khách");
    return handleLinks(request, env, telegramUser, url);
  }

  if (path === "/api/v1/admin/orders" && request.method === "GET") {
    await requireAdmin(request, env);
    const result = await listAdminOrders(env, {
      status: url.searchParams.get("status"),
      module: url.searchParams.get("module"),
      q: url.searchParams.get("q"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset")
    });
    return json({ ...result, stats: await getAdminOrderStats(env) });
  }

  const adminOrderMatch = path.match(new RegExp("^/api/v1/admin/orders/([0-9a-f-]{36})(?:/(status|quote))?$", "i"));
  if (adminOrderMatch && request.method === "GET" && !adminOrderMatch[2]) {
    await requireAdmin(request, env);
    const result = await getAdminOrder(env, adminOrderMatch[1]);
    if (!result) return json({ error: "Không tìm thấy đơn hàng." }, 404);
    return json(result);
  }

  if (adminOrderMatch && request.method === "POST" && adminOrderMatch[2] === "status") {
    const admin = await requireAdmin(request, env);
    const body = await readJsonLimited(request);
    const result = await updateOrderStatus(env, adminOrderMatch[1], admin, body, request.headers.get("Idempotency-Key"));
    return json(result, 200);
  }

  if (adminOrderMatch && request.method === "POST" && adminOrderMatch[2] === "quote") {
    const admin = await requireAdmin(request, env);
    const body = await readJsonLimited(request);
    const result = await createOrderQuote(env, adminOrderMatch[1], admin, body, request.headers.get("Idempotency-Key"));
    return json(result, 200);
  }

  const quoteResponseMatch = path.match(/^\/api\/v1\/orders\/([0-9a-f-]{36})\/quotes\/([0-9a-f-]{36})\/respond$/i);
  if (quoteResponseMatch && request.method === "POST") {
    const telegramUser = await authenticateTelegramRequest(request, env);
    const body = await readJsonLimited(request);
    return json(await respondToOrderQuote(env, telegramUser.id, quoteResponseMatch[1], quoteResponseMatch[2], body.decision));
  }

  if (path === "/api/v1/admin/catalog" && request.method === "GET") {
    await requireAdmin(request, env);
    return json({ items: await listAdminCatalog(env) });
  }

  if (path === "/api/v1/admin/catalog" && request.method === "POST") {
    await requireAdmin(request, env);
    return json({ item: await saveCatalogItem(env, await readJsonLimited(request)) }, 201);
  }

  const catalogItemMatch = path.match(/^\/api\/v1\/admin\/catalog\/([0-9a-f-]{36})$/i);
  if (catalogItemMatch && request.method === "PUT") {
    await requireAdmin(request, env);
    return json({ item: await updateCatalogItem(env, catalogItemMatch[1], await readJsonLimited(request)) });
  }

  const catalogStatusMatch = path.match(/^\/api\/v1\/admin\/catalog\/([0-9a-f-]{36})\/(activate|deactivate)$/i);
  if (catalogStatusMatch && request.method === "POST") {
    await requireAdmin(request, env);
    return json(await setCatalogItemActive(env, catalogStatusMatch[1], catalogStatusMatch[2] === "activate"));
  }

  if (path === "/api/v1/admin/giftcodes" && request.method === "GET") {
    await requireAdmin(request, env);
    return json({ giftcodes: await listAdminGiftcodes(env) });
  }

  if (path === "/api/v1/admin/giftcodes" && request.method === "POST") {
    const admin = await requireAdmin(request, env);
    return json(await createGiftcode(env, admin, await readJsonLimited(request)), 201);
  }

  const adminGiftcodeStatusMatch = path.match(/^\/api\/v1\/admin\/giftcodes\/([0-9a-f-]{36})\/(activate|deactivate)$/i);
  if (adminGiftcodeStatusMatch && request.method === "POST") {
    await requireAdmin(request, env);
    return json(await setGiftcodeActive(env, adminGiftcodeStatusMatch[1], adminGiftcodeStatusMatch[2] === "activate"));
  }

  if (path === "/api/v1/admin/referrals/commissions" && request.method === "GET") {
    await requireAdmin(request, env);
    return json({
      commissions: await listAdminReferralCommissions(env, url.searchParams.get("status") || "all")
    });
  }

  const adminCommissionMatch = path.match(/^\/api\/v1\/admin\/referrals\/commissions\/([0-9a-f-]{36})\/settle$/i);
  if (adminCommissionMatch && request.method === "POST") {
    const admin = await requireAdmin(request, env);
    return json(await settleReferralCommission(env, adminCommissionMatch[1], admin, await readJsonLimited(request)));
  }

  if (path === "/api/v1/admin/support/tickets" && request.method === "GET") {
    await requireAdmin(request, env);
    return json({ tickets: await listSupportTickets(env, null, url.searchParams.get("status") || "all") });
  }

  const adminTicketMatch = path.match(/^\/api\/v1\/admin\/support\/tickets\/([0-9a-f-]{36})(?:\/(messages))?$/i);
  if (adminTicketMatch && request.method === "GET" && !adminTicketMatch[2]) {
    await requireAdmin(request, env);
    const ticket = await getSupportTicket(env, adminTicketMatch[1]);
    if (!ticket) return json({ error: "Không tìm thấy ticket hỗ trợ." }, 404);
    return json(ticket);
  }

  if (adminTicketMatch && request.method === "POST" && adminTicketMatch[2] === "messages") {
    const admin = await requireAdmin(request, env);
    const body = await readJsonLimited(request);
    const ticket = await addSupportMessage(env, adminTicketMatch[1], { type: "admin", id: admin.id }, body.message, request.headers.get("Idempotency-Key"));
    return json(ticket);
  }

  const adminTicketStatusMatch = path.match(/^\/api\/v1\/admin\/support\/tickets\/([0-9a-f-]{36})\/status$/i);
  if (adminTicketStatusMatch && request.method === "POST") {
    await requireAdmin(request, env);
    const body = await readJsonLimited(request);
    return json(await updateSupportTicketStatus(env, adminTicketStatusMatch[1], body.status));
  }

  if (path === "/api/v1/admin/releases" && request.method === "POST") {
    await requireAdmin(request, env);
    return handleUploadApp(request, env);
  }

  if (path === "/api/v1/admin/deposits" && request.method === "GET") {
    await requireAdmin(request, env);
    return json({ deposits: await listAdminDeposits(env, url.searchParams.get("status") || "pending") });
  }

  const adminDepositPrefix = "/api/v1/admin/deposits/";
  const adminDepositSuffix = "/review";
  const adminDepositId = path.startsWith(adminDepositPrefix) && path.endsWith(adminDepositSuffix)
    ? path.slice(adminDepositPrefix.length, -adminDepositSuffix.length)
    : "";
  if (adminDepositId && /^[0-9a-f-]{36}$/i.test(adminDepositId) && request.method === "POST") {
    const admin = await requireAdmin(request, env);
    const result = await reviewDepositRequest(env, adminDepositId, admin, await readJsonLimited(request));
    return json(result);
  }

  if (path === "/api/v1/admin/stats" && request.method === "GET") {
    await requireAdmin(request, env);
    const releaseStats = await getReleaseStats(env);
    const orderStats = await getAdminOrderStats(env);
    return json({ stats: { ...releaseStats, orderStats, orders: orderStats.total } });
  }

  if (path === "/api/v1/admin/webhook/setup" && request.method === "POST") {
    await requireAdmin(request, env);
    return setupWebhook(request, env);
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();
    try {
      const response = await route(request, env, ctx);
      return withCors(response, request, env);
    } catch (error) {
      return withCors(errorHandler(error, requestId), request, env);
    }
  }
};
