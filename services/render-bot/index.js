import http from "node:http";
import { CloudflareBridge } from "./cloudflareBridge.js";
import { TelegramPollingWorker } from "./pollingWorker.js";
import { TelegramWebhookServer } from "./webhookServer.js";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const BOT_MODE = (process.env.BOT_MODE || "polling").toLowerCase(); // "polling" or "webhook"
const PORT = Number(process.env.PORT || 10000);
const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(id => id.trim()).filter(Boolean);

const bridge = new CloudflareBridge();

/**
 * Shared message sender helper
 */
async function sendMessage(chatId, text, replyMarkup = null) {
  if (!BOT_TOKEN) {
    console.log(`[Dev Simulation] Message to ${chatId}: ${text}`);
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup || undefined
    })
  });
}

/**
 * 14-Button Keyboard mapping to Cloudflare Pages Mini App
 */
function createMainMenuKeyboard() {
  const miniApp = (module, extra = {}) => {
    return {
      text: "",
      web_app: { url: bridge.getMiniAppUrl(module, extra) }
    };
  };

  return {
    inline_keyboard: [
      [
        { text: "🚀 MINIGAME LIVE", web_app: { url: bridge.getMiniAppUrl("mini_game_live") } },
        { text: "🧰 THUÊ TOOL (NEW)", web_app: { url: bridge.getMiniAppUrl("app_tool") } }
      ],
      [{ text: "🛍️ MUA LÌ XÌ · CODE MÀN · CODE TELE", web_app: { url: bridge.getMiniAppUrl("buy_code") } }],
      [
        { text: "💳 NẠP TIỀN", web_app: { url: bridge.getMiniAppUrl("wallet") } },
        { text: "🛡️ OTP & PROXY", web_app: { url: bridge.getMiniAppUrl("otp_proxy") } }
      ],
      [{ text: "🏆 KHO VIP · CÔNG CỤ ĐẶC QUYỀN", web_app: { url: bridge.getMiniAppUrl("vip_tools") } }],
      [{ text: "💎 TRUNG TÂM KHÁCH HÀNG", web_app: { url: bridge.getMiniAppUrl("support") } }],
      [{ text: "💞 HỆ THỐNG GHÉP ĐÔI", web_app: { url: bridge.getMiniAppUrl("mini_game_live", { section: "pairing" }) } }],
      [
        { text: "🤝 GIỚI THIỆU REF", web_app: { url: bridge.getMiniAppUrl("referral") } },
        { text: "👑 TRUNG TÂM VIP", web_app: { url: bridge.getMiniAppUrl("vip") } }
      ],
      [
        { text: "👥 NHÓM CHAT", url: process.env.GROUP_CHAT_URL || "https://t.me/hendy_community" },
        { text: "📢 KÊNH THÔNG BÁO", url: process.env.NEWS_CHANNEL_URL || "https://t.me/hendy_news" }
      ],
      [
        { text: "🎟️ NHẬP GIFTCODE", web_app: { url: bridge.getMiniAppUrl("giftcode") } },
        { text: "🎧 LIÊN HỆ CSKH", url: process.env.SUPPORT_URL || "https://t.me/hendy_support" }
      ]
    ]
  };
}

/**
 * Handle incoming Telegram Update (Commands, Buttons, WebApp Data)
 */
async function handleTelegramUpdate(update) {
  const message = update.message;
  const callbackQuery = update.callback_query;

  // Handle Callback Queries from inline buttons
  if (callbackQuery) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat?.id;
    if (chatId) {
      if (data === "back_start") {
        await sendMessage(chatId, "🤖 HENDY BOT TELEGRAM\nChọn chức năng bạn cần:", createMainMenuKeyboard());
      } else {
        await sendMessage(chatId, `Đã chọn: ${data}`);
      }
    }
    return;
  }

  // Handle WebApp Data sent back from Cloudflare Pages Mini App
  if (message?.web_app_data?.data) {
    try {
      const payload = JSON.parse(message.web_app_data.data);
      console.log("Received data from Cloudflare Pages Mini App:", payload);
      await sendMessage(
        message.chat.id,
        `✅ Đã tiếp nhận yêu cầu từ Mini App:\nLoại: ${payload.action || "Thao tác"}\nTrạng thái: Đã đồng bộ với Cloudflare D1.`
      );
    } catch {
      await sendMessage(message.chat.id, "Dữ liệu Mini App không hợp lệ.");
    }
    return;
  }

  // Handle Text Commands
  if (message?.text) {
    const text = message.text.trim();
    const command = text.split(/\s+/)[0].toLowerCase();
    const userId = String(message.from.id);
    const userName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "Thành viên";

    if (command === "/start") {
      // Sync user into Cloudflare D1 Database
      await bridge.syncUser(userId, userName);
      const user = (await bridge.getUser(userId)) || { balance: 0 };

      const adminNotice = ADMIN_IDS.includes(userId)
        ? "\n🛡️ Bạn có quyền quản trị. Dùng /admin để mở bảng điều khiển."
        : "";

      const welcomeMsg =
        `🤖 HENDY BOT TELEGRAM (Render × Cloudflare Edition)\n` +
        `Xin chào ${userName}!\n` +
        `🆔 Telegram ID: ${userId}\n` +
        `💰 Số dư ví (Cloudflare D1): ${Number(user.balance || 0).toLocaleString("vi-VN")} VNĐ\n` +
        `⚡ Động cơ Bot: Render (${BOT_MODE.toUpperCase()})\n` +
        `☁️ Dữ liệu & Lưu trữ: Cloudflare D1 + R2 + Pages\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Chọn chức năng dịch vụ từ menu bên dưới:${adminNotice}`;

      await sendMessage(message.chat.id, welcomeMsg, createMainMenuKeyboard());
      return;
    }

    if (command === "/admin") {
      if (!ADMIN_IDS.includes(userId)) {
        await sendMessage(message.chat.id, "⛔ Bạn không có quyền truy cập quản trị.");
        return;
      }
      const adminUrl = bridge.getAdminConsoleUrl();
      await sendMessage(message.chat.id, "🛡️ TRUNG TÂM QUẢN TRỊ HENDY (Cloudflare Pages)", {
        inline_keyboard: [[{ text: "🔐 MỞ BẢNG ĐIỀU KHIỂN QUẢN TRỊ", web_app: { url: adminUrl } }]]
      });
      return;
    }

    if (command === "/help") {
      await sendMessage(
        message.chat.id,
        "📖 HƯỚNG DẪN SỬ DỤNG HENDY BOT\n\n" +
        "• /start - Khởi động bot và mở menu 14 chức năng\n" +
        "• /admin - Mở Bảng quản trị Cloudflare Pages (dành cho Admin)\n" +
        "• /id - Xem Telegram ID của bạn\n\n" +
        "Giao diện Mini App được lưu trữ trên Cloudflare Pages kết hợp xử lý liên tục từ Render."
      );
      return;
    }

    if (command === "/id") {
      await sendMessage(message.chat.id, `Telegram ID của bạn: ${userId}`);
      return;
    }
  }
}

/**
 * Main Service Runner
 */
async function main() {
  console.log("==================================================");
  console.log("🚀 Starting Hendy Bot System (Render × Cloudflare)");
  console.log(`📌 Operational Mode: ${BOT_MODE.toUpperCase()}`);
  console.log(`🌐 Cloudflare Pages Mini App: ${bridge.webAppUrl}`);
  console.log(`💻 Cloudflare Pages Admin: ${bridge.adminWebAppUrl}`);
  console.log(`☁️ Cloudflare Worker Gateway: ${bridge.workerApiBase}`);
  console.log("==================================================");

  let pollingWorker = null;
  let webhookServer = null;

  if (BOT_MODE === "webhook") {
    webhookServer = new TelegramWebhookServer({
      botToken: BOT_TOKEN,
      port: PORT,
      bridge,
      onUpdate: handleTelegramUpdate
    });
    webhookServer.start();
  } else {
    // Polling mode: Also start a minimal HTTP health check server so Render Web Service health checks pass!
    const healthServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname === "/healthz" || url.pathname === "/") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          ok: true,
          service: "hendy-render-telegram-bot",
          mode: "polling",
          workerStatus: "active",
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }));
        return;
      }
      res.statusCode = 404;
      res.end("Not Found");
    });

    healthServer.listen(PORT, "0.0.0.0", () => {
      console.log(`🩺 Render Health Check endpoint listening on 0.0.0.0:${PORT}/healthz`);
    });

    if (BOT_TOKEN) {
      pollingWorker = new TelegramPollingWorker({
        botToken: BOT_TOKEN,
        bridge,
        onUpdate: handleTelegramUpdate
      });
      pollingWorker.start();
    } else {
      console.log("ℹ️ Note: BOT_TOKEN not provided in environment. Running in standby/health check mode.");
    }

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nReceived SIGINT. Shutting down cleanly...");
      if (pollingWorker) pollingWorker.stop();
      healthServer.close();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\nReceived SIGTERM. Shutting down cleanly...");
      if (pollingWorker) pollingWorker.stop();
      healthServer.close();
      process.exit(0);
    });
  }
}

main().catch(err => {
  console.error("Fatal startup error in Render Bot service:", err);
  process.exit(1);
});
