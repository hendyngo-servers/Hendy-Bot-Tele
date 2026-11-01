function miniAppUrl(env, module, extra = {}) {
  const base = String(env.WEBAPP_URL || "").trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set("module", module);
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
    return url.toString();
  } catch {
    return null;
  }
}

function appButton(env, text, module, extra = {}, style = "primary") {
  const url = miniAppUrl(env, module, extra);
  return url
    ? { text, style, web_app: { url } }
    : { text, style, callback_data: "app_url_missing" };
}

function externalButton(text, url, fallback, style = "success") {
  const value = String(url || "").trim();
  if (/^https:\/\//i.test(value)) return { text, style, url: value };
  return { text, style, callback_data: fallback };
}

export function mainMenu(env) {
  return {
    inline_keyboard: [
      [
        appButton(env, "🚀 MINIGAME LIVE", "mini_game_live", {}, "danger"),
        appButton(env, "🧰 THUÊ TOOL (NEW)", "app_tool", {}, "primary")
      ],
      [appButton(env, "🛍️ MUA LÌ XÌ · CODE MÀN · CODE TELE", "buy_code", {}, "success")],
      [
        appButton(env, "💳 NẠP TIỀN", "wallet", {}, "danger"),
        appButton(env, "🛡️ OTP & PROXY", "otp_proxy", {}, "primary")
      ],
      [appButton(env, "🏆 KHO VIP · CÔNG CỤ ĐẶC QUYỀN", "vip", {}, "success")],
      [appButton(env, "💎 TRUNG TÂM KHÁCH HÀNG", "support", {}, "primary")],
      [appButton(env, "💞 HỆ THỐNG GHÉP ĐÔI", "mini_game_live", { section: "pairing" }, "danger")],
      [
        appButton(env, "🤝 GIỚI THIỆU REF", "referral", {}, "success"),
        appButton(env, "👑 TRUNG TÂM VIP", "vip", {}, "success")
      ],
      [
        externalButton("👥 NHÓM CHAT", env.GROUP_CHAT_URL, "group_link_missing", "success"),
        externalButton("📢 KÊNH THÔNG BÁO", env.NEWS_CHANNEL_URL, "channel_link_missing", "success")
      ],
      [
        appButton(env, "🎟️ NHẬP GIFTCODE", "giftcode", {}, "danger"),
        appButton(env, "🎧 LIÊN HỆ CSKH", "support", {}, "success")
      ]
    ]
  };
}

export function linksMenu(links) {
  return {
    inline_keyboard: [
      [{ text: "QQ88 (" + (links.QQ88?.length || 0) + ")", callback_data: "manage_QQ88", style: "primary" }, { text: "78WIN (" + (links["78WIN"]?.length || 0) + ")", callback_data: "manage_78WIN", style: "primary" }],
      [{ text: "SC88 (" + (links.SC88?.length || 0) + ")", callback_data: "manage_SC88", style: "primary" }, { text: "C168 (" + (links.C168?.length || 0) + ")", callback_data: "manage_C168", style: "primary" }],
      [{ text: "CM88 (" + (links.CM88?.length || 0) + ")", callback_data: "manage_CM88", style: "primary" }, { text: "F8BET (" + (links.F8BET?.length || 0) + ")", callback_data: "manage_F8BET", style: "primary" }],
      [{ text: "⬅️ Quay lại", callback_data: "back_start", style: "danger" }]
    ]
  };
}

export function minigameMenu() {
  return { inline_keyboard: [
    [{ text: "🎮 MỞ MINI GAME LIVE", callback_data: "app_url_missing", style: "primary" }],
    [{ text: "⭐ Xem đơn hàng và trạng thái", callback_data: "app_url_missing", style: "success" }],
    [{ text: "⬅️ Menu chính", callback_data: "back_start", style: "danger" }]
  ] };
}
