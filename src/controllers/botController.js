import { getUser, getWallet, getVipTiers } from "../services/userService.js";
import { getCatalogItems, getOrders } from "../services/appDataService.js";

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

export async function handleTelegramWebhook(req, res, next) {
  try {
    const update = req.body || {};
    const message = update.message;

    if (!message) {
      return res.status(200).json({ ok: true, note: "No message payload" });
    }

    const chatId = message.chat?.id;
    const fromId = String(message.from?.id || "99887766");
    const text = (message.text || "").trim();

    let replyText = "";
    const [command, ...args] = text.split(" ");

    switch (command.toLowerCase()) {
      case "/start":
        replyText =
          `👋 Chào mừng bạn đến với **Hendy Bot Telegram — Cloudflare Edition**!\n\n` +
          `⚡ **Hạ tầng phân tán:**\n` +
          `• Backend: Render Core (Node.js 24)\n` +
          `• Database: Cloudflare D1 (Serverless SQLite)\n` +
          `• Storage: Cloudflare R2 (Object Storage S3)\n` +
          `• Frontend: Cloudflare Pages + Telegram Mini App\n\n` +
          `Gõ /store để duyệt kho ứng dụng hoặc /wallet để kiểm tra số dư.`;
        break;

      case "/store": {
        const items = await getCatalogItems();
        replyText =
          `🛍️ **Hendy App Store (Cloudflare R2):**\n\n` +
          items.map((i, idx) => `${idx + 1}. **${i.title}**\n   💰 Giá: ${i.price === 0 ? "Miễn Phí" : Number(i.price).toLocaleString("vi-VN") + " đ"}\n   ⭐ Đánh giá: ${i.rating} | Tải: ${i.downloads}`).join("\n\n") +
          `\n\n👉 Nhấn nút bên dưới để mở Mini App đầy đủ giao diện App Store.`;
        break;
      }

      case "/wallet": {
        const wallet = await getWallet(fromId);
        replyText =
          `💳 **Ví Điện Tử (Cloudflare D1):**\n\n` +
          `• Số dư chính: **${Number(wallet.balance || 0).toLocaleString("vi-VN")} đ**\n` +
          `• Điểm voucher: **${Number(wallet.voucher || 0).toLocaleString("vi-VN")} đ**\n` +
          `• Điểm VIP: **${wallet.points || 0} pts**\n` +
          `• Hạng hội viên: **${wallet.tier || "VIP"}**\n\n` +
          `👉 Nạp tiền nhanh quét mã VietQR tự động trong Mini App!`;
        break;
      }

      case "/admin":
        replyText =
          `🛡️ **Trung Tâm Quản Trị Viên (Admin Panel):**\n\n` +
          `• Quản lý hàng đợi đơn hàng (Order Queue)\n` +
          `• Duyệt yêu cầu nạp tiền VietQR tự động\n` +
          `• Đóng gói và phát hành ứng dụng lên Cloudflare R2\n` +
          `• Phát hành mã Giftcode bảo mật\n\n` +
          `👉 Mở Mini App và chọn tab "Quản Trị" để thao tác.`;
        break;

      case "/id":
        replyText = `🆔 **Thông Tin Của Bạn:**\n• ID Telegram: \`${fromId}\`\n• Tên: ${message.from?.first_name || "Hội viên"}\n• Trạng thái: Hoạt động`;
        break;

      default:
        replyText =
          `🤖 Hendy Bot đã nhận lệnh: "${text}".\n` +
          `Hãy dùng các lệnh: /start, /store, /wallet, /admin, /id hoặc bấm nút Mini App để trải nghiệm trọn vẹn!`;
    }

    return res.status(200).json({
      ok: true,
      chatId,
      replyText,
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

    res.json({
      botName: "Hendy Bot Telegram",
      version: "2.4.1",
      infrastructure: {
        server: "Render Web Service",
        database: "Cloudflare D1",
        storage: "Cloudflare R2",
        frontend: "Cloudflare Pages + Telegram Mini App"
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
