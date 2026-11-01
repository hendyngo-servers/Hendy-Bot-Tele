import { upsertUser } from "../db/userModel.js";
import { mainMenu } from "./keyboards.js";
import { sendMessage } from "./telegram.js";

export async function handleCommand(update, env) {
  const message = update.message;
  const text = message?.text || "";
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  if (!command.startsWith("/")) return false;

  if (command === "/start") {
    const user = await upsertUser(env, message.from.id, message.from.first_name || "Khách");
    await sendMessage(env, message.chat.id,
      "HENDY BOT\nXin chào " + user.name + "!\nID Telegram: " + user.id + "\n\nMở Mini App để quản lý mã tài khoản và bản phát hành.",
      mainMenu(env));
    return true;
  }

  if (command === "/help") {
    await sendMessage(env, message.chat.id, "HƯỚNG DẪN\n/start - Mở menu chính\n/id - Xem Telegram ID\n\nKhông gửi mật khẩu hoặc mã OTP cho bot.");
    return true;
  }

  if (command === "/id") {
    await sendMessage(env, message.chat.id, "Telegram ID: " + message.from.id);
    return true;
  }
  return false;
}