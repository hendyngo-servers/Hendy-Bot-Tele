export async function rateLimitMiddleware(kv, ip, limit = 60, windowSeconds = 60) {
  if (!kv) return true;
  const key = "rate:" + String(ip || "unknown").slice(0, 80);
  const current = Number(await kv.get(key) || 0);
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
  return true;
}