require('dotenv').config();
const express = require('express');
const bot = require('./controllers/botController');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_DOMAIN = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_DOMAIN;
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN;

app.use(express.json());

// API gốc để Render ping Health check
app.get('/', (req, res) => {
  res.send("🤖 Bot Hendy MVC đang chạy trên Render!");
});

// Tích hợp Telegraf Webhook
if (WEBHOOK_DOMAIN) {
  // Tạo đường dẫn bí mật để gắn webhook
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  
  // Express lắng nghe request webhook từ Telegram
  app.use(bot.webhookCallback(secretPath));
  
  // Gọi Telegram API để set URL webhook
  const webhookUrl = `${WEBHOOK_DOMAIN}${secretPath}`;
  bot.telegram.setWebhook(webhookUrl, {
    secret_token: WEBHOOK_SECRET_TOKEN // Tăng cường bảo mật
  })
    .then(() => console.log(`✅ Webhook set successfully at ${WEBHOOK_DOMAIN}`))
    .catch((err) => console.error('❌ Failed to set webhook:', err));
} else {
  // Chạy Long Polling nếu test nội bộ (không có domain)
  bot.launch().then(() => console.log('✅ Bot running in Long Polling mode'));
}

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy trên cổng ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
