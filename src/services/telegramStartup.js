const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getHttpStatus(error) {
  const rawStatus = error?.response?.error_code ??
    error?.response?.status ??
    error?.status;
  const status = Number(rawStatus);
  return Number.isInteger(status) && status > 0 ? status : null;
}

function redactSecrets(value) {
  return String(value ?? '')
    .replace(/https?:\/\/api\.telegram\.org\/bot[^/\s"'`]+/gi, 'https://api.telegram.org/bot[REDACTED]')
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[BOT_TOKEN_REDACTED]');
}

function formatTelegramError(error) {
  const status = getHttpStatus(error);
  const cause = error?.cause || error?.originalError || {};
  const description = error?.response?.description || error?.description;

  if (status) {
    return 'Telegram API HTTP ' + status + ': ' +
      redactSecrets(description || error?.message || 'Không có mô tả lỗi.');
  }

  const message = cause?.message || error?.message || error?.name ||
    'Lỗi kết nối Telegram không xác định.';
  const code = error?.code || error?.errno || cause?.code || cause?.errno;
  return redactSecrets(message) + (code ? ' [' + code + ']' : '');
}

function isPermanentTelegramError(error) {
  // Những lỗi này không hết bằng cách thử lại: request sai, token/permission sai,
  // hoặc một tiến trình khác đang chiếm getUpdates.
  return [400, 401, 403, 404, 409].includes(getHttpStatus(error));
}

async function runWithTelegramRetry(operation, options = {}) {
  if (typeof operation !== 'function') {
    throw new TypeError('operation phải là một hàm.');
  }

  const attempts = options.attempts ?? 5;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const wait = options.wait ?? sleep;
  const onRetry = options.onRetry ?? (() => {});

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('attempts phải là số nguyên từ 1 trở lên.');
  }
  if (typeof wait !== 'function' || typeof onRetry !== 'function') {
    throw new TypeError('wait và onRetry phải là hàm.');
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || isPermanentTelegramError(error)) {
        throw error;
      }

      const exponentialDelay = Math.min(
        initialDelayMs * (2 ** (attempt - 1)),
        maxDelayMs
      );
      const retryAfterSeconds = Number(error?.response?.parameters?.retry_after || 0);
      const retryAfterMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(0, Math.min(retryAfterSeconds * 1000, 30000))
        : 0;
      const delayMs = Math.max(exponentialDelay, retryAfterMs);

      onRetry({ attempt, maxAttempts: attempts, delayMs, error });
      await wait(delayMs);
    }
  }

  throw new Error('Không thể kết nối Telegram sau số lần thử cho phép.');
}

module.exports = {
  runWithTelegramRetry,
  formatTelegramError
};
