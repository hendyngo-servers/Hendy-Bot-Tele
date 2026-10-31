const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'wss://hendy-server-pro-production.up.railway.app';
let wsClient = null;
let currentChannel = 'KENH-1';
let botInstance = null;

const sendLogToWeb = (msg) => {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify({ action: 'RES_TELEGRAM_LOG', message: msg, channel: currentChannel }));
  }
  console.log(`[BOT LOG] ${msg}`);
};

const syncTeleAccount = (value) => {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify({ action: 'SYNC_TELE_ACCOUNT', value, channel: currentChannel }));
  }
};

const sendStatus = (status) => {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify({ action: 'RES_TELEGRAM_STATUS', status, channel: currentChannel }));
  }
};

const initWebSocket = (botController) => {
  botInstance = botController;
  connectWS();
};

const connectWS = () => {
  wsClient = new WebSocket(WS_URL);

  wsClient.on('open', () => {
    console.log('⚡ Node Bot đã kết nối với WebSocket Trạm Mẹ thành công!');
    sendStatus(botInstance.isRunning() ? 'RUNNING' : 'STOPPED');
  });

  wsClient.on('message', async (dataStr) => {
    try {
      const data = JSON.parse(dataStr);
      if (data.channel && data.channel !== currentChannel && !data.action.startsWith('CMD_')) return;

      if (data.action === 'CMD_START_TELEGRAM') {
        if (data.channel) currentChannel = data.channel;
        const isSuccess = await botInstance.startBot(data.token, data.adminId);
        if (isSuccess) sendLogToWeb('✅ Đã bật Bot Telegram từ xa thành công!');
      } 
      else if (data.action === 'CMD_STOP_TELEGRAM') {
        botInstance.stopBot();
        sendLogToWeb('🛑 Đã TẮT Bot Telegram từ xa!');
        sendStatus('STOPPED');
      } 
      else if (data.action === 'CMD_TELEGRAM_BROADCAST') {
        botInstance.broadcastToAdmin(data.message);
        sendLogToWeb('📢 Đã gửi loa thành công tới Admin!');
      }
    } catch (err) {
      console.error("❌ Lỗi parse dữ liệu WebSocket:", err);
    }
  });

  wsClient.on('close', () => {
    console.log("🔌 WebSocket ngắt kết nối. Thử lại sau 5s...");
    setTimeout(connectWS, 5000);
  });
  
  wsClient.on('error', (err) => console.warn(`⚠️ WebSocket Error: ${err.message}`));
};

module.exports = { initWebSocket, sendLogToWeb, syncTeleAccount, sendStatus };
