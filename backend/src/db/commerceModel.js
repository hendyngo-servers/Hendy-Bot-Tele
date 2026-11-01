import { parseTelegramId, randomId, safeText } from "../utils/helpers.js";

const CATALOG_MODULES = new Set(["mini_game_live","app_tool","buy_code","otp_proxy","vip"]);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function normalizeIdempotency(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) fail("Thiếu hoặc sai Idempotency-Key.");
  return key;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function referralCodeFor(userId) {
  return "HD" + BigInt(String(userId)).toString(36).toUpperCase();
}

export async function ensureReferralCode(env, userId) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const current = await env.DB.prepare("SELECT referral_code FROM users WHERE id = ?").bind(id).first();
  if (!current) fail("Không tìm thấy người dùng.", 404);
  if (current.referral_code) return current.referral_code;

  const code = referralCodeFor(id);
  await env.DB.prepare(
    "UPDATE users SET referral_code = ? WHERE id = ? AND (referral_code IS NULL OR referral_code = '')"
  ).bind(code, id).run();
  const saved = await env.DB.prepare("SELECT referral_code FROM users WHERE id = ?").bind(id).first();
  if (!saved?.referral_code) fail("Không thể tạo mã giới thiệu.");
  return saved.referral_code;
}

export async function listCatalog(env, module = "all") {
  const selected = String(module || "all").trim();
  if (selected !== "all" && !CATALOG_MODULES.has(selected)) fail("Module danh mục không hợp lệ.");
  const result = selected === "all"
    ? await env.DB.prepare("SELECT id,module,slug,title,description,unit_price,currency,duration_days,stock FROM catalog_items WHERE is_active = 1 ORDER BY module,sort_order,title").all()
    : await env.DB.prepare("SELECT id,module,slug,title,description,unit_price,currency,duration_days,stock FROM catalog_items WHERE is_active = 1 AND module = ? ORDER BY sort_order,title").bind(selected).all();
  return result.results || [];
}

export async function listAdminCatalog(env) {
  const result = await env.DB.prepare(
    "SELECT id,module,slug,title,description,unit_price,currency,duration_days,stock,is_active,sort_order,created_at,updated_at FROM catalog_items ORDER BY module,sort_order,title"
  ).all();
  return result.results || [];
}

export async function saveCatalogItem(env, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Dữ liệu danh mục không hợp lệ.");
  const module = String(input.module || "");
  if (!CATALOG_MODULES.has(module)) fail("Module danh mục không hợp lệ.");
  const slug = safeText(input.slug, 80).toLowerCase();
  const title = safeText(input.title, 100);
  const description = safeText(input.description, 1000);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || title.length < 2) fail("Slug hoặc tên sản phẩm không hợp lệ.");
  const unitPrice = input.unitPrice === "" || input.unitPrice === null || input.unitPrice === undefined ? null : Number(input.unitPrice);
  const durationDays = input.durationDays === "" || input.durationDays === null || input.durationDays === undefined ? null : Number(input.durationDays);
  const stock = input.stock === "" || input.stock === null || input.stock === undefined ? null : Number(input.stock);
  if (unitPrice !== null && (!Number.isSafeInteger(unitPrice) || unitPrice < 0)) fail("Đơn giá phải là số nguyên không âm.");
  if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) fail("Thời hạn phải từ 1 đến 3650 ngày.");
  if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 1000000)) fail("Tồn kho không hợp lệ.");
  const id = randomId();
  try {
    await env.DB.prepare(
      `INSERT INTO catalog_items
        (id,module,slug,title,description,unit_price,currency,duration_days,stock,is_active,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`
    ).bind(id,module,slug,title,description,unitPrice,"VND",durationDays,stock,Number(input.sortOrder) || 100).run();
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error?.message))) fail("Slug danh mục đã tồn tại.", 409);
    throw error;
  }
  return env.DB.prepare("SELECT * FROM catalog_items WHERE id = ?").bind(id).first();
}

export async function setCatalogItemActive(env, id, active) {
  const result = await env.DB.prepare(
    "UPDATE catalog_items SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(active ? 1 : 0, id).run();
  if (!result.meta?.changes) fail("Không tìm thấy sản phẩm danh mục.", 404);
  return { success: true, active: Boolean(active) };
}

export async function getVipProfile(env, userId) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const user = await env.DB.prepare(
    "SELECT vip_tier,vip_points,referral_code FROM users WHERE id = ?"
  ).bind(id).first();
  if (!user) fail("Không tìm thấy người dùng.", 404);
  const tiers = await env.DB.prepare(
    "SELECT code,name,min_points,benefits_json FROM vip_tiers WHERE is_active = 1 ORDER BY sort_order,min_points"
  ).all();
  const current = (tiers.results || []).find((tier) => tier.code === user.vip_tier) || (tiers.results || [])[0] || null;
  return {
    points: Number(user.vip_points || 0),
    pointsPer10000Vnd: Math.max(0, Number(env.VIP_POINTS_PER_10000_VND || 0)),
    currentTier: current ? { code: current.code, name: current.name } : { code: "basic", name: "Cơ bản" },
    tiers: (tiers.results || []).map((tier) => ({
      code: tier.code,
      name: tier.name,
      minPoints: Number(tier.min_points),
      benefits: JSON.parse(tier.benefits_json || "[]")
    }))
  };
}

export async function getReferralSummary(env, userId) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const code = await ensureReferralCode(env, id);
  const [counts, commissions, claim] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM referral_claims WHERE referrer_user_id = ?").bind(id).first(),
    env.DB.prepare(
      "SELECT status,COUNT(*) AS total,COALESCE(SUM(amount),0) AS amount FROM referral_commissions WHERE referrer_user_id = ? GROUP BY status"
    ).bind(id).all(),
    env.DB.prepare(
      "SELECT u.id,u.name FROM users u WHERE u.id = (SELECT referred_by FROM users WHERE id = ?)"
    ).bind(id).first()
  ]);
  return {
    code,
    inviteUrl: /^[A-Za-z0-9_]{5,32}$/.test(String(env.BOT_USERNAME || "").replace(/^@/, "").trim())
      ? "https://t.me/" + String(env.BOT_USERNAME).replace(/^@/, "").trim() + "?start=ref_" + encodeURIComponent(code)
      : "",
    invited: Number(counts?.total || 0),
    referredBy: claim ? { id: claim.id, name: claim.name } : null,
    commissions: (commissions.results || []).map(row => ({
      status: row.status,
      total: Number(row.total || 0),
      amount: Number(row.amount || 0)
    })),
    commissionAvailable: Number(env.REFERRAL_COMMISSION_BPS || 0) > 0,
    commissionRateBps: Number(env.REFERRAL_COMMISSION_BPS || 0),
    commissionNote: Number(env.REFERRAL_COMMISSION_BPS || 0) > 0
      ? "Hoa hồng phát sinh ở trạng thái chờ khi đơn của người được giới thiệu đã hoàn tất và thanh toán; Admin đối soát rồi mới chi trả."
      : "Chương trình hoa hồng đang tạm tắt. Quản trị viên cần cấu hình REFERRAL_COMMISSION_BPS trước khi bắt đầu tính hoa hồng."
  };
}

export async function claimReferral(env, userId, input) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const code = safeText(input?.code, 32).toUpperCase();
  if (!/^[A-Z0-9]{4,32}$/.test(code)) fail("Mã giới thiệu không hợp lệ.");
  const referrer = await env.DB.prepare("SELECT id FROM users WHERE referral_code = ?").bind(code).first();
  if (!referrer) fail("Không tìm thấy mã giới thiệu.", 404);
  if (String(referrer.id) === id) fail("Không thể tự sử dụng mã giới thiệu của chính mình.");
  const prior = await env.DB.prepare("SELECT referrer_user_id FROM referral_claims WHERE referred_user_id = ?").bind(id).first();
  if (prior) {
    if (String(prior.referrer_user_id) === String(referrer.id)) return { success: true, duplicate: true };
    fail("Tài khoản đã sử dụng mã giới thiệu khác.", 409);
  }

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL"
    ).bind(String(referrer.id), id),
    env.DB.prepare(
      `INSERT INTO referral_claims(id,referrer_user_id,referred_user_id,referral_code)
       SELECT ?, ?, ?, ? FROM users
        WHERE id = ? AND referred_by = ?
       ON CONFLICT(referred_user_id) DO NOTHING`
    ).bind(randomId(), String(referrer.id), id, code, id, String(referrer.id))
  ]);
  const saved = await env.DB.prepare("SELECT referrer_user_id FROM referral_claims WHERE referred_user_id = ?").bind(id).first();
  if (!saved) fail("Không thể ghi nhận mã giới thiệu. Có thể tài khoản đã được giới thiệu trước đó.", 409);
  if (String(saved.referrer_user_id) !== String(referrer.id)) fail("Tài khoản đã sử dụng mã giới thiệu khác.", 409);
  return { success: true, duplicate: false };
}

export async function createGiftcode(env, actor, input) {
  const reward = Number(input?.rewardVoucher);
  const maxRedemptions = Number(input?.maxRedemptions);
  if (!Number.isSafeInteger(reward) || reward < 1 || reward > 100000000) fail("Điểm thưởng Giftcode không hợp lệ.");
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 100000) fail("Giới hạn lượt sử dụng không hợp lệ.");
  const expiresAt = input?.expiresAt ? String(input.expiresAt) : null;
  if (expiresAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z?$/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt)))) {
    fail("Thời hạn Giftcode không hợp lệ.");
  }
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(12));
  const segment = Array.from(random, (byte) => chars[byte % chars.length]).join("");
  const code = "HENDY-" + segment.slice(0, 4) + "-" + segment.slice(4, 8) + "-" + segment.slice(8, 12);
  const codeHash = await sha256(code);
  const id = randomId();
  await env.DB.prepare(
    "INSERT INTO giftcodes(id,code_hash,reward_voucher,max_redemptions,expires_at,created_by) VALUES(?,?,?,?,?,?)"
  ).bind(id,codeHash,reward,maxRedemptions,expiresAt,safeText(actor?.id || "admin",80)).run();
  return { id, code, rewardVoucher: reward, maxRedemptions, expiresAt };
}

export async function redeemGiftcode(env, userId, input, idempotencyValue) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const key = normalizeIdempotency(idempotencyValue);
  const code = String(input?.code || "").trim().toUpperCase();
  if (!/^HENDY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) fail("Giftcode không đúng định dạng.");
  const codeHash = await sha256(code);
  const previous = await env.DB.prepare(
    "SELECT code_hash,reward_voucher FROM giftcode_redemptions WHERE user_id = ? AND idempotency_key = ?"
  ).bind(id,key).first();
  if (previous) {
    if (previous.code_hash !== codeHash) fail("Idempotency-Key đã được dùng cho Giftcode khác.", 409);
    return { success: true, duplicate: true, rewardVoucher: Number(previous.reward_voucher) };
  }

  const redId = randomId();
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO giftcode_redemptions(id,giftcode_id,user_id,code_hash,reward_voucher,idempotency_key)
       SELECT ?,g.id,?,g.code_hash,g.reward_voucher,?
         FROM giftcodes g
        WHERE g.code_hash = ? AND g.is_active = 1
          AND (g.starts_at IS NULL OR g.starts_at <= CURRENT_TIMESTAMP)
          AND (g.expires_at IS NULL OR g.expires_at > CURRENT_TIMESTAMP)
          AND g.redeemed_count < g.max_redemptions
          AND NOT EXISTS (SELECT 1 FROM giftcode_redemptions r WHERE r.giftcode_id = g.id AND r.user_id = ?)
       ON CONFLICT DO NOTHING`
    ).bind(redId,id,key,codeHash,id),
    env.DB.prepare(
      `UPDATE giftcodes SET redeemed_count = redeemed_count + 1
        WHERE id = (SELECT giftcode_id FROM giftcode_redemptions WHERE user_id = ? AND idempotency_key = ? AND code_hash = ?)
          AND changes() = 1`
    ).bind(id,key,codeHash),
    env.DB.prepare(
      `UPDATE users SET voucher = voucher + (
          SELECT reward_voucher FROM giftcode_redemptions WHERE user_id = ? AND idempotency_key = ? AND code_hash = ?
        )
        WHERE id = ? AND changes() = 1`
    ).bind(id,key,codeHash,id)
  ]);

  const saved = await env.DB.prepare(
    "SELECT code_hash,reward_voucher FROM giftcode_redemptions WHERE user_id = ? AND idempotency_key = ?"
  ).bind(id,key).first();
  if (!saved) {
    const alreadyUsed = await env.DB.prepare(
      "SELECT 1 FROM giftcode_redemptions r JOIN giftcodes g ON g.id = r.giftcode_id WHERE r.user_id = ? AND g.code_hash = ?"
    ).bind(id,codeHash).first();
    if (alreadyUsed) fail("Bạn đã sử dụng Giftcode này.");
    fail("Giftcode không tồn tại, đã hết lượt hoặc đã hết hạn.", 409);
  }
  return { success: true, duplicate: Number(results?.[0]?.meta?.changes || 0) === 0, rewardVoucher: Number(saved.reward_voucher) };
}

function normalizeTicket(input) {
  const category = safeText(input?.category || "other", 32).toLowerCase();
  const subject = safeText(input?.subject, 120);
  const message = String(input?.message || "").trim();
  if (!/^[a-z0-9_-]+$/.test(category) || subject.length < 4 || message.length < 5 || message.length > 3000) {
    fail("Thông tin yêu cầu hỗ trợ không hợp lệ.");
  }
  return { category, subject, message: safeText(message, 3000) };
}

export async function createSupportTicket(env, userId, input, idemValue) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const key = normalizeIdempotency(idemValue);
  const normalized = normalizeTicket(input);
  const requestHash = await sha256(JSON.stringify(normalized));
  const existing = await env.DB.prepare("SELECT * FROM support_tickets WHERE user_id = ? AND idempotency_key = ?").bind(id,key).first();
  if (existing) {
    if (existing.request_hash !== requestHash) fail("Idempotency-Key đã được dùng cho ticket khác.", 409);
    return { ticket: await getSupportTicket(env, existing.id, id), duplicate: true };
  }
  const ticketId = randomId();
  const ticketNumber = "HD-S" + Date.now().toString(36).toUpperCase();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO support_tickets(id,ticket_number,user_id,category,subject,idempotency_key,request_hash) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,idempotency_key) DO NOTHING"
    ).bind(ticketId,ticketNumber,id,normalized.category,normalized.subject,key,requestHash),
    env.DB.prepare(
      `INSERT INTO support_messages(id,ticket_id,sender_type,sender_id,message,idempotency_key)
       SELECT ?,id,'user',?,?,? FROM support_tickets WHERE user_id = ? AND idempotency_key = ? AND request_hash = ?
       ON CONFLICT(ticket_id,idempotency_key) DO NOTHING`
    ).bind(randomId(),id,normalized.message,"first:"+key,id,key,requestHash)
  ]);
  const saved = await env.DB.prepare("SELECT * FROM support_tickets WHERE user_id = ? AND idempotency_key = ?").bind(id,key).first();
  if (!saved || saved.request_hash !== requestHash) fail("Không thể tạo ticket hỗ trợ.");
  return { ticket: await getSupportTicket(env, saved.id, id), duplicate: saved.id !== ticketId };
}

export async function listSupportTickets(env, userId = null, status = "all") {
  const conditions = [];
  const values = [];
  if (userId) {
    const id = parseTelegramId(userId);
    if (!id) fail("Telegram user ID không hợp lệ.");
    conditions.push("t.user_id = ?");
    values.push(id);
  }
  if (status && status !== "all") {
    if (!["open","in_progress","awaiting_user","resolved","closed"].includes(status)) fail("Trạng thái ticket không hợp lệ.");
    conditions.push("t.status = ?");
    values.push(status);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const result = await env.DB.prepare(
    `SELECT t.id,t.ticket_number,t.user_id,t.category,t.subject,t.status,t.created_at,t.updated_at,u.name AS customer_name,
      (SELECT substr(m.message,1,180) FROM support_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
     FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id ${where}
     ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'awaiting_user' THEN 2 ELSE 3 END,t.updated_at DESC LIMIT 100`
  ).bind(...values).all();
  return result.results || [];
}

export async function getSupportTicket(env, ticketId, userId = null) {
  const id = userId ? parseTelegramId(userId) : null;
  const row = userId
    ? await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(ticketId,id).first()
    : await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(ticketId).first();
  if (!row) return null;
  const messages = await env.DB.prepare(
    "SELECT id,sender_type,sender_id,message,created_at FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC"
  ).bind(ticketId).all();
  return { ticket: row, messages: messages.results || [] };
}

export async function addSupportMessage(env, ticketId, sender, messageValue, idemValue, customerId = null) {
  const key = normalizeIdempotency(idemValue);
  const message = String(messageValue || "").trim();
  if (message.length < 1 || message.length > 3000) fail("Tin nhắn phải từ 1 đến 3000 ký tự.");
  const ticket = customerId
    ? await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(ticketId,customerId).first()
    : await env.DB.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(ticketId).first();
  if (!ticket) fail("Không tìm thấy ticket hỗ trợ.", 404);
  if (["resolved","closed"].includes(ticket.status)) fail("Ticket đã đóng hoặc giải quyết xong.", 409);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO support_messages(id,ticket_id,sender_type,sender_id,message,idempotency_key)
       VALUES(?,?,?,?,?,?) ON CONFLICT(ticket_id,idempotency_key) DO NOTHING`
    ).bind(randomId(),ticketId,sender.type,String(sender.id),safeText(message,3000),key),
    env.DB.prepare(
      `UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND changes() = 1`
    ).bind(sender.type === "admin" ? "awaiting_user" : "open",ticketId)
  ]);
  return getSupportTicket(env,ticketId,customerId);
}



export async function listAdminGiftcodes(env) {
  const result = await env.DB.prepare(
    `SELECT g.id,g.reward_voucher,g.max_redemptions,g.redeemed_count,g.starts_at,g.expires_at,
        g.is_active,g.created_by,g.created_at,
        (SELECT COUNT(*) FROM giftcode_redemptions r WHERE r.giftcode_id=g.id) AS actual_redemptions
       FROM giftcodes g ORDER BY g.created_at DESC LIMIT 200`
  ).all();
  return (result.results || []).map(row => ({
    id: row.id,
    rewardVoucher: Number(row.reward_voucher),
    maxRedemptions: Number(row.max_redemptions),
    redeemedCount: Number(row.redeemed_count),
    actualRedemptions: Number(row.actual_redemptions),
    startsAt: row.starts_at || null,
    expiresAt: row.expires_at || null,
    isActive: Number(row.is_active) === 1,
    createdBy: row.created_by,
    createdAt: row.created_at
  }));
}

export async function setGiftcodeActive(env, giftcodeId, active) {
  if (!/^[0-9a-f-]{36}$/i.test(String(giftcodeId || ""))) fail("Mã Giftcode không hợp lệ.");
  const value = active ? 1 : 0;
  const result = await env.DB.prepare(
    "UPDATE giftcodes SET is_active=? WHERE id=?"
  ).bind(value,giftcodeId).run();
  if (!result.meta?.changes) {
    const existing = await env.DB.prepare("SELECT is_active FROM giftcodes WHERE id=?").bind(giftcodeId).first();
    if (!existing) fail("Không tìm thấy Giftcode.",404);
    if (Number(existing.is_active) === value) return { success:true,duplicate:true,isActive:Boolean(value) };
  }
  return { success:true,duplicate:false,isActive:Boolean(value) };
}

export async function listAdminReferralCommissions(env, status = "all") {
  const selected = String(status || "all");
  if (selected !== "all" && !["pending","approved","paid","void"].includes(selected)) {
    fail("Trạng thái hoa hồng không hợp lệ.");
  }
  const result = selected === "all"
    ? await env.DB.prepare(
      `SELECT c.*,r.name AS referrer_name,u.name AS referred_name,o.order_number
         FROM referral_commissions c
         LEFT JOIN users r ON r.id=c.referrer_user_id
         LEFT JOIN users u ON u.id=c.referred_user_id
         LEFT JOIN orders o ON o.id=c.order_id
        ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
          c.created_at DESC LIMIT 200`
    ).all()
    : await env.DB.prepare(
      `SELECT c.*,r.name AS referrer_name,u.name AS referred_name,o.order_number
         FROM referral_commissions c
         LEFT JOIN users r ON r.id=c.referrer_user_id
         LEFT JOIN users u ON u.id=c.referred_user_id
         LEFT JOIN orders o ON o.id=c.order_id
        WHERE c.status=? ORDER BY c.created_at DESC LIMIT 200`
    ).bind(selected).all();
  return (result.results || []).map(row => ({
    id: row.id,
    referrerUserId: row.referrer_user_id,
    referrerName: row.referrer_name || "Người giới thiệu",
    referredUserId: row.referred_user_id,
    referredName: row.referred_name || "Thành viên",
    orderNumber: row.order_number || "",
    amount: Number(row.amount),
    currency: row.currency || "VND",
    status: row.status,
    reviewedBy: row.reviewed_by || null,
    paidBy: row.paid_by || null,
    adminNote: row.admin_note || "",
    createdAt: row.created_at
  }));
}

export async function settleReferralCommission(env, commissionId, admin, input) {
  if (!/^[0-9a-f-]{36}$/i.test(String(commissionId || ""))) fail("Mã hoa hồng không hợp lệ.");
  const action = String(input?.action || "");
  if (!["approve","pay","void"].includes(action)) fail("Thao tác hoa hồng không hợp lệ.");
  const note = safeText(input?.note || "", 300);
  const current = await env.DB.prepare(
    "SELECT id,status,referrer_user_id,amount FROM referral_commissions WHERE id=?"
  ).bind(commissionId).first();
  if (!current) fail("Không tìm thấy khoản hoa hồng.",404);

  const actor = safeText(admin?.id || "admin",80);
  if (action === "approve") {
    if (current.status === "approved") return { success:true,duplicate:true,status:"approved" };
    if (current.status !== "pending") fail("Chỉ hoa hồng đang chờ mới được duyệt.",409);
    await env.DB.prepare(
      "UPDATE referral_commissions SET status='approved',reviewed_by=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'"
    ).bind(actor,note,commissionId).run();
  } else if (action === "void") {
    if (current.status === "void") return { success:true,duplicate:true,status:"void" };
    if (!["pending","approved"].includes(current.status)) fail("Không thể hủy hoa hồng đã chi trả.",409);
    await env.DB.prepare(
      "UPDATE referral_commissions SET status='void',reviewed_by=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','approved')"
    ).bind(actor,note,commissionId).run();
  } else {
    if (current.status === "paid") return { success:true,duplicate:true,status:"paid" };
    if (current.status !== "approved") fail("Phải duyệt hoa hồng trước khi chi trả.",409);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE referral_commissions SET status='paid',paid_by=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'"
      ).bind(actor,note,commissionId),
      env.DB.prepare(
        `UPDATE users SET balance=balance+(SELECT amount FROM referral_commissions WHERE id=? AND status='paid')
          WHERE id=(SELECT referrer_user_id FROM referral_commissions WHERE id=? AND status='paid')
            AND changes()=1`
      ).bind(commissionId,commissionId),
      env.DB.prepare(
        `INSERT INTO wallet_ledger(id,user_id,source_type,source_id,amount,balance_after,idempotency_key)
         SELECT ?,c.referrer_user_id,'referral_commission',c.id,c.amount,u.balance,?
           FROM referral_commissions c JOIN users u ON u.id=c.referrer_user_id
          WHERE c.id=? AND c.status='paid' AND changes()=1
         ON CONFLICT(user_id,idempotency_key) DO NOTHING`
      ).bind(randomId(), "referral-commission:"+commissionId, commissionId)
    ]);
  }

  const saved = await env.DB.prepare("SELECT status FROM referral_commissions WHERE id=?").bind(commissionId).first();
  const expected = action === "approve" ? "approved" : action === "pay" ? "paid" : "void";
  if (saved?.status !== expected) fail("Khoản hoa hồng đã được xử lý bởi thao tác khác.",409);
  return { success:true,duplicate:false,status:expected,note };
}

export async function updateSupportTicketStatus(env, ticketId, statusValue) {
  if (!/^[0-9a-f-]{36}$/i.test(String(ticketId || ""))) fail("Mã ticket không hợp lệ.");
  const status = String(statusValue || "");
  if (!["in_progress","awaiting_user","resolved","closed","open"].includes(status)) {
    fail("Trạng thái hỗ trợ không hợp lệ.");
  }
  const result = await env.DB.prepare(
    "UPDATE support_tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('resolved','closed')"
  ).bind(status,ticketId).run();
  if (!result.meta?.changes) {
    const existing = await env.DB.prepare("SELECT status FROM support_tickets WHERE id=?").bind(ticketId).first();
    if (!existing) fail("Không tìm thấy ticket hỗ trợ.",404);
    if (existing.status === status) return { success:true,duplicate:true,status };
    fail("Ticket đã đóng hoặc được xử lý bởi thao tác khác.",409);
  }
  return { success:true,duplicate:false,status };
}
