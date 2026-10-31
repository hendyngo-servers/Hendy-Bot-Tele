require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const userService = require('./services/userService');
const appDataService = require('./services/appDataService');
const botController = require('./controllers/botController');
const apiRouter = require('./routes/api');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
const DIST_PATH = path.join(__dirname, '../mini-app/dist');

function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const required = ['BOT_TOKEN', 'ADMIN_ID', 'MINI_APP_URL', 'APP_ENCRYPTION_KEY'];
  const missing = required.filter(key => !String(process.env[key] || '').trim());
  if (missing.length) {
    throw new Error('Thiếu biến môi trường bắt buộc: ' + missing.join(', '));
  }
  if (!/^https:\/\//i.test(process.env.MINI_APP_URL)) {
    throw new Error('MINI_APP_URL phải là địa chỉ HTTPS hợp lệ.');
  }
  if (process.env.APP_ENCRYPTION_KEY.length < 32) {
    throw new Error('APP_ENCRYPTION_KEY phải có tối thiểu 32 ký tự.');
  }
  if (!/^\d+$/.test(process.env.ADMIN_ID)) {
    throw new Error('ADMIN_ID phải là Telegram user ID dạng số.');
  }
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://telegram.org'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.telegram.org'],
      frameAncestors: ["'self'", 'https://web.telegram.org', 'https://telegram.org']
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '32kb' }));
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

app.get('/healthz', (_req, res) => res.status(200).json({
  success: true,
  service: 'hendy-bot-tele',
  bot: botController.isRunning(),
  timestamp: new Date().toISOString()
}));

app.use('/api/mini', apiRouter);

if (fs.existsSync(DIST_PATH)) {
  app.use(express.static(DIST_PATH, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_PATH, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.status(503).send(
    'Mini App chưa được build. Hãy chạy npm run build trước khi chạy production.'
  ));
}

app.use((_req, res) => res.status(404).json({
  success: false,
  message: 'Không tìm thấy tài nguyên.'
}));
app.use(errorHandler);

let closing = false;

function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log('Nhận tín hiệu ' + signal + ', đang đóng HTTP server...');
  botController.stopBot();

  if (!server.listening) {
    process.exit(0);
    return;
  }

  server.close(error => {
    if (error) {
      console.error('Lỗi khi đóng HTTP server:', error.message);
      process.exit(1);
      return;
    }
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

async function start() {
  validateProductionConfig();
  await userService.loadDatabase();
  await appDataService.init();

  server.listen(PORT, '0.0.0.0', async () => {
    console.log('Hendy Bot Web Service đang chạy tại cổng ' + PORT);
    const botStarted = await botController.startBot();
    if (!botStarted) {
      console.error('Không thể khởi chạy Telegram Bot. Kiểm tra BOT_TOKEN và trạng thái BotFather.');
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', error => console.error('Unhandled promise rejection:', error));
process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

start().catch(error => {
  console.error('Không thể khởi động ứng dụng:', error.message);
  process.exit(1);
});
