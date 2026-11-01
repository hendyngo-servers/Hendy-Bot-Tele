import { addLinkedAccount } from "../db/userModel.js";
import { sendMessage } from "./telegram.js";

export async function handleWebAppData(update, env) {
  const message = update.message;
  const raw = message?.web_app_data?.data;
  if (!raw) return false;
  let data;
  try { data = JSON.parse(raw); }
  catch {
    await sendMessage(env, message.chat.id, "Dữ liệu Mini App không hợp lệ.");
    return true;
  }

  if ("mk" in data || "password" in data || "otp" in data) {
    await sendMessage(env, message.chat.id, "Bot không nhận mật khẩu hoặc OTP. Chỉ sử dụng mã tài khoản.");
    return true;
  }
  if (data.action === "link_account") {
    await addLinkedAccount(env, message.from.id, String(data.brand || ""), data.accountLabel || data.tk);
    await sendMessage(env, message.chat.id, "Đã lưu mã tài khoản. Không có mật khẩu nào được thu thập hoặc lưu.");
    return true;
  }
  return false;
}