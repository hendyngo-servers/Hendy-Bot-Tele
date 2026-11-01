const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export async function api(path, options = {}, initData = "") {
  const base = API_BASE || "";
  const headers = new Headers(options.headers || {});
  if (initData) headers.set("Authorization", "tma " + initData);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(API_BASE + path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Yêu cầu API thất bại (" + response.status + ").");
  return payload;
}

export function releaseDownloadUrl(id) {
  return API_BASE + "/api/v1/releases/" + encodeURIComponent(id) + "/download";
}