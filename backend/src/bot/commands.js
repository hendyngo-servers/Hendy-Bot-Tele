import { upsertUser } from "../db/userModel.js";
import { claimReferral } from "../db/commerceModel.js";
import { mainMenu } from "./keyboards.js";
import { sendMessage } from "./telegram.js";

function isAdmin(userId, env) {
  return String(env.ADMIN_IDS || "").split(",").map(value => value.trim()).filter(Boolean).includes(String(userId));
}

function adminAppUrl(env) {
  const value = String(env.ADMIN_WEBAPP_URL || "").trim();
  if (!/^https:\/\//i.test(value)) return null;
  return value;
}

export async function handleCommand(update, env) {
  const message = update.message;
  const text = message?.text || "";
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  if (!command.startsWith("/")) return false;

  if (command === "/start") {
    const user = await upsertUser(env, message.from.id, message.from.first_name || "Khách");
    let referralNote = "";
    const startPayload = text.trim().split(/\s+/)[1] || "";
    const referralMatch = startPayload.match(/^ref_([A-Z0-9]{4,32})$/i);
    if (referralMatch) {
      try {
        await claimReferral(env, message.from.id, { code: referralMatch[1] });
        referralNote = "\n🎉 Đã ghi nhận mã giới thiệu " + referralMatch[1].toUpperCase() + ".";
      } catch (error) {
        referralNote = "\nℹ️ Mã giới thiệu không được áp dụng: " + String(error.message || "Không hợp lệ").slice(0, 180);
      }
    }
    const linkedCount = Object.values(user.linked_accounts || {}).reduce(
      (total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0
    );
    const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || user.name;
    const adminNote = isAdmin(message.from.id, env) ? "\n🛡️ Bạn có quyền quản trị. Dùng /admin để mở bảng điều khiển." : "";
    await sendMessage(env, message.chat.id,
      "🤖 HENDY BOT TELEGRAM\n" +
      "Xin chào " + name + "!\n" +
      "🆔 Telegram ID: " + user.id + "\n" +
      "💰 Số dư: " + Number(user.balance || 0).toLocaleString("vi-VN") + " VNĐ\n" +
      "🔗 Tài khoản liên kết: " + linkedCount + "\n" +
      "━━━━━━━━━━━━━━━━━━\n" +
      "Chọn chức năng bạn cần bên dưới." + adminNote + referralNote,
      mainMenu(env));
    return true;
  }

  if (command === "/admin") {
    if (!isAdmin(message.from.id, env)) {
      await sendMessage(env, message.chat.id, "⛔ Bạn không có quyền quản trị.");
      return true;
    }
    const url = adminAppUrl(env);
    if (!url) {
      await sendMessage(env, message.chat.id, "⚠️ Chưa cấu hình ADMIN_WEBAPP_URL cho trang quản trị.");
      return true;
    }
    await sendMessage(env, message.chat.id, "🛡️ TRUNG TÂM QUẢN TRỊ HENDY\nPhiên quản trị được API xác minh độc lập.", {
      inline_keyboard: [[{ text: "🔐 MỞ BẢNG QUẢN TRỊ", web_app: { url } }]]
    });
    return true;
  }

  if (command === "/help") {
    await sendMessage(env, message.chat.id,
      "📖 HƯỚNG DẪN\n/start - Mở menu chức năng\n/admin - Mở quản trị (chỉ Admin)\n/id - Xem Telegram ID\n\nKhông gửi mật khẩu, OTP hoặc cookie tài khoản cho bot.");
    return true;
  }

  if (command === "/id") {
    await sendMessage(env, message.chat.id, "Telegram ID: " + message.from.id);
    return true;
  }
  return false;
}
