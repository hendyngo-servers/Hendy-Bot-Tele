import { getUser, getWallet, getVipTiers, createDepositRequest } from "../services/userService.js";
import { getCatalogItems, getOrders } from "../services/appDataService.js";
import { isMaintenanceActive, getBotSettings, toggleMaintenanceMode } from "../services/settingsService.js";
import { sendMessage, getWebhookInfo } from "../services/telegramService.js";
import { executeD1Query, getD1Health } from "../services/d1Client.js";

export const BOT_MODULES = [
  { id: "store", title: "Cửa hàng App Store", icon: "🛍️", desc: "Kho ứng dụng, công cụ R2, mã nguồn" },
  { id: "wallet", title: "Ví & Số Dư", icon: "💳", desc: "Quản lý số dư Cloudflare D1 và nạp tiền" },
  { id: "orders", title: "Lịch Sử Đơn Hàng", icon: "📦", desc: "Theo dõi đơn hàng và key bản quyền" },
  { id: "vip", title: "Đặc Quyền VIP", icon: "👑", desc: "Hạng thành viên, điểm thưởng, hoàn tiền" },
  { id: "giftcode", title: "Đổi Giftcode", icon: "🎁", desc: "Nhập mã quà tặng nhận tiền vào ví" },
  { id: "referral", title: "Giới Thiệu Bạn Bè", icon: "👥", desc: "Hoa hồng 10% trọn đời khi mời thành viên" },
  { id: "support", title: "Hỗ Trợ Kỹ Thuật", icon: "🛟", desc: "Ticket trung tâm chăm sóc khách hàng 24/7" },
  { id: "community", title: "Cộng Đồng Hendy", icon: "💬", desc: "Kênh thảo luận và thông báo chính thức" },
  { id: "announcements", title: "Bảng Tin Hệ Thống", icon: "📢", desc: "Cập nhật phiên bản bot và R2 packages" },
  { id: "security", title: "Bảo Mật & 2FA", icon: "🛡️", desc: "Mã hóa AES-256 và xác thực phiên" },
  { id: "bot_settings", title: "Cài Đặt Bot", icon: "🤖", desc: "Ngôn ngữ, thông báo, tích hợp webhook" },
  { id: "cloudflare_hub", title: "Cloudflare Sync", icon: "☁️", desc: "Kiểm tra trạng thái D1, R2 và Pages" },
  { id: "quick_links", title: "Liên Kết Nhanh", icon: "🔗", desc: "Docs, API Telegram, Web Portal" },
  { id: "admin_portal", title: "Quản Trị Viên", icon: "⚙️", desc: "Duyệt nạp tiền, quản lý đơn, đóng gói R2" }
];

const ADMIN_TELEGRAM_IDS = ["99887766", "12345", "9144036314"];

export async function handleTelegramWebhook(req, res, next) {
  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;
    const callbackQuery = update.callback_query;

    // Record incoming bot update into D1 stats
    await executeD1Query(
      "UPDATE bot_stats SET total_updates = total_updates + 1, last_ping = datetime('now') WHERE id = 'global';"
    );

    if (callbackQuery) {
      const chatId = callbackQuery.message?.chat?.id;
      const data = callbackQuery.data;
      return res.status(200).json({ ok: true, answered: data });
    }

    if (!message) {
      return res.status(200).json({ ok: true, note: "No message payload" });
    }

    const chatId = message.chat?.id;
    const fromId = String(message.from?.id || "99887766");
    const text = (message.text || "").trim();
    const isAdmin = ADMIN_TELEGRAM_IDS.includes(fromId);

    const settings = await getBotSettings();
    const isMaintenance = Boolean(settings.maintenance_mode);

    // If maintenance mode is active and user is not admin, reject with maintenance notice
    if (isMaintenance && !isAdmin) {
      const replyText = settings.maintenance_message;
      if (chatId) {
        await sendMessage(chatId, replyText);
      }
      return res.status(200).json({
        ok: true,
        maintenance: true,
        chatId,
        replyText
      });
    }

    let replyText = "";
    let replyMarkup = null;
    const [command, ...args] = text.split(" ");
    const miniAppUrl = settings.render_service_url || "https://hendy-bot-tele.onrender.com";

    // Standard inline keyboard buttons for interactive bot usage
    const standardKeyboard = {
      inline_keyboard: [
        [
          { text: "🚀 Mở Mini App (App Store)", web_app: { url: miniAppUrl } }
        ],
        [
          { text: "🛍️ Cửa Hàng", callback_data: "cmd_store" },
          { text: "💳 Ví Điện Tử", callback_data: "cmd_wallet" }
        ],
        [
          { text: "👑 Đặc Quyền VIP", callback_data: "cmd_vip" },
          { text: "🛟 Hỗ Trợ 24/7", callback_data: "cmd_support" }
        ]
      ]
    };

    switch (command.toLowerCase()) {
      case "/start":
        replyText =
          `${settings.welcome_message}\n\n` +
          `⚡ **Hạ tầng phân tán Cloudflare + Render:**\n` +
          `• Backend Core: Render Web Service (Node.js 24)\n` +
          `• Database: Cloudflare D1 (Serverless SQLite)\n` +
          `• Object Storage: Cloudflare R2 (Assets & Packages)\n` +
          `• Frontend: Cloudflare Pages & Telegram Mini App\n\n` +
          `📌 **Lệnh thao tác nhanh:**\n` +
          `• /store - Duyệt kho ứng dụng & phần mềm R2\n` +
          `• /wallet - Kiểm tra số dư ví & lịch sử giao dịch\n` +
          `• /deposit - Nạp tiền tự động qua VietQR\n` +
          `• /vip - Tra cứu điểm thưởng & hạng hội viên\n` +
          `• /status - Kiểm tra trạng thái hệ thống Cloudflare\n` +
          `• /admin - Trung tâm quản trị viên\n\n` +
          (isMaintenance ? `⚠️ *Lưu ý: Hệ thống đang trong trạng thái bảo trì kỹ thuật.*` : `🟢 Trạng thái hệ thống: Sẵn sàng phục vụ`);
        replyMarkup = standardKeyboard;
        break;

      case "/store": {
        const items = await getCatalogItems();
        replyText =
          `🛍️ **Hendy App Store (Cloudflare R2 Catalog):**\n\n` +
          items
            .slice(0, 5)
            .map(
              (i, idx) =>
                `${idx + 1}. **${i.title}**\n   💰 Giá: ${
                  i.price === 0 ? "Miễn Phí" : Number(i.price).toLocaleString("vi-VN") + " đ"
                }\n   ⭐ Đánh giá: ${i.rating} | Tải: ${i.downloads}`
            )
            .join("\n\n") +
          `\n\n👉 Nhấn nút "Mở Mini App" bên dưới để xem đầy đủ chi tiết và tải file từ Cloudflare R2.`;
        replyMarkup = standardKeyboard;
        break;
      }

      case "/wallet": {
        const wallet = await getWallet(fromId);
        replyText =
          `💳 **Ví Điện Tử Cloudflare D1:**\n\n` +
          `• Số dư chính: **${Number(wallet.balance || 0).toLocaleString("vi-VN")} đ**\n` +
          `• Điểm voucher: **${Number(wallet.voucher || 0).toLocaleString("vi-VN")} đ**\n` +
          `• Điểm VIP: **${wallet.points || 0} pts**\n` +
          `• Hạng hội viên: **${wallet.tier || "VIP Kim Cương"}**\n\n` +
          `👉 Gõ /deposit để nạp tiền VietQR tự động hoặc mở Mini App để xem sao kê chi tiết.`;
        replyMarkup = standardKeyboard;
        break;
      }

      case "/deposit": {
        const dep = await createDepositRequest(fromId, 100000);
        replyText =
          `📥 **Thông Tin Nạp Tiền VietQR Tự Động:**\n\n` +
          `• Ngân hàng: **${dep.deposit.bankInfo.bankId}**\n` +
          `• Số tài khoản: \`${dep.deposit.bankInfo.accountNo}\`\n` +
          `• Chủ tài khoản: **${dep.deposit.bankInfo.accountName}**\n` +
          `• Số tiền nạp mẫu: **100.000 đ**\n` +
          `• Nội dung chuyển khoản: \`${dep.deposit.transferContent}\`\n\n` +
          `⚠️ *Vui lòng giữ nguyên nội dung chuyển khoản để hệ thống bot duyệt tự động qua webhook trong 30 giây.*`;
        break;
      }

      case "/vip": {
        const vip = await getVipTiers(fromId);
        replyText =
          `👑 **Đặc Quyền Hội Viên Hendy:**\n\n` +
          `• Hạng hiện tại: **${vip.currentTier.name}**\n` +
          `• Điểm tích lũy: **${vip.points} pts**\n` +
          `• Hoàn tiền giao dịch: **${vip.currentTier.cashbackRate}**\n` +
          `• Hạng kế tiếp: **${vip.nextTier.name}** (còn ${vip.nextTier.pointsRemaining} pts)\n\n` +
          `🎁 Quyền lợi: Giảm giá 15% tất cả sản phẩm R2, hỗ trợ 24/7.`;
        break;
      }

      case "/orders": {
        const userOrders = await getOrders(fromId);
        replyText =
          `📦 **Lịch Sử Đơn Hàng Gần Nhất:**\n\n` +
          (userOrders.length === 0
            ? "Bạn chưa có đơn hàng nào."
            : userOrders
                .slice(0, 3)
                .map(
                  (o) =>
                    `• **${o.id}**: ${o.title}\n  Giá: ${Number(o.amount || 0).toLocaleString("vi-VN")} đ | Trạng thái: ${o.status}`
                )
                .join("\n\n"));
        break;
      }

      case "/status": {
        const d1Health = await getD1Health();
        replyText =
          `📊 **Trạng Thái Hạ Tầng Hendy Bot:**\n\n` +
          `• Trạng thái Bot: 🟢 Online (Webhook Active)\n` +
          `• Chế độ bảo trì: ${isMaintenance ? "🔴 Đang bật (Maintenance Mode)" : "🟢 Đang tắt (Normal Operation)"}\n` +
          `• Cloudflare D1: 🟢 ${d1Health.status.toUpperCase()} (${d1Health.latency_ms} ms)\n` +
          `• Máy chủ: Render Web Service\n` +
          `• Kho R2: Cloudflare R2 Active (Multi-region)\n` +
          `• Frontend: Cloudflare Pages Ready`;
        break;
      }

      case "/maintenance": {
        if (!isAdmin) {
          replyText = `⛔ Lệnh này chỉ dành cho Quản trị viên hệ thống.`;
          break;
        }
        const action = (args[0] || "").toLowerCase();
        if (action === "on") {
          const customMsg = args.slice(1).join(" ") || null;
          await toggleMaintenanceMode(true, customMsg);
          replyText = `🔴 **Đã kích hoạt Chế Độ Bảo Trì!**\n\nNgười dùng thông thường sẽ nhận được thông báo bảo trì khi gửi lệnh tới Bot.`;
        } else if (action === "off") {
          await toggleMaintenanceMode(false);
          replyText = `🟢 **Đã tắt Chế Độ Bảo Trì!**\n\nHệ thống đã trở lại hoạt động bình thường cho mọi thành viên.`;
        } else {
          replyText =
            `⚙️ **Cú pháp lệnh Bảo trì:**\n\n` +
            `• \`/maintenance on [thông điệp bảo trì]\` - Bật bảo trì\n` +
            `• \`/maintenance off\` - Tắt bảo trì\n` +
            `• Trạng thái hiện tại: ${isMaintenance ? "🔴 Đang Bật" : "🟢 Đang Tắt"}`;
        }
        break;
      }

      case "/admin":
        replyText =
          `🛡️ **Trung Tâm Quản Trị Viên (Admin Panel):**\n\n` +
          `• Quản lý hàng đợi đơn hàng & phân phối key\n` +
          `• Duyệt yêu cầu nạp tiền VietQR tự động\n` +
          `• Đóng gói và phát hành ứng dụng lên Cloudflare R2\n` +
          `• Phát hành Giftcode bảo mật\n` +
          `• Bật/Tắt bảo trì hệ thống: \`/maintenance on|off\`\n\n` +
          `👉 Mở Mini App và chọn tab "Quản Trị" để truy cập bảng điều khiển đầy đủ.`;
        break;

      case "/help":
        replyText =
          `📖 **Hướng Dẫn Sử Dụng Hendy Bot:**\n\n` +
          `/start - Bắt đầu & Giới thiệu\n` +
          `/store - Kho ứng dụng Cloudflare R2\n` +
          `/wallet - Ví điện tử D1 & số dư\n` +
          `/deposit - Nạp tiền VietQR tự động\n` +
          `/vip - Tra cứu hạng hội viên\n` +
          `/orders - Lịch sử đơn hàng\n` +
          `/status - Kiểm tra trạng thái hệ thống\n` +
          `/admin - Dành cho Quản trị viên`;
        break;

      case "/id":
        replyText = `🆔 **Thông Tin Của Bạn:**\n• ID Telegram: \`${fromId}\`\n• Tên: ${message.from?.first_name || "Hội viên"}\n• Phân quyền: ${isAdmin ? "👑 Quản trị viên (Admin)" : "Thành viên"}`;
        break;

      default:
        replyText =
          `🤖 Hendy Bot đã nhận lệnh: "${text}".\n` +
          `Hãy dùng các lệnh: /start, /store, /wallet, /deposit, /vip, /status hoặc nhấn "Mở Mini App" để khám phá!`;
        replyMarkup = standardKeyboard;
    }

    // Deliver response via Telegram Bot API if chatId is available
    if (chatId) {
      await sendMessage(chatId, replyText, {
        replyMarkup: replyMarkup || undefined
      });
    }

    return res.status(200).json({
      ok: true,
      chatId,
      replyText,
      maintenance: isMaintenance,
      modulesCount: BOT_MODULES.length
    });
  } catch (err) {
    next(err);
  }
}

export async function getBotStatus(req, res, next) {
  try {
    const user = await getUser("99887766");
    const catalogItems = await getCatalogItems();
    const d1Health = await getD1Health();
    const settings = await getBotSettings();
    const webhookInfo = await getWebhookInfo();

    res.json({
      botName: "Hendy Bot Telegram",
      version: "2.5.0",
      maintenance: {
        active: Boolean(settings.maintenance_mode),
        message: settings.maintenance_message
      },
      infrastructure: {
        server: "Render Web Service",
        database: `Cloudflare D1 (${d1Health.database})`,
        d1_latency_ms: d1Health.latency_ms,
        d1_status: d1Health.status,
        storage: "Cloudflare R2",
        frontend: "Cloudflare Pages + Telegram Mini App"
      },
      webhook: webhookInfo.result || {},
      settings: {
        render_service_url: settings.render_service_url,
        vietqr_bank: settings.vietqr_bank,
        vietqr_account_no: settings.vietqr_account_no
      },
      modules: BOT_MODULES,
      stats: {
        activeCatalogItems: catalogItems.length,
        systemHealth: "100% Operational"
      }
    });
  } catch (err) {
    next(err);
  }
}
