const REDACT_KEYS = /token|secret|password|authorization|initdata|api_key/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    REDACT_KEYS.test(key) ? "[REDACTED]" : redact(item)
  ]));
}

export const logger = {
  info(message, data = {}) {
    console.log(JSON.stringify({ level: "info", message, data: redact(data), at: new Date().toISOString() }));
  },
  warn(message, data = {}) {
    console.warn(JSON.stringify({ level: "warn", message, data: redact(data), at: new Date().toISOString() }));
  },
  error(message, error, data = {}) {
    console.error(JSON.stringify({
      level: "error",
      message,
      error: error instanceof Error ? error.message : String(error || ""),
      data: redact(data),
      at: new Date().toISOString()
    }));
  }
};