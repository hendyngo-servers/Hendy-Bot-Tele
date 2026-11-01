export function envValidator(env) {
  const missing = [];
  if (!env.DB) missing.push("D1 binding DB");
  if (!env.STORAGE) missing.push("R2 binding STORAGE");
  if (missing.length) throw new Error("Thiếu Cloudflare binding: " + missing.join(", "));
}

export function getAllowedOrigins(env) {
  const defaults = [
    "https://hendy-web-user.pages.dev",
    "https://hendy-web-admin.pages.dev",
    "http://localhost:5173",
    "http://localhost:5174"
  ];
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  return new Set(defaults.concat(configured));
}

export function getRequiredSecret(env, key) {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Thiếu secret " + key + ". Hãy cấu hình bằng wrangler secret put.");
  }
  return value.trim();
}