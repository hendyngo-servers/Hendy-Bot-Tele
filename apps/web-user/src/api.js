const API = import.meta.env.VITE_API_BASE_URL || "https://api.example.com";
export async function api(path, options = {}) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const headers = new Headers(options.headers || {});
  headers.set("X-Telegram-Init-Data", initData);
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(API + path, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.message || "Không thể xử lý yêu cầu.");
  return result.data;
}
export const formatVnd = value => new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " ₫";