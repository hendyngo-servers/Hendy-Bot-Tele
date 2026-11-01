import { verifyTelegramWebAppData } from "../security/telegramAuth.js";
import { d1First } from "../services/productionD1.js";

function readInitData(req) {
  const authorization = String(req.headers.authorization || "");
  if (authorization.startsWith("tma ")) return authorization.slice(4).trim();
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  return String(req.headers["x-telegram-init-data"] || "").trim();
}

export async function requireTelegramAuth(req, res, next) {
  try {
    const token = process.env.BOT_TOKEN;
    if (!token) {
      return res.status(503).json({ error: "Xác thực Telegram chưa được cấu hình.", code: "AUTH_NOT_CONFIGURED" });
    }
    const initData = readInitData(req);
    const checked = verifyTelegramWebAppData(initData, token, {
      maxAgeSeconds: Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 86400)
    });
    if (!checked.valid || !checked.user?.id) {
      return res.status(401).json({ error: "Phiên Telegram không hợp lệ hoặc đã hết hạn.", code: "TELEGRAM_AUTH_REQUIRED" });
    }
    const userId = String(checked.user.id);
    const existing = await d1First("SELECT status FROM users WHERE telegram_id=?", [userId]);
    if (existing?.status === "blocked") {
      return res.status(403).json({ error: "Tài khoản đã bị khóa.", code: "USER_BLOCKED" });
    }
    req.telegramUser = checked.user;
    req.telegramAuthDate = checked.authDate;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  const configured = String(process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length === 0) {
    return res.status(503).json({ error: "Chưa cấu hình ADMIN_TELEGRAM_IDS.", code: "ADMIN_NOT_CONFIGURED" });
  }
  if (!req.telegramUser || !configured.includes(String(req.telegramUser.id))) {
    return res.status(403).json({ error: "Bạn không có quyền quản trị.", code: "ADMIN_FORBIDDEN" });
  }
  next();
}

export function isTelegramAdmin(telegramId) {
  const configured = String(process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(String(telegramId));
}
