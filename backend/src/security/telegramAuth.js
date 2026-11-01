import { constantTimeEqual, hmacSha256, toHex } from "./cryptoService.js";

const encoder = new TextEncoder();

export async function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 3600) {
  if (typeof initData !== "string" || !initData || initData.length > 8192 || !botToken) {
    throw new Error("Thiếu Telegram initData hoặc bot token.");
  }

  const params = new URLSearchParams(initData);
  const entries = Array.from(params.entries());
  const seen = new Set();
  for (const [key] of entries) {
    if (seen.has(key)) throw new Error("Telegram initData không hợp lệ.");
    seen.add(key);
  }

  const receivedHash = params.get("hash") || "";
  const authDateValue = params.get("auth_date") || "";
  if (!/^[a-f0-9]{64}$/i.test(receivedHash) || !/^\d{1,12}$/.test(authDateValue)) {
    throw new Error("Telegram initData không hợp lệ.");
  }

  const authDate = Number(authDateValue);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > maxAgeSeconds) {
    throw new Error("Phiên Telegram đã hết hạn. Hãy mở lại Mini App.");
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  // Telegram Web Apps: HMAC(key="WebAppData", message=botToken), then
  // HMAC(key=derived secret, message=data-check-string).
  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const calculatedHash = toHex(await hmacSha256(secretKey, dataCheckString));
  if (!constantTimeEqual(calculatedHash, receivedHash.toLowerCase())) {
    throw new Error("Không xác thực được phiên Telegram.");
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    throw new Error("Thông tin người dùng Telegram không hợp lệ.");
  }
  if (!user || !/^[0-9]{1,22}$/.test(String(user.id ?? ""))) {
    throw new Error("Không tìm thấy Telegram user ID hợp lệ.");
  }
  return { user, authDate };
}

export async function authenticateTelegramRequest(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("tma ") || authorization.length <= 4) {
    throw new Error("Cần mở ứng dụng từ Telegram để xác thực.");
  }
  const verified = await verifyTelegramInitData(authorization.slice(4), env.BOT_TOKEN);
  return verified.user;
}
