const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export function telegramFetch(resource, options = {}) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const headers = new Headers(options.headers || {});
  if (initData) headers.set("Authorization", "tma " + initData);
  const url = resource.startsWith("http") ? resource : API_BASE + resource;
  return fetch(url, { ...options, headers, credentials: "omit" });
}
