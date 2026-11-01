export function telegramFetch(resource, options = {}) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const headers = new Headers(options.headers || {});
  if (initData) headers.set("Authorization", "tma " + initData);
  return fetch(resource, { ...options, headers, credentials: "same-origin" });
}
