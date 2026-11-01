import crypto from "crypto";

export function verifyTelegramWebAppData(initData, botToken) {
  if (!initData || typeof initData !== "string") {
    return { valid: false, error: "Missing or invalid initData string" };
  }
  if (!botToken || typeof botToken !== "string") {
    return { valid: false, error: "Missing botToken" };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      return { valid: false, error: "Missing hash parameter in initData" };
    }

    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(hash, "hex")
    );

    if (!isValid) {
      return { valid: false, error: "Signature mismatch" };
    }

    let user = null;
    const userJson = params.get("user");
    if (userJson) {
      user = JSON.parse(userJson);
    }

    const authDate = parseInt(params.get("auth_date") || "0", 10);

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

export function generateTelegramInitDataMock(user, botToken, extra = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAHdF6IQAAAAAN0XohD9_85k",
    user: JSON.stringify(user),
    ...extra
  });

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  params.set("hash", hash);
  return params.toString();
}
