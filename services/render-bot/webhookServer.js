import http from "node:http";

/**
 * High-Throughput Webhook Server for Render
 * Processes Telegram Webhooks with Secret Verification and Health Checking
 */
export class TelegramWebhookServer {
  constructor({ botToken, secretToken, port, bridge, onUpdate, logger = console }) {
    this.botToken = botToken;
    this.secretToken = secretToken || process.env.WEBHOOK_SECRET_TOKEN || "";
    this.port = Number(port || process.env.PORT || 10000);
    this.bridge = bridge;
    this.onUpdate = onUpdate;
    this.logger = logger;
    this.server = null;
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const method = req.method.toUpperCase();

      const sendJson = (data, status = 200) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(data));
      };

      // Render health check
      if (url.pathname === "/healthz" || url.pathname === "/") {
        return sendJson({
          ok: true,
          service: "hendy-render-telegram-bot",
          mode: "webhook",
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        });
      }

      // System status
      if (url.pathname === "/api/status") {
        const status = await this.bridge.getStatus();
        return sendJson(status);
      }

      // Telegram Webhook endpoint
      if (url.pathname === "/telegram/webhook" && method === "POST") {
        if (this.secretToken) {
          const supplied = req.headers["x-telegram-bot-api-secret-token"];
          if (supplied !== this.secretToken) {
            this.logger.warn("Unauthorized webhook request: secret token mismatch.");
            return sendJson({ error: "Unauthorized" }, 401);
          }
        }

        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
          try {
            const update = JSON.parse(body || "{}");
            if (this.onUpdate) {
              await this.onUpdate(update, this.bridge, this);
            }
            sendJson({ ok: true });
          } catch (err) {
            this.logger.error("Error handling webhook body:", err);
            sendJson({ error: err.message }, 400);
          }
        });
        return;
      }

      // Helper to register webhook with Telegram
      if (url.pathname === "/api/webhook/set" && method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
          try {
            const parsed = JSON.parse(body || "{}");
            const webhookUrl = parsed.url;
            if (!webhookUrl || !webhookUrl.startsWith("https://")) {
              return sendJson({ error: "A valid HTTPS URL is required." }, 400);
            }
            const tgRes = await fetch(`https://api.telegram.org/bot${this.botToken}/setWebhook`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: `${webhookUrl.replace(/\/+$/, "")}/telegram/webhook`,
                secret_token: this.secretToken || undefined,
                allowed_updates: ["message", "callback_query"]
              })
            });
            const tgData = await tgRes.json();
            return sendJson(tgData);
          } catch (err) {
            return sendJson({ error: err.message }, 500);
          }
        });
        return;
      }

      sendJson({ error: "Not Found" }, 404);
    });

    this.server.listen(this.port, "0.0.0.0", () => {
      this.logger.log(`🌐 Render Webhook Server listening on 0.0.0.0:${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.logger.log("Render Webhook Server shut down.");
    }
  }
}
