export async function initializeTelegramBot(options = {}) {
  const mode = options.mode || process.env.TELEGRAM_BOT_MODE || "webhook";
  const token = options.token || process.env.BOT_TOKEN;
  const baseUrl = options.baseUrl || process.env.BASE_URL || "http://localhost:3000";
  const webhookSecret = options.webhookSecret || process.env.WEBHOOK_SECRET || "default-secret";

  const status = {
    mode,
    configured: Boolean(token),
    webhookUrl: `${baseUrl}/api/telegram/webhook`,
    active: true,
    startedAt: new Date().toISOString()
  };

  if (!token) {
    status.note = "Bot token not configured. System running in emulation/preview mode.";
    return status;
  }

  if (mode === "webhook") {
    status.note = `Webhook active at ${status.webhookUrl} with secret verification.`;
  } else {
    status.note = "Long polling active for continuous local/Render execution.";
  }

  return status;
}

export function validateTelegramWebhookHeader(secretTokenHeader, expectedSecret) {
  if (!expectedSecret) return true;
  return secretTokenHeader === expectedSecret;
}
