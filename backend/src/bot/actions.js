import { deleteLinkedAccount, getUser } from "../db/userModel.js";
import { linksMenu, mainMenu, minigameMenu } from "./keyboards.js";
import { answerCallback, editMessage } from "./telegram.js";

export async function handleCallback(update, env) {
  const query = update.callback_query;
  if (!query) return false;
  const data = query.data || "";
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) {
    await answerCallback(env, query.id, "Không thể xử lý tin nhắn này.");
    return true;
  }

  if (data === "back_start") {
    await editMessage(env, chatId, messageId, "HENDY BOT\nChọn chức năng bạn cần:", mainMenu(env));
  } else if (data === "v2_links") {
    const user = await getUser(env, query.from.id);
    await editMessage(env, chatId, messageId, "QUẢN LÝ LIÊN KẾT\nChọn nền tảng:", linksMenu(user?.linked_accounts || {}));
  } else if (data === "menu_minigame") {
    await editMessage(env, chatId, messageId, "MINIGAME\nCác tiện ích sẽ được cập nhật tại đây.", minigameMenu());
  } else if (data.startsWith("manage_")) {
    const brand = data.slice(7);
    const user = await getUser(env, query.from.id);
    const rows = user?.linked_accounts?.[brand] || [];
    const buttons = rows.map((item, index) => [{ text: "Xóa " + item.tk, callback_data: "del_" + brand + "_" + index }]);
    buttons.push([{ text: "⬅️ Quay lại", callback_data: "v2_links" }]);
    const lines = rows.length ? rows.map((item, index) => (index + 1) + ". " + item.tk).join("\n") : "Chưa có liên kết.";
    await editMessage(env, chatId, messageId, brand + "\n" + lines, { inline_keyboard: buttons });
  } else if (data.startsWith("del_")) {
    const match = data.match(/^del_([A-Z0-9]+)_(\d+)$/);
    if (match) {
      const links = await deleteLinkedAccount(env, query.from.id, match[1], Number(match[2]));
      const buttons = (links[match[1]] || []).map((item, index) => [{ text: "Xóa " + item.tk, callback_data: "del_" + match[1] + "_" + index }]);
      buttons.push([{ text: "⬅️ Quay lại", callback_data: "v2_links" }]);
      await editMessage(env, chatId, messageId, match[1] + "\nĐã cập nhật danh sách liên kết.", { inline_keyboard: buttons });
      await answerCallback(env, query.id, "Đã xóa liên kết.");
      return true;
    }
  } else if (data === "help") {
    await editMessage(env, chatId, messageId, "HƯỚNG DẪN\nDùng Mini App để quản lý liên kết.\nKhông gửi mật khẩu hoặc mã OTP cho bot.", mainMenu(env));
  } else {
    await answerCallback(env, query.id, "Chức năng chưa khả dụng.");
    return true;
  }

  await answerCallback(env, query.id);
  return true;
}