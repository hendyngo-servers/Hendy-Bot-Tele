import express from "express";
import crypto from "node:crypto";
import { executeD1Query, d1First, getD1Health, getBotSettings, setBotSetting, writeAdminAudit } from "../services/productionD1.js";
import { requireTelegramAuth, requireAdmin, isTelegramAdmin } from "../middlewares/telegramAuth.js";

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const id = () => crypto.randomUUID();
const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const number = (value, fallback = 0) => Number.isSafeInteger(Number(value)) ? Number(value) : fallback;

function formatOrder(row) {
  if (!row) return row;
  let details = {};
  try { details = typeof row.details_json === "string" ? JSON.parse(row.details_json) : (row.details || {}); } catch {}
  return {
    ...row,
    orderNumber: row.orderNumber || row.order_number || row.id,
    userId: row.userId || row.telegram_id || row.user_id,
    customerName: row.customerName || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Thành viên",
    paymentStatus: row.paymentStatus || row.payment_status || "unpaid",
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
    description: row.description || details.description || "",
    details,
    quote: row.quote || details.quote || null
  };
}


async function ensureUser(user) {
  const telegramId = String(user.id);
  await executeD1Query(
    "INSERT INTO users(telegram_id,username,first_name,last_name,language_code) VALUES(?,?,?,?,?) " +
    "ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name," +
    "last_name=excluded.last_name,language_code=excluded.language_code,updated_at=datetime('now')",
    [telegramId, user.username || null, text(user.first_name, 100), text(user.last_name, 100), text(user.language_code || "vi", 12)]
  );
  await executeD1Query(
    "INSERT INTO referral_profiles(telegram_id,referral_code) VALUES(?,?) ON CONFLICT(telegram_id) DO NOTHING",
    [telegramId, "HENDY-" + crypto.randomBytes(4).toString("hex").toUpperCase()]
  );
  const record = await d1First(
    "SELECT telegram_id AS id,username,first_name,last_name,language_code,role,status,balance," +
    "voucher_balance AS voucher,points,created_at,updated_at FROM users WHERE telegram_id=?",
    [telegramId]
  );
  if (record && isTelegramAdmin(telegramId)) record.role = "admin";
  return record;
}

async function sendTelegram(method, payload) {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    const error = new Error("BOT_TOKEN chưa được cấu hình.");
    error.status = 503;
    throw error;
  }
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    const error = new Error(data.description || "Telegram API request failed.");
    error.status = 502;
    throw error;
  }
  return data.result;
}

function miniAppUrl(module = "home") {
  const base = process.env.WEBAPP_URL || process.env.BASE_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("module", module);
  return url.toString();
}

function mainKeyboard() {
  const web = (label, module) => {
    const url = miniAppUrl(module);
    return url ? { text: label, web_app: { url } } : { text: label, callback_data: "open_" + module };
  };
  return {
    inline_keyboard: [
      [web("🎮 MINI GAME LIVE", "mini_game_live"), web("🧰 THUÊ TOOL", "app_tool")],
      [web("💻 MUA CODE", "buy_code"), web("💳 NẠP TIỀN", "wallet")],
      [web("🛡️ OTP & PROXY", "otp_proxy"), web("👑 KHO VIP", "vip_tools")],
      [web("💎 TRUNG TÂM KHÁCH HÀNG", "support"), web("💞 GHÉP ĐÔI", "pairing")],
      [web("🤝 GIỚI THIỆU REF", "referral"), web("🎟️ GIFTCODE", "giftcode")],
      [
        { text: "👥 NHÓM CHAT", url: process.env.GROUP_CHAT_URL || "https://t.me/" },
        { text: "📢 KÊNH THÔNG BÁO", url: process.env.NEWS_CHANNEL_URL || "https://t.me/" }
      ]
    ]
  };
}

async function handleTelegramUpdate(update) {
  const message = update.message || update.edited_message;
  const callback = update.callback_query;

  if (callback) {
    await sendTelegram("answerCallbackQuery", { callback_query_id: callback.id });
    const chatId = callback.message?.chat?.id;
    if (chatId && String(callback.data || "").startsWith("open_")) {
      await sendTelegram("sendMessage", {
        chat_id: chatId,
        text: "Vui lòng mở Mini App từ nút chức năng trong menu.",
        reply_markup: mainKeyboard()
      });
    }
    return;
  }

  if (!message) return;
  const from = message.from || {};
  if (!from.id) return;
  const telegramId = String(from.id);
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Thành viên";

  await executeD1Query(
    "INSERT INTO users(telegram_id,username,first_name,last_name,language_code) VALUES(?,?,?,?,?) " +
    "ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name," +
    "last_name=excluded.last_name,updated_at=datetime('now')",
    [telegramId, from.username || null, text(from.first_name, 100), text(from.last_name, 100), text(from.language_code || "vi", 12)]
  );

  const settings = await getBotSettings();
  const admin = isTelegramAdmin(telegramId);
  if (settings.maintenance_mode && !admin) {
    if (message.chat?.id) {
      await sendTelegram("sendMessage", { chat_id: message.chat.id, text: settings.maintenance_message });
    }
    return;
  }

  if (message.web_app_data?.data) {
    if (message.chat?.id) {
      await sendTelegram("sendMessage", { chat_id: message.chat.id, text: "Đã nhận dữ liệu từ Mini App." });
    }
    return;
  }

  const raw = text(message.text, 4000);
  const command = raw.split(/\s+/)[0].split("@")[0].toLowerCase();
  const chatId = message.chat?.id;
  if (!chatId || !raw.startsWith("/")) return;

  if (command === "/start") {
    const user = await d1First("SELECT balance FROM users WHERE telegram_id=?", [telegramId]);
    const lines = [
      settings.welcome_message,
      "",
      "Xin chào " + name + "!",
      "Số dư ví: " + Number(user?.balance || 0).toLocaleString("vi-VN") + " VNĐ",
      "",
      "Chọn chức năng bạn cần ở menu bên dưới."
    ];
    if (admin) lines.push("", "Bạn có quyền quản trị. Sử dụng /admin để mở bảng điều khiển.");
    await sendTelegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), reply_markup: mainKeyboard() });
  } else if (command === "/help") {
    await sendTelegram("sendMessage", {
      chat_id: chatId,
      text: "/start - Mở menu dịch vụ\n/help - Hướng dẫn\n/id - Xem Telegram ID\n/wallet - Kiểm tra số dư" + (admin ? "\n/admin - Bảng quản trị" : "")
    });
  } else if (command === "/id") {
    await sendTelegram("sendMessage", { chat_id: chatId, text: "Telegram ID: " + telegramId });
  } else if (command === "/wallet") {
    const user = await d1First("SELECT balance,voucher_balance FROM users WHERE telegram_id=?", [telegramId]);
    await sendTelegram("sendMessage", {
      chat_id: chatId,
      text: "Số dư: " + Number(user?.balance || 0).toLocaleString("vi-VN") + " VNĐ\nVoucher: " + Number(user?.voucher_balance || 0).toLocaleString("vi-VN")
    });
  } else if (command === "/admin") {
    if (!admin) {
      await sendTelegram("sendMessage", { chat_id: chatId, text: "Bạn không có quyền quản trị." });
    } else {
      const target = process.env.ADMIN_WEBAPP_URL || process.env.WEBAPP_URL;
      if (!target) {
        await sendTelegram("sendMessage", { chat_id: chatId, text: "Chưa cấu hình ADMIN_WEBAPP_URL." });
      } else {
        await sendTelegram("sendMessage", {
          chat_id: chatId,
          text: "Trung tâm quản trị Hendy Bot",
          reply_markup: { inline_keyboard: [[{ text: "MỞ BẢNG QUẢN TRỊ", web_app: { url: target } }]] }
        });
      }
    }
  } else if (command === "/status") {
    await sendTelegram("sendMessage", { chat_id: chatId, text: "Bot đang hoạt động. Dữ liệu nghiệp vụ được lưu tại Cloudflare D1." });
  }
}

function constantTimeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get("/health", asyncRoute(async (_req, res) => {
  const health = await getD1Health();
  res.status(health.status === "connected" ? 200 : 503).json({ status: health.status, service: "hendy-bot-render", d1: health });
}));

// Telegram webhook is authenticated by Telegram's dedicated secret header, not WebApp initData.
router.post("/telegram/webhook", asyncRoute(async (req, res) => {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected || !constantTimeEqual(req.get("x-telegram-bot-api-secret-token"), expected)) {
    return res.status(401).json({ error: "Webhook secret không hợp lệ." });
  }
  const update = req.body || {};
  if (update.update_id === undefined || update.update_id === null) {
    return res.status(400).json({ error: "Telegram update thiếu update_id." });
  }
  const updateId = String(update.update_id);
  const inserted = await d1First("INSERT OR IGNORE INTO processed_updates(update_id) VALUES(?) RETURNING update_id", [updateId]);
  if (!inserted) return res.json({ ok: true, duplicate: true });

  const eventType = update.message ? "message" : update.callback_query ? "callback_query" : "other";
  const telegramId = update.message?.from?.id || update.callback_query?.from?.id || null;
  try {
    await handleTelegramUpdate(update);
    await executeD1Query(
      "INSERT INTO bot_events(update_id,event_type,telegram_user_id) VALUES(?,?,?) " +
      "ON CONFLICT(update_id) DO NOTHING",
      [updateId, eventType, telegramId ? String(telegramId) : null]
    );
    return res.json({ ok: true });
  } catch (error) {
    await executeD1Query("DELETE FROM processed_updates WHERE update_id=?", [updateId]).catch(() => {});
    throw error;
  }
}));

router.get("/catalog", asyncRoute(async (req, res) => {
  const category = text(req.query.category || req.query.module, 80);
  const search = text(req.query.search, 100);
  const params = [];
  let sql = "SELECT id,title,slug,category,module,icon,developer,version,tagline,description,price,unit_price," +
    "r2_object_key AS r2ObjectKey,pages_deploy_url AS pagesDeployUrl,metadata_json,is_active,sort_order,created_at " +
    "FROM catalog_products WHERE is_active=1";
  if (category && category !== "all") {
    sql += " AND (category=? OR module=?)";
    params.push(category, category);
  }
  if (search) {
    sql += " AND (title LIKE ? OR tagline LIKE ? OR description LIKE ?)";
    params.push("%" + search + "%", "%" + search + "%", "%" + search + "%");
  }
  sql += " ORDER BY sort_order ASC,created_at DESC LIMIT 200";
  const result = await executeD1Query(sql, params);
  res.json({ items: result.results.map((row) => ({ ...row, ...JSON.parse(row.metadata_json || "{}") })) });
}));

router.get("/public-config", asyncRoute(async (_req, res) => {
  const settings = await getBotSettings();
  res.json({
    language: "vi",
    maintenance_mode: settings.maintenance_mode,
    maintenance_message: settings.maintenance_message,
    support_telegram: settings.support_telegram
  });
}));

router.get("/releases", asyncRoute(async (_req, res) => {
  const rows = await executeD1Query("SELECT id,title,version,platform,download_url AS downloadUrl,notes,created_at FROM app_releases WHERE is_active=1 ORDER BY created_at DESC LIMIT 100");
  res.json({ releases: rows.results });
}));

router.use(requireTelegramAuth);

router.get("/home", asyncRoute(async (req, res) => {
  const user = await ensureUser(req.telegramUser);
  const orderCount = await d1First("SELECT COUNT(*) AS total FROM orders WHERE telegram_id=?", [String(req.telegramUser.id)]);
  res.json({ user, orderCount: Number(orderCount?.total || 0), orderSummary: { total: Number(orderCount?.total || 0) } });
}));

router.get("/wallet", asyncRoute(async (req, res) => {
  const user = await ensureUser(req.telegramUser);
  const ledger = await executeD1Query(
    "SELECT id,amount_delta AS amount_delta,balance_after,entry_type,note,created_at FROM wallet_ledger " +
    "WHERE telegram_id=? ORDER BY created_at DESC LIMIT 50",
    [String(req.telegramUser.id)]
  );
  const depositRows = await executeD1Query(
    "SELECT id,amount,transfer_content AS reference,status,admin_note,created_at FROM deposits WHERE telegram_id=? ORDER BY created_at DESC LIMIT 30",
    [String(req.telegramUser.id)]
  );
  res.json({
    userId: user.id,
    balance: user.balance,
    voucher: user.voucher,
    points: user.points,
    ledger: ledger.results,
    transactions: ledger.results,
    deposits: depositRows.results,
    payment: {
      configured: Boolean(process.env.VIETQR_BANK_ID && process.env.VIETQR_ACCOUNT_NO && process.env.VIETQR_ACCOUNT_NAME),
      bankName: process.env.VIETQR_BANK_ID || "",
      bankBin: process.env.VIETQR_BANK_ID || "",
      accountNumber: process.env.VIETQR_ACCOUNT_NO || "",
      accountName: process.env.VIETQR_ACCOUNT_NAME || "",
      instruction: "Chuyển khoản đúng số tiền và nội dung tham chiếu của yêu cầu nạp. Chờ quản trị viên đối soát."
    }
  });
}));

router.get("/orders", asyncRoute(async (req, res) => {
  await ensureUser(req.telegramUser);
  const result = await executeD1Query(
    "SELECT id,telegram_id AS userId,title,module,product_id AS productId,quantity,amount,status," +
    "payment_status AS paymentStatus,details_json,created_at,updated_at FROM orders " +
    "WHERE telegram_id=? ORDER BY created_at DESC LIMIT 100",
    [String(req.telegramUser.id)]
  );
  res.json({ orders: result.results.map(formatOrder) });
}));

router.post("/orders", asyncRoute(async (req, res) => {
  const userId = String(req.telegramUser.id);
  await ensureUser(req.telegramUser);
  const productId = text(req.body?.productId || req.body?.catalogItemId, 100);
  const quantity = Math.max(1, Math.min(100, number(req.body?.quantity, 1)));
  let product = null;
  if (productId) {
    product = await d1First("SELECT id,title,module,unit_price,is_active FROM catalog_products WHERE id=?", [productId]);
    if (!product || !product.is_active) return res.status(404).json({ error: "Sản phẩm không tồn tại hoặc đã ngừng bán." });
  }
  const amount = product ? Number(product.unit_price || 0) * quantity : 0;
  const orderId = "ORD-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  await executeD1Query(
    "INSERT INTO orders(id,telegram_id,title,module,product_id,quantity,amount,status,payment_status,details_json) " +
    "VALUES(?,?,?,?,?,?,?,'pending','unpaid',?)",
    [orderId, userId, text(req.body?.title || product?.title || "Yêu cầu dịch vụ", 180),
      text(req.body?.module || product?.module || "tools", 80), product?.id || null, quantity, amount,
      JSON.stringify({ ...(req.body?.details && typeof req.body.details === "object" ? req.body.details : {}), description: text(req.body?.description, 2000) })]
  );
  const order = await d1First("SELECT * FROM orders WHERE id=?", [orderId]);
  res.status(201).json({ success: true, order: formatOrder(order) });
}));

router.post("/orders/:id/pay", asyncRoute(async (req, res) => {
  const userId = String(req.telegramUser.id);
  const result = await d1First(
    "UPDATE orders SET payment_status='paid',status='processing',updated_at=datetime('now') " +
    "WHERE id=? AND telegram_id=? AND payment_status='unpaid' AND EXISTS " +
    "(SELECT 1 FROM users WHERE telegram_id=? AND balance>=orders.amount) RETURNING id",
    [text(req.params.id, 100), userId, userId]
  );
  if (!result) {
    const order = await d1First("SELECT status,payment_status,amount FROM orders WHERE id=? AND telegram_id=?", [req.params.id, userId]);
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
    if (order.payment_status === "paid") return res.json({ success: true, alreadyPaid: true });
    return res.status(400).json({ error: "Số dư không đủ hoặc đơn hàng không còn ở trạng thái có thể thanh toán." });
  }
  const updated = await d1First("SELECT * FROM orders WHERE id=?", [result.id]);
  const balance = await d1First("SELECT balance FROM users WHERE telegram_id=?", [userId]);
  res.json({ success: true, order: formatOrder(updated), balance: Number(balance?.balance || 0) });
}));

router.post("/orders/:id/status", requireAdmin, asyncRoute(async (req, res) => {
  const allowed = ["pending", "confirmed", "processing", "completed", "cancelled"];
  const status = text(req.body?.status, 30);
  if (!allowed.includes(status)) return res.status(400).json({ error: "Trạng thái đơn hàng không hợp lệ." });
  const updated = await d1First(
    "UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=? RETURNING id,status",
    [status, text(req.params.id, 100)]
  );
  if (!updated) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
  await writeAdminAudit(req.telegramUser.id, "order.status.update", "order", updated.id, { status });
  res.json({ success: true, order: updated });
}));

router.get("/vip", asyncRoute(async (req, res) => {
  const user = await ensureUser(req.telegramUser);
  const points = Number(user.points || 0);
  const tiers = [
    { code: "basic", name: "Cơ bản", minPoints: 0, benefits: ["Truy cập dịch vụ cơ bản"] },
    { code: "silver", name: "Bạc", minPoints: 2000, benefits: ["Ưu đãi theo hạng thành viên"] },
    { code: "gold", name: "Vàng", minPoints: 4000, benefits: ["Ưu tiên hỗ trợ"] },
    { code: "diamond", name: "Kim cương", minPoints: 10000, benefits: ["Hỗ trợ ưu tiên nâng cao"] }
  ];
  const currentTier = [...tiers].reverse().find((tier) => points >= tier.minPoints) || tiers[0];
  const nextTier = tiers.find((tier) => tier.minPoints > points) || null;
  res.json({ points, currentTier, nextTier, tiers });
}));

router.get("/support/tickets", asyncRoute(async (req, res) => {
  const result = await executeD1Query(
    "SELECT id,subject,category,status,last_message,created_at,updated_at FROM support_tickets " +
    "WHERE telegram_id=? ORDER BY updated_at DESC LIMIT 100",
    [String(req.telegramUser.id)]
  );
  res.json({ tickets: result.results });
}));

router.post("/support/tickets", asyncRoute(async (req, res) => {
  const userId = String(req.telegramUser.id);
  await ensureUser(req.telegramUser);
  const subject = text(req.body?.subject, 180);
  const message = text(req.body?.message, 4000);
  if (!subject || !message) return res.status(400).json({ error: "Vui lòng nhập tiêu đề và nội dung yêu cầu." });
  const ticketId = "TCK-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  await executeD1Query(
    "INSERT INTO support_tickets(id,telegram_id,subject,category,status,last_message) VALUES(?,?,?,?,'open',?)",
    [ticketId, userId, subject, text(req.body?.category || "general", 60), message]
  );
  await executeD1Query(
    "INSERT INTO support_messages(id,ticket_id,sender_telegram_id,sender_type,message) VALUES(?,?,?,'user',?)",
    [crypto.randomUUID(), ticketId, userId, message]
  );
  res.status(201).json({ success: true, ticket: await d1First("SELECT * FROM support_tickets WHERE id=?", [ticketId]) });
}));

router.post("/support/tickets/:id/reply", asyncRoute(async (req, res) => {
  const userId = String(req.telegramUser.id);
  const ticketId = text(req.params.id, 100);
  const message = text(req.body?.message, 4000);
  if (!message) return res.status(400).json({ error: "Nội dung phản hồi không được để trống." });
  const ticket = await d1First("SELECT id,telegram_id,status FROM support_tickets WHERE id=?", [ticketId]);
  if (!ticket) return res.status(404).json({ error: "Không tìm thấy yêu cầu hỗ trợ." });
  const admin = isTelegramAdmin(userId);
  if (!admin && ticket.telegram_id !== userId) return res.status(403).json({ error: "Không có quyền truy cập yêu cầu này." });
  await executeD1Query(
    "INSERT INTO support_messages(id,ticket_id,sender_telegram_id,sender_type,message) VALUES(?,?,?,?,?)",
    [crypto.randomUUID(), ticketId, userId, admin ? "admin" : "user", message]
  );
  await executeD1Query(
    "UPDATE support_tickets SET last_message=?,updated_at=datetime('now') WHERE id=?",
    [message, ticketId]
  );
  const messages = await executeD1Query("SELECT * FROM support_messages WHERE ticket_id=? ORDER BY created_at", [ticketId]);
  res.json({ success: true, messages: messages.results });
}));

router.post("/deposits", asyncRoute(async (req, res) => {
  const userId = String(req.telegramUser.id);
  await ensureUser(req.telegramUser);
  const amount = number(req.body?.amountVnd, 0);
  if (amount < 10000 || amount > 50000000) return res.status(400).json({ error: "Số tiền nạp phải từ 10.000 đến 50.000.000 VNĐ." });
  const bankId = text(process.env.VIETQR_BANK_ID, 20);
  const accountNo = text(process.env.VIETQR_ACCOUNT_NO, 40);
  const accountName = text(process.env.VIETQR_ACCOUNT_NAME, 120);
  if (!bankId || !accountNo || !accountName) return res.status(503).json({ error: "Chưa cấu hình thông tin nhận thanh toán VietQR." });
  const depositId = "DEP-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  const transferContent = "HENDY " + userId + " " + depositId;
  await executeD1Query(
    "INSERT INTO deposits(id,telegram_id,amount,transfer_content,bank_id,account_no,account_name) VALUES(?,?,?,?,?,?,?)",
    [depositId, userId, amount, transferContent, bankId, accountNo, accountName]
  );
  const qrUrl = "https://img.vietqr.io/image/" + encodeURIComponent(bankId) + "-" + encodeURIComponent(accountNo) +
    "-compact2.png?amount=" + amount + "&addInfo=" + encodeURIComponent(transferContent) +
    "&accountName=" + encodeURIComponent(accountName);
  res.status(201).json({
    success: true,
    deposit: { id: depositId, amount, transferContent, status: "pending" },
    vietQrUrl,
    transfer: { amount, reference: transferContent, qrUrl }
  });
}));

router.post("/giftcodes/redeem", asyncRoute(async (req, res) => {
  const userId = String(req.telegramUser.id);
  await ensureUser(req.telegramUser);
  const code = text(req.body?.code, 80).toUpperCase();
  if (!code) return res.status(400).json({ error: "Vui lòng nhập giftcode." });
  const inserted = await d1First(
    "INSERT INTO giftcode_redemptions(id,code,telegram_id) " +
    "SELECT ?,code,? FROM giftcodes WHERE code=? AND status='active' AND used_count<max_uses " +
    "AND (expires_at IS NULL OR expires_at>datetime('now')) " +
    "AND NOT EXISTS(SELECT 1 FROM giftcode_redemptions WHERE code=? AND telegram_id=?) RETURNING code",
    [crypto.randomUUID(), userId, code, code, userId]
  );
  if (!inserted) return res.status(400).json({ error: "Giftcode không hợp lệ, đã hết lượt hoặc bạn đã sử dụng." });
  const gift = await d1First("SELECT amount FROM giftcodes WHERE code=?", [code]);
  res.json({ success: true, code, amount: Number(gift?.amount || 0) });
}));

router.get("/deposits", requireAdmin, asyncRoute(async (req, res) => {
  const filter = text(req.query.filter || req.query.status || "all", 20);
  const rows = await executeD1Query(
    "SELECT d.*,u.username,u.first_name,u.last_name FROM deposits d JOIN users u ON u.telegram_id=d.telegram_id " +
    (filter === "all" ? "" : "WHERE d.status=? ") + "ORDER BY d.created_at DESC LIMIT 200",
    filter === "all" ? [] : [filter]
  );
  res.json({ deposits: rows.results });
}));

router.post("/deposits/:id/review", requireAdmin, asyncRoute(async (req, res) => {
  const decision = text(req.body?.decision, 20);
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Quyết định không hợp lệ." });
  const updated = await d1First(
    "UPDATE deposits SET status=?,admin_note=?,reviewed_at=datetime('now'),reviewer_id=? " +
    "WHERE id=? AND status='pending' RETURNING id,telegram_id,amount,status",
    [decision, text(req.body?.note, 500), String(req.telegramUser.id), text(req.params.id, 100)]
  );
  if (!updated) return res.status(409).json({ error: "Không tìm thấy yêu cầu hoặc yêu cầu đã được xử lý." });
  await writeAdminAudit(req.telegramUser.id, "deposit.review", "deposit", updated.id, { decision });
  res.json({ success: true, deposit: updated });
}));

router.get("/giftcodes", requireAdmin, asyncRoute(async (_req, res) => {
  const rows = await executeD1Query("SELECT * FROM giftcodes ORDER BY created_at DESC LIMIT 200");
  res.json({ giftcodes: rows.results });
}));

router.post("/giftcodes", requireAdmin, asyncRoute(async (req, res) => {
  const prefix = text(req.body?.codePrefix || "HENDY", 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const amount = number(req.body?.amountVnd || req.body?.amount, 0);
  const maxUses = Math.max(1, Math.min(10000, number(req.body?.maxUses, 1)));
  if (!prefix || amount < 1) return res.status(400).json({ error: "Tiền thưởng và tiền tố mã không hợp lệ." });
  const code = prefix + "-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  const expiresAt = text(req.body?.expiresAt, 40) || null;
  await executeD1Query(
    "INSERT INTO giftcodes(code,amount,max_uses,expires_at,created_by) VALUES(?,?,?,?,?)",
    [code, amount, maxUses, expiresAt, String(req.telegramUser.id)]
  );
  await writeAdminAudit(req.telegramUser.id, "giftcode.create", "giftcode", code, { amount, maxUses });
  res.status(201).json({ code, amount, max_uses: maxUses, used_count: 0, status: "active", expires_at: expiresAt });
}));

router.get("/admin/stats", requireAdmin, asyncRoute(async (_req, res) => {
  const started = Date.now();
  const stats = await d1First(
    "SELECT (SELECT COUNT(*) FROM users) AS users," +
    "(SELECT COUNT(*) FROM app_releases WHERE is_active=1) AS releases," +
    "(SELECT COUNT(*) FROM orders) AS total_orders," +
    "(SELECT COUNT(*) FROM orders WHERE status='pending') AS pending_orders," +
    "(SELECT COUNT(*) FROM orders WHERE status='processing') AS processing_orders," +
    "(SELECT COUNT(*) FROM orders WHERE status='completed') AS completed_orders," +
    "(SELECT COUNT(*) FROM deposits WHERE status='pending') AS pending_deposits," +
    "(SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','pending')) AS open_tickets," +
    "(SELECT COUNT(*) FROM bot_events) AS total_updates," +
    "(SELECT COALESCE(SUM(amount_delta),0) FROM wallet_ledger) AS ledger_net"
  );
  const settings = await getBotSettings();
  const d1Health = await getD1Health();
  res.json({
    ...stats,
    stats: {
      users: Number(stats?.users || 0),
      releases: Number(stats?.releases || 0),
      orderStats: {
        total: Number(stats?.total_orders || 0),
        pending: Number(stats?.pending_orders || 0),
        processing: Number(stats?.processing_orders || 0),
        completed: Number(stats?.completed_orders || 0)
      }
    },
    totalUsers: Number(stats?.users || 0),
    orderStats: {
      total: Number(stats?.total_orders || 0),
      pending: Number(stats?.pending_orders || 0),
      processing: Number(stats?.processing_orders || 0),
      completed: Number(stats?.completed_orders || 0)
    },
    d1Latency: d1Health.latency_ms + " ms",
    d1Status: d1Health.status,
    d1TotalQueries: d1Health.total_queries,
    d1Queries: d1Health.total_queries,
    d1ServedBy: d1Health.served_by,
    d1Database: d1Health.database,
    maintenanceMode: settings.maintenance_mode,
    maintenanceMessage: settings.maintenance_message,
    generatedAt: new Date().toISOString(),
    requestDurationMs: Date.now() - started
  });
}));

router.get("/admin/settings", requireAdmin, asyncRoute(async (_req, res) => {
  res.json({ settings: await getBotSettings() });
}));

router.post("/admin/settings", requireAdmin, asyncRoute(async (req, res) => {
  const allowed = ["welcome_message", "support_telegram", "language", "vietqr_bank", "vietqr_account_no", "vietqr_account_name"];
  const updates = req.body && typeof req.body === "object" ? req.body : {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      const value = text(updates[key], key === "welcome_message" ? 2000 : key === "vietqr_account_name" ? 120 : 100);
      await setBotSetting(key, value, String(req.telegramUser.id));
    }
  }
  if (updates.maintenance_message !== undefined) {
    await setBotSetting("maintenance_message", text(updates.maintenance_message, 1000), String(req.telegramUser.id));
  }
  await writeAdminAudit(req.telegramUser.id, "bot.settings.update", "settings", null, { keys: Object.keys(updates).filter((key) => [...allowed, "maintenance_message"].includes(key)) });
  res.json({ success: true, settings: await getBotSettings() });
}));

router.post("/admin/maintenance", requireAdmin, asyncRoute(async (req, res) => {
  const enabled = req.body?.enabled === true || req.body?.enabled === "true" || req.body?.enabled === 1;
  if (req.body?.message !== undefined) await setBotSetting("maintenance_message", text(req.body.message, 1000), String(req.telegramUser.id));
  await setBotSetting("maintenance_mode", enabled ? "1" : "0", String(req.telegramUser.id));
  await writeAdminAudit(req.telegramUser.id, "bot.maintenance.toggle", "settings", "maintenance_mode", { enabled });
  const settings = await getBotSettings();
  res.json({ success: true, maintenance_mode: settings.maintenance_mode, settings });
}));

router.get("/admin/orders", requireAdmin, asyncRoute(async (req, res) => {
  const status = text(req.query.status || "all", 30);
  const limit = Math.max(1, Math.min(200, number(req.query.limit, 100)));
  const where = status === "all" ? "" : "WHERE o.status=?";
  const rows = await executeD1Query(
    "SELECT o.*,u.username,u.first_name,u.last_name FROM orders o JOIN users u ON u.telegram_id=o.telegram_id " +
    where + " ORDER BY o.created_at DESC LIMIT " + limit,
    status === "all" ? [] : [status]
  );
  const totals = await d1First("SELECT COUNT(*) AS total FROM orders");
  res.json({ orders: rows.results, total: Number(totals?.total || 0) });
}));

router.get("/admin/catalog", requireAdmin, asyncRoute(async (_req, res) => {
  const rows = await executeD1Query("SELECT * FROM catalog_products ORDER BY sort_order,created_at DESC");
  res.json({ items: rows.results });
}));

router.post("/admin/catalog", requireAdmin, asyncRoute(async (req, res) => {
  const title = text(req.body?.title, 180);
  const slug = text(req.body?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), 180);
  if (!title || !slug) return res.status(400).json({ error: "Tên sản phẩm và slug là bắt buộc." });
  const productId = "PRD-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  const price = Math.max(0, number(req.body?.unitPrice ?? req.body?.price, 0));
  await executeD1Query(
    "INSERT INTO catalog_products(id,title,slug,category,module,description,tagline,icon,version,price,unit_price,sort_order,is_active) " +
    "VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,1)",
    [productId, title, slug, text(req.body?.category || req.body?.module || "tools", 80),
      text(req.body?.module || "app_tool", 80), text(req.body?.description, 2000),
      text(req.body?.tagline, 500), text(req.body?.icon || "📦", 8), text(req.body?.version || "1.0.0", 40),
      price, price, number(req.body?.sortOrder, 100)]
  );
  await writeAdminAudit(req.telegramUser.id, "catalog.create", "product", productId, { title, price });
  res.status(201).json({ item: await d1First("SELECT * FROM catalog_products WHERE id=?", [productId]) });
}));

router.put("/admin/catalog/:id", requireAdmin, asyncRoute(async (req, res) => {
  const updated = await d1First(
    "UPDATE catalog_products SET title=?,description=?,unit_price=?,price=?,is_active=?,updated_at=datetime('now') " +
    "WHERE id=? RETURNING *",
    [text(req.body?.title, 180), text(req.body?.description, 2000),
      Math.max(0, number(req.body?.unitPrice ?? req.body?.price, 0)),
      Math.max(0, number(req.body?.unitPrice ?? req.body?.price, 0)),
      req.body?.is_active === 0 ? 0 : 1, text(req.params.id, 100)]
  );
  if (!updated) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
  await writeAdminAudit(req.telegramUser.id, "catalog.update", "product", updated.id);
  res.json({ item: updated });
}));

router.post("/admin/catalog/:id/:action", requireAdmin, asyncRoute(async (req, res) => {
  if (!["activate", "deactivate"].includes(req.params.action)) return res.status(404).json({ error: "Không tìm thấy thao tác." });
  const active = req.params.action === "activate" ? 1 : 0;
  const updated = await d1First("UPDATE catalog_products SET is_active=?,updated_at=datetime('now') WHERE id=? RETURNING id,is_active", [active, text(req.params.id, 100)]);
  if (!updated) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
  await writeAdminAudit(req.telegramUser.id, "catalog.status", "product", updated.id, { is_active: active });
  res.json({ success: true, item: updated });
}));

router.get("/admin/support/tickets", requireAdmin, asyncRoute(async (req, res) => {
  const status = text(req.query.status || "all", 30);
  const rows = await executeD1Query(
    "SELECT t.*,u.username,u.first_name,u.last_name FROM support_tickets t JOIN users u ON u.telegram_id=t.telegram_id " +
    (status === "all" ? "" : "WHERE t.status=? ") + "ORDER BY t.updated_at DESC LIMIT 200",
    status === "all" ? [] : [status]
  );
  res.json({ tickets: rows.results });
}));

router.post("/admin/support/tickets/:id/status", requireAdmin, asyncRoute(async (req, res) => {
  const status = text(req.body?.status, 30);
  if (!["open", "pending", "resolved", "closed"].includes(status)) return res.status(400).json({ error: "Trạng thái ticket không hợp lệ." });
  const updated = await d1First("UPDATE support_tickets SET status=?,updated_at=datetime('now') WHERE id=? RETURNING id,status", [status, text(req.params.id, 100)]);
  if (!updated) return res.status(404).json({ error: "Không tìm thấy ticket." });
  await writeAdminAudit(req.telegramUser.id, "support.ticket.status", "ticket", updated.id, { status });
  res.json({ success: true, ticket: updated });
}));

router.get("/admin/telegram/webhook-info", requireAdmin, asyncRoute(async (_req, res) => {
  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(503).json({ error: "BOT_TOKEN chưa được cấu hình." });
  const [webhookResponse, meResponse] = await Promise.all([
    fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo", { signal: AbortSignal.timeout(10000) }),
    fetch("https://api.telegram.org/bot" + token + "/getMe", { signal: AbortSignal.timeout(10000) })
  ]);
  const webhookInfo = await webhookResponse.json();
  const botMe = await meResponse.json();
  if (!webhookResponse.ok || !webhookInfo.ok || !meResponse.ok || !botMe.ok) return res.status(502).json({ error: "Không thể lấy trạng thái Telegram Bot." });
  res.json({ webhookInfo, botMe });
}));

router.post("/admin/telegram/set-webhook", requireAdmin, asyncRoute(async (req, res) => {
  const base = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL;
  const token = process.env.BOT_TOKEN;
  const secret = process.env.WEBHOOK_SECRET;
  if (!base || !token || !secret) return res.status(503).json({ error: "Thiếu BASE_URL, BOT_TOKEN hoặc WEBHOOK_SECRET." });
  const expectedUrl = new URL("/api/telegram/webhook", base).toString();
  const requested = text(req.body?.webhookUrl || expectedUrl, 500);
  if (requested !== expectedUrl || !expectedUrl.startsWith("https://")) return res.status(400).json({ error: "Webhook URL phải trùng chính xác endpoint HTTPS của Render." });
  const result = await sendTelegram("setWebhook", {
    url: expectedUrl,
    secret_token: secret,
    allowed_updates: ["message", "edited_message", "callback_query"]
  });
  await writeAdminAudit(req.telegramUser.id, "telegram.webhook.set", "telegram", null, { webhookUrl: expectedUrl });
  res.json({ success: true, result, targetUrl: expectedUrl });
}));

router.post("/admin/d1/query", requireAdmin, asyncRoute(async (req, res) => {
  const sql = text(req.body?.sql, 2048).replace(/;\s*$/, "");
  if (!/^select\b/i.test(sql) || sql.includes(";") || /--|\/\*|\b(insert|update|delete|drop|alter|pragma|attach|detach|replace|create|vacuum)\b/i.test(sql)) {
    return res.status(400).json({ error: "Console chỉ cho phép một câu lệnh SELECT chỉ đọc, không có dấu chấm phẩy hay comment." });
  }
  const result = await executeD1Query(sql, Array.isArray(req.body?.params) ? req.body.params.slice(0, 50) : []);
  res.json(result);
}));

router.get("/admin/d1/health", requireAdmin, asyncRoute(async (_req, res) => {
  res.json(await getD1Health());
}));

router.post("/admin/backup", requireAdmin, asyncRoute(async (_req, res) => {
  const workerBase = process.env.BACKUP_WORKER_URL;
  const secret = process.env.BACKUP_TRIGGER_SECRET;
  if (!workerBase || !secret) return res.status(503).json({ error: "Chưa cấu hình BACKUP_WORKER_URL và BACKUP_TRIGGER_SECRET." });
  const endpoint = new URL("/api/backups/run", workerBase);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ requestedBy: String(req.telegramUser.id) }),
    signal: AbortSignal.timeout(60000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(502).json({ error: payload.error || "Worker sao lưu báo lỗi." });
  await writeAdminAudit(req.telegramUser.id, "backup.manual", "r2", null, payload);
  res.json({ success: true, backup: payload });
}));

router.post("/admin/catalog/package-deploy", requireAdmin, async (_req, res) => {
  res.status(501).json({ error: "Chức năng đóng gói cần luồng tải tệp trực tiếp vào R2 đã ký. Không ghi metadata giả hoặc báo thành công khi chưa lưu tệp." });
});

// Compatibility endpoints for the separately hosted admin and user frontends.


router.get("/links", asyncRoute(async (req, res) => {
  const rows = await executeD1Query("SELECT id,brand,account_label AS tk FROM user_links WHERE telegram_id=? ORDER BY created_at DESC", [String(req.telegramUser.id)]);
  const links = {};
  for (const row of rows.results) {
    if (!links[row.brand]) links[row.brand] = [];
    links[row.brand].push(row);
  }
  res.json({ links });
}));

router.post("/links", asyncRoute(async (req, res) => {
  const brand = text(req.body?.brand, 80);
  const label = text(req.body?.accountLabel, 180);
  if (!brand || !label) return res.status(400).json({ error: "Thiếu thương hiệu hoặc tài khoản." });
  await executeD1Query("INSERT INTO user_links(id,telegram_id,brand,account_label) VALUES(?,?,?,?) ON CONFLICT(telegram_id,brand,account_label) DO NOTHING", [crypto.randomUUID(), String(req.telegramUser.id), brand, label]);
  const rows = await executeD1Query("SELECT id,brand,account_label AS tk FROM user_links WHERE telegram_id=? ORDER BY created_at DESC", [String(req.telegramUser.id)]);
  const links = {};
  for (const row of rows.results) {
    if (!links[row.brand]) links[row.brand] = [];
    links[row.brand].push(row);
  }
  res.json({ links });
}));

router.delete("/links/:brand/:linkId", asyncRoute(async (req, res) => {
  await executeD1Query("DELETE FROM user_links WHERE id=? AND brand=? AND telegram_id=?", [text(req.params.linkId, 100), text(req.params.brand, 80), String(req.telegramUser.id)]);
  res.json({ success: true });
}));

router.get("/admin/deposits", requireAdmin, asyncRoute(async (req, res) => {
  const status = text(req.query.status || "all", 20);
  const rows = await executeD1Query(
    "SELECT d.*,u.username,u.first_name,u.last_name FROM deposits d JOIN users u ON u.telegram_id=d.telegram_id " +
    (status === "all" ? "" : "WHERE d.status=? ") + "ORDER BY d.created_at DESC LIMIT 200",
    status === "all" ? [] : [status]
  );
  res.json({ deposits: rows.results });
}));

router.get("/admin/orders/:id", requireAdmin, asyncRoute(async (req, res) => {
  const order = await d1First("SELECT o.*,u.username,u.first_name,u.last_name FROM orders o JOIN users u ON u.telegram_id=o.telegram_id WHERE o.id=?", [text(req.params.id, 100)]);
  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
  res.json({ order, events: [] });
}));

router.post("/admin/orders/:id/status", requireAdmin, asyncRoute(async (req, res) => {
  const allowed = ["pending", "confirmed", "processing", "completed", "cancelled"];
  const status = text(req.body?.status, 30);
  if (!allowed.includes(status)) return res.status(400).json({ error: "Trạng thái đơn hàng không hợp lệ." });
  const updated = await d1First("UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=? RETURNING id,status", [status, text(req.params.id, 100)]);
  if (!updated) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
  await writeAdminAudit(req.telegramUser.id, "order.status.update", "order", updated.id, { status });
  res.json({ order: updated, events: [] });
}));

router.post("/admin/orders/:id/quote", requireAdmin, asyncRoute(async (req, res) => {
  const amount = number(req.body?.amount, -1);
  if (amount < 0) return res.status(400).json({ error: "Giá báo không hợp lệ." });
  const updated = await d1First(
    "UPDATE orders SET amount=?,details_json=json_set(details_json,'$.quote.note',?,'$.quote.status','sent'),updated_at=datetime('now') WHERE id=? RETURNING *",
    [amount, text(req.body?.note, 1000), text(req.params.id, 100)]
  );
  if (!updated) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
  await writeAdminAudit(req.telegramUser.id, "order.quote", "order", updated.id, { amount });
  res.json({ order: updated, events: [] });
}));

router.post("/admin/deposits/:id/review", requireAdmin, asyncRoute(async (req, res) => {
  const decision = text(req.body?.status || req.body?.decision, 20);
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Quyết định không hợp lệ." });
  const updated = await d1First(
    "UPDATE deposits SET status=?,admin_note=?,reviewed_at=datetime('now'),reviewer_id=? WHERE id=? AND status='pending' RETURNING id,telegram_id,amount,status",
    [decision, text(req.body?.note, 500), String(req.telegramUser.id), text(req.params.id, 100)]
  );
  if (!updated) return res.status(409).json({ error: "Không tìm thấy yêu cầu hoặc đã được xử lý." });
  await writeAdminAudit(req.telegramUser.id, "deposit.review", "deposit", updated.id, { decision });
  res.json({ success: true, deposit: updated });
}));

router.get("/admin/giftcodes", requireAdmin, asyncRoute(async (_req, res) => {
  const rows = await executeD1Query("SELECT * FROM giftcodes ORDER BY created_at DESC LIMIT 200");
  res.json({ giftcodes: rows.results });
}));

router.post("/admin/giftcodes", requireAdmin, asyncRoute(async (req, res) => {
  const prefix = text(req.body?.codePrefix || "HENDY", 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const amount = number(req.body?.amountVnd ?? req.body?.amount, 0);
  const maxUses = Math.max(1, Math.min(10000, number(req.body?.maxUses ?? req.body?.maxRedemptions, 1)));
  if (!prefix || amount < 1) return res.status(400).json({ error: "Thông tin giftcode không hợp lệ." });
  const code = prefix + "-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  const expiresAt = text(req.body?.expiresAt, 40) || null;
  await executeD1Query("INSERT INTO giftcodes(code,amount,max_uses,expires_at,created_by) VALUES(?,?,?,?,?)", [code, amount, maxUses, expiresAt, String(req.telegramUser.id)]);
  await writeAdminAudit(req.telegramUser.id, "giftcode.create", "giftcode", code, { amount, maxUses });
  res.status(201).json({ code, amount, max_uses: maxUses, used_count: 0, status: "active", expires_at: expiresAt });
}));

router.post("/admin/giftcodes/:code/:action", requireAdmin, asyncRoute(async (req, res) => {
  if (!["activate", "deactivate"].includes(req.params.action)) return res.status(404).json({ error: "Thao tác không hợp lệ." });
  const status = req.params.action === "activate" ? "active" : "revoked";
  const updated = await d1First("UPDATE giftcodes SET status=? WHERE code=? RETURNING code,status", [status, text(req.params.code, 80)]);
  if (!updated) return res.status(404).json({ error: "Không tìm thấy giftcode." });
  await writeAdminAudit(req.telegramUser.id, "giftcode.status", "giftcode", updated.code, { status });
  res.json({ success: true, giftcode: updated });
}));

router.get("/admin/support/tickets/:id", requireAdmin, asyncRoute(async (req, res) => {
  const ticket = await d1First("SELECT * FROM support_tickets WHERE id=?", [text(req.params.id, 100)]);
  if (!ticket) return res.status(404).json({ error: "Không tìm thấy ticket." });
  const messages = await executeD1Query("SELECT * FROM support_messages WHERE ticket_id=? ORDER BY created_at", [ticket.id]);
  res.json({ ticket, messages: messages.results });
}));

router.post("/admin/support/tickets/:id/messages", requireAdmin, asyncRoute(async (req, res) => {
  const ticketId = text(req.params.id, 100);
  const message = text(req.body?.message, 4000);
  const ticket = await d1First("SELECT id FROM support_tickets WHERE id=?", [ticketId]);
  if (!ticket) return res.status(404).json({ error: "Không tìm thấy ticket." });
  if (!message) return res.status(400).json({ error: "Nội dung phản hồi không được để trống." });
  await executeD1Query("INSERT INTO support_messages(id,ticket_id,sender_telegram_id,sender_type,message) VALUES(?,?,?,'admin',?)", [crypto.randomUUID(), ticketId, String(req.telegramUser.id), message]);
  await executeD1Query("UPDATE support_tickets SET last_message=?,updated_at=datetime('now') WHERE id=?", [message, ticketId]);
  const messages = await executeD1Query("SELECT * FROM support_messages WHERE ticket_id=? ORDER BY created_at", [ticketId]);
  res.json({ ticket, messages: messages.results });
}));

router.get("/admin/referrals/commissions", requireAdmin, asyncRoute(async (_req, res) => {
  res.json({ commissions: [], total: 0, note: "Module hoa hồng chưa có schema dữ liệu production." });
}));

router.post("/admin/webhook/setup", requireAdmin, asyncRoute(async (_req, res) => {
  const base = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL;
  const expectedUrl = base ? new URL("/api/telegram/webhook", base).toString() : "";
  if (!expectedUrl || !process.env.BOT_TOKEN || !process.env.WEBHOOK_SECRET) return res.status(503).json({ error: "Thiếu cấu hình webhook trên Render." });
  const result = await sendTelegram("setWebhook", { url: expectedUrl, secret_token: process.env.WEBHOOK_SECRET, allowed_updates: ["message", "edited_message", "callback_query"] });
  res.json({ success: true, result, targetUrl: expectedUrl });
}));

export default router;
