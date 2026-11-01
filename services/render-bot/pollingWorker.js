/**
 * Continuous Long Polling Worker for Render
 * Runs non-stop background polling loop to process Telegram updates
 */

export class TelegramPollingWorker {
  constructor({ botToken, bridge, onUpdate, logger = console }) {
    this.botToken = botToken;
    this.bridge = bridge;
    this.onUpdate = onUpdate;
    this.logger = logger;
    this.isRunning = false;
    this.offset = 0;
    this.pollTimeoutSeconds = 30;
    this.errorBackoffMs = 1000;
  }

  /**
   * Call Telegram Bot API
   */
  async callTelegram(method, payload = {}) {
    if (!this.botToken) {
      throw new Error("BOT_TOKEN is not configured.");
    }
    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram API [${method}] error: ${result.description} (${result.error_code})`);
    }
    return result.result;
  }

  /**
   * Ensure webhooks are cleared before long polling begins
   */
  async prepareForPolling() {
    this.logger.log("🔍 Checking Telegram webhook status...");
    try {
      const webhookInfo = await this.callTelegram("getWebhookInfo");
      if (webhookInfo?.url) {
        this.logger.log(`⚠️ Active webhook detected: ${webhookInfo.url}. Deleting webhook to enable Long Polling...`);
        await this.callTelegram("deleteWebhook", { drop_pending_updates: false });
        this.logger.log("✅ Webhook cleared. Long Polling ready.");
      } else {
        this.logger.log("✅ No webhook active. Ready for Long Polling.");
      }
    } catch (err) {
      this.logger.warn("Notice checking webhook info:", err.message);
    }
  }

  /**
   * Start the continuous long polling loop
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.log("🚀 Render Long Polling Worker started. Listening for Telegram updates...");

    await this.prepareForPolling();

    while (this.isRunning) {
      try {
        const updates = await this.callTelegram("getUpdates", {
          offset: this.offset,
          timeout: this.pollTimeoutSeconds,
          allowed_updates: ["message", "callback_query"]
        });

        if (Array.isArray(updates) && updates.length > 0) {
          for (const update of updates) {
            if (!this.isRunning) break;
            try {
              if (this.onUpdate) {
                await this.onUpdate(update, this.bridge, this);
              }
            } catch (handleError) {
              this.logger.error(`Error processing update ${update.update_id}:`, handleError);
            }
            this.offset = update.update_id + 1;
          }
        }

        // Reset error backoff on successful loop
        this.errorBackoffMs = 1000;
      } catch (err) {
        if (!this.isRunning) break;
        this.logger.error(`Polling error: ${err.message}. Retrying in ${this.errorBackoffMs}ms...`);
        await new Promise((r) => setTimeout(r, this.errorBackoffMs));
        this.errorBackoffMs = Math.min(this.errorBackoffMs * 2, 30000); // Max 30s backoff
      }
    }

    this.logger.log("🛑 Render Long Polling Worker stopped.");
  }

  /**
   * Graceful stop
   */
  stop() {
    this.logger.log("Initiating graceful shutdown of Long Polling Worker...");
    this.isRunning = false;
  }
}
