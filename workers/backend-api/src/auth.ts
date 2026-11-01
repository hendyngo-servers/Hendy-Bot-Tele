import type { BackendEnv } from "../../../packages/shared/src/cloudflare";

export interface TelegramUser {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  language_code?: string;
}

const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmac(key: CryptoKey, data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 3600
): Promise<TelegramUser | null> {
  if (!initData || initData.length > 8192 || !botToken) return null;
  const params = new URLSearchParams(initData);
  const suppliedHash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(suppliedHash)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > now + 30 || now - authDate > maxAgeSeconds) return null;

  params.delete("hash");
  const checkString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const secretKey = await crypto.subtle.importKey(
    "raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const secret = await hmac(secretKey, botToken);
  const dataKey = await crypto.subtle.importKey(
    "raw", toArrayBuffer(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const expected = toHex(await hmac(dataKey, checkString));
  if (!constantTimeEqual(expected.toLowerCase(), suppliedHash.toLowerCase())) return null;

  try {
    const parsed = JSON.parse(params.get("user") || "{}") as Record<string, unknown>;
    if (!parsed.id || !/^\d+$/.test(String(parsed.id))) return null;
    return {
      id: String(parsed.id),
      username: String(parsed.username || ""),
      first_name: String(parsed.first_name || ""),
      last_name: String(parsed.last_name || ""),
      language_code: parsed.language_code ? String(parsed.language_code) : undefined
    };
  } catch {
    return null;
  }
}

export async function getTelegramUser(request: Request, env: BackendEnv): Promise<TelegramUser | null> {
  const header = request.headers.get("X-Telegram-Init-Data") || "";
  const authorization = request.headers.get("Authorization") || "";
  const initData = header || (authorization.startsWith("tma ") ? authorization.slice(4) : "");
  return verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
}

export function isAdmin(userId: string, env: BackendEnv): boolean {
  return (env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .includes(userId);
}
