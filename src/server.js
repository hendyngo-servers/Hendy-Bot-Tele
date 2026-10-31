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
const r2StorageService = require('./services/r2StorageService');
const { CloudflareD1Client } = require('./services/cloudflareD1Service');
const mongoService = require('./services/mongoService');
const apiRouter = require('./routes/api');
const errorHandler = require('./middlewares/errorHandler');

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    Boolean(process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
}

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_PATH = path.join(__dirname, '../public');

function validateProductionConfig() {
  if (!isProductionRuntime()) return;

  const required = [
    'BOT_TOKEN',
    'ADMIN_ID',
    'APP_ENCRYPTION_KEY',
    'MONGODB_URI',
    'R2_BUCKET_NAME',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY'
  ];
  const missing = required.filter(key => !String(process.env[key] || '').trim());
  if (!String(process.env.WEBAPP_URL || process.env.MINI_APP_URL || process.env.RENDER_EXTERNAL_URL || '').trim()) {
    missing.push('WEBAPP_URL');
  }
  if (missing.length) {
    throw new Error('Thiếu biến môi trường bắt buộc: ' + missing.join(', '));
  }
  const webAppUrl = String(process.env.WEBAPP_URL || process.env.MINI_APP_URL || process.env.RENDER_EXTERNAL_URL || '');
  if (!/^https:\/\//i.test(webAppUrl)) {
    throw new Error('WEBAPP_URL hoặc MINI_APP_URL phải là địa chỉ HTTPS hợp lệ.');
  }
  if (!mongoService.hasConfig()) {
    throw new Error('MongoDB Atlas chưa được cấu hình đầy đủ.');
  }
  r2StorageService.validateConfig();
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

app.use(express.json({ limit: '4mb' }));
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

app.get('/healthz', (_req, res) => {
  const botReady = botController.isRunning();
  res.status(botReady ? 200 : 503).json({
    success: botReady,
    service: 'hendy-bot-tele',
    bot: botReady,
    database: userService.isMongo() ? 'mongodb-atlas' : userService.isCloudflareD1() ? 'cloudflare-d1' : userService.isPostgres() ? 'postgres' : 'local-json',
    storage: r2StorageService.hasAnyConfig() ? 'cloudflare-r2' : 'unconfigured',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/mini', apiRouter);

if (fs.existsSync(PUBLIC_PATH)) {
  app.use(express.static(PUBLIC_PATH, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.status(503).send(
    'Mini App chưa được build vào thư mục public. Hãy chạy npm run build trước khi chạy production.'
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
    userService.closeDatabase().then(() => {
      r2StorageService.close();
      process.exit(0);
    }).catch(error => {
      console.error('Lỗi khi đóng database:', error.message);
      process.exit(1);
    });
    return;
  }

  server.close(error => {
    if (error) {
      console.error('Lỗi khi đóng HTTP server:', error.message);
      process.exit(1);
      return;
    }
    userService.closeDatabase().then(() => {
      r2StorageService.close();
      process.exit(0);
    }).catch(dbError => {
      console.error('Lỗi khi đóng database:', dbError.message);
      process.exit(1);
    });
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

async function start() {
  validateProductionConfig();
  await userService.loadDatabase();
  await appDataService.init();
  if (isProductionRuntime()) {
    if (!userService.isMongo()) throw new Error('MongoDB Atlas chưa sẵn sàng sau khi kết nối.');
    await r2StorageService.checkBucket();
    console.info('[R2] Bucket Cloudflare R2 đã sẵn sàng.');
  }

  const botStarted = await botController.startBot();
  if (isProductionRuntime() && !botStarted) {
    throw new Error('Telegram Bot không khởi chạy được. Kiểm tra BOT_TOKEN tại Render.');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log('Hendy Bot Web Service đang chạy tại cổng ' + PORT);
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
