import crypto from "node:crypto";

function safeHexEqual(expected, supplied) {
  if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const actual = Buffer.from(supplied, "hex");
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

export function verifyTelegramWebAppData(initData, botToken, options = {}) {
  if (!initData || typeof initData !== "string" || initData.length > 16384) {
    return { valid: false, error: "Missing or invalid initData string" };
  }
  if (!botToken || typeof botToken !== "string") {
    return { valid: false, error: "Missing botToken" };
  }

  try {
    const params = new URLSearchParams(initData);
    if (params.getAll("hash").length !== 1) {
      return { valid: false, error: "Missing or duplicated hash parameter" };
    }
    const hash = params.get("hash");
    params.delete("hash");

    const keys = [...params.keys()];
    if (new Set(keys).size !== keys.length) {
      return { valid: false, error: "Duplicated initData field" };
    }

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => key + "=" + value)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (!safeHexEqual(expectedHash, hash)) {
      return { valid: false, error: "Signature mismatch" };
    }

    const authDate = Number.parseInt(params.get("auth_date") || "0", 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = Number.isFinite(options.maxAgeSeconds) ? options.maxAgeSeconds : 86400;
    if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) {
      return { valid: false, error: "Telegram initData expired or has an invalid auth_date" };
    }

    let user = null;
    const userJson = params.get("user");
    if (userJson) {
      user = JSON.parse(userJson);
      if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) {
        return { valid: false, error: "Invalid Telegram user" };
      }
    }

    return {
      valid: true,
      user,
      authDate,
      queryId: params.get("query_id")
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Test helper only. Production code must use initData supplied by Telegram.
export function generateTelegramInitDataMock(user, botToken, extra = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "test_query",
    user: JSON.stringify(user),
    ...extra
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
