require('dotenv').config();
const express = require('express');
const bot = require('./controllers/botController');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;

app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Telegram Webhook or Long Polling Config
if (WEBHOOK_DOMAIN) {
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;
  app.use(bot.webhookCallback(secretPath));
  
  bot.telegram.setWebhook(`${WEBHOOK_DOMAIN}${secretPath}`)
    .then(() => console.log(`Webhook set successfully at ${WEBHOOK_DOMAIN}`))
    .catch((err) => console.error('Failed to set webhook:', err));
} else {
  bot.launch()
    .then(() => console.log('Telegram bot running in Long Polling mode 🚀'))
    .catch((err) => console.error('Error launching bot:', err));
}

// Error Handling Middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
