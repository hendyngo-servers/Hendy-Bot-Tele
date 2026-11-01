const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export async function adminApi(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  const initData = token || window.Telegram?.WebApp?.initData || "";
  if (initData) headers.set("Authorization", initData.startsWith("tma ") ? initData : "tma " + initData);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(API_BASE + path, { ...options, headers, credentials: "same-origin" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "API error " + response.status);
  return result;
}
