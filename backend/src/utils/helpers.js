export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

export function readJson(request) {
  return request.json().catch(() => {
    throw new Error("JSON không hợp lệ.");
  });
}

export function safeText(value, max = 120) {
  return String(value ?? "").trim().replace(/[<>]/g, "").slice(0, max);
}

export function randomId() {
  return crypto.randomUUID();
}

export function htmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function parseTelegramId(value) {
  const id = String(value ?? "");
  return /^[0-9]{1,22}$/.test(id) ? id : null;
}