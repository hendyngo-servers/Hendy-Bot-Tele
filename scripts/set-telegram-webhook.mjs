import process from "node:process";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.TELEGRAM_WEBHOOK_URL;
if (!token || !secret || !url) {
  console.error("Thiếu TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET hoặc TELEGRAM_WEBHOOK_URL.");
  process.exit(1);
}
if (!/^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(url)) {
  console.error("Webhook URL phải là HTTPS hợp lệ.");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
  console.error("Webhook secret phải có 32-256 ký tự A-Z, a-z, 0-9, _ hoặc -.");
  process.exit(1);
}
const response = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    max_connections: 20,
    drop_pending_updates: false
  })
});
const result = await response.json();
if (!response.ok || !result.ok) {
  console.error("Không thiết lập được webhook:", result.description || response.status);
  process.exit(1);
}
console.log("Telegram webhook đã được thiết lập:", url);
