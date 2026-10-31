require('dotenv').config();
const express = require('express');
const userService = require('./services/userService');
const backendService = require('./services/backendService');
const botController = require('./controllers/botController');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

app.use(express.json());

// API Healthcheck
app.get('/', (req, res) => {
  res.send("🤖 Hendy Cybertech Pro (Node.js Version) đang hoạt động ổn định!");
});

app.listen(PORT, async () => {
  console.log(`🚀 Web Server đang chạy trên cổng ${PORT}`);
  
  // 1. Tải Database cục bộ an toàn (Tự động tạo folder data)
  await userService.loadDatabase();
  
  // 2. Khởi chạy Bot bằng Token 
  if (BOT_TOKEN) {
    await botController.startBot(BOT_TOKEN, process.env.ADMIN_ID);
  }

  // 3. Khởi tạo kết nối WebSocket với Trạm Mẹ
  backendService.initWebSocket(botController);
  console.log('🤖 Module Hendy Cybertech Pro sẵn sàng...');
});

// Bắt tín hiệu tắt an toàn
process.once('SIGINT', () => botController.stopBot());
process.once('SIGTERM', () => botController.stopBot());
