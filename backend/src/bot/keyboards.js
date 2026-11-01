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

function appButton(env, text, module, extra) {
  const url = miniAppUrl(env, module, extra);
  return url
    ? { text, web_app: { url } }
    : { text, callback_data: "app_url_missing" };
}

function externalButton(text, url, fallback) {
  const value = String(url || "").trim();
  if (/^https:\/\//i.test(value)) return { text, url: value };
  return { text, callback_data: fallback };
}

export function mainMenu(env) {
  return {
    inline_keyboard: [
      [
        appButton(env, "🚀 MINIGAME LIVE", "mini_game_live"),
        appButton(env, "🧰 THUÊ TOOL (NEW)", "app_tool")
      ],
      [appButton(env, "🛍️ MUA LÌ XÌ · CODE MÀN · CODE TELE", "buy_code")],
      [
        appButton(env, "💳 NẠP TIỀN", "wallet"),
        appButton(env, "🛡️ OTP & PROXY", "otp_proxy")
      ],
      [appButton(env, "🏆 KHO CÔNG CỤ ĐẶC QUYỀN", "vip")],
      [appButton(env, "💎 TRUNG TÂM KHÁCH HÀNG", "support")],
      [appButton(env, "💞 HỆ THỐNG GHÉP ĐÔI", "mini_game_live", { section: "pairing" })],
      [
        appButton(env, "🎁 GIỚI THIỆU REF", "referral"),
        appButton(env, "👑 TRUNG TÂM VIP", "vip")
      ],
      [
        externalButton("👥 NHÓM CHAT", env.GROUP_CHAT_URL, "group_link_missing"),
        externalButton("📢 KÊNH THÔNG BÁO", env.NEWS_CHANNEL_URL, "channel_link_missing")
      ],
      [
        appButton(env, "🎟️ NHẬP GIFTCODE", "giftcode"),
        appButton(env, "🎧 LIÊN HỆ CSKH", "support")
      ]
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
    [{ text: "🎮 MỞ MINI GAME LIVE", callback_data: "app_url_missing" }],
    [{ text: "⭐ Xem đơn hàng và trạng thái", callback_data: "app_url_missing" }],
    [{ text: "⬅️ Menu chính", callback_data: "back_start" }]
  ] };
}
