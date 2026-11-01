export function mainMenu(env) {
  const appUrl = env.WEBAPP_URL || "https://hendy-web-user.pages.dev";
  return {
    inline_keyboard: [
      [{ text: "📱 MỞ MINI APP", web_app: { url: appUrl } }],
      [{ text: "📂 QUẢN LÝ LIÊN KẾT", callback_data: "v2_links" }],
      [{ text: "🎮 MINIGAME", callback_data: "menu_minigame" }],
      [{ text: "ℹ️ HƯỚNG DẪN", callback_data: "help" }]
    ]
  };
}

export function linksMenu(links) {
  return {
    inline_keyboard: [
      [{ text: "QQ88 (" + (links.QQ88?.length || 0) + ")", callback_data: "manage_QQ88" }, { text: "78WIN (" + (links["78WIN"]?.length || 0) + ")", callback_data: "manage_78WIN" }],
      [{ text: "SC88 (" + (links.SC88?.length || 0) + ")", callback_data: "manage_SC88" }, { text: "C168 (" + (links.C168?.length || 0) + ")", callback_data: "manage_C168" }],
      [{ text: "CM88 (" + (links.CM88?.length || 0) + ")", callback_data: "manage_CM88" }, { text: "F8BET (" + (links.F8BET?.length || 0) + ")", callback_data: "manage_F8BET" }],
      [{ text: "⬅️ Quay lại", callback_data: "back_start" }]
    ]
  };
}

export function minigameMenu() {
  return { inline_keyboard: [
    [{ text: "🚀 QQ88 · 78WIN · SC88 · C168", callback_data: "unavailable" }],
    [{ text: "⭐ Tính năng đang cập nhật", callback_data: "unavailable" }],
    [{ text: "⬅️ Menu chính", callback_data: "back_start" }]
  ] };
}