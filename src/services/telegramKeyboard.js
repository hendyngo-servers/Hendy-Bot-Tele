const BASE_ACTIONS = [
  ["🎮 MINI GAME LIVE", "mini_game_live"],
  ["🧰 THUÊ TOOL", "app_tool"],
  ["💻 MUA CODE", "buy_code"],
  ["💳 NẠP TIỀN", "wallet"],
  ["🛡️ OTP & PROXY", "otp_proxy"],
  ["👑 KHO VIP", "vip_tools"],
  ["💎 TRUNG TÂM KHÁCH HÀNG", "support"],
  ["💞 GHÉP ĐÔI", "pairing"],
  ["🤝 GIỚI THIỆU REF", "referral"],
  ["🎟️ GIFTCODE", "giftcode"]
];

function appButton(label, module, env) {
  const base = String(env.WEBAPP_URL || env.BASE_URL || "").trim();
  if (!base) return { text: label, callback_data: "open_" + module };
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return { text: label, callback_data: "open_" + module };
    url.searchParams.set("module", module);
    return { text: label, web_app: { url: url.toString() } };
  } catch {
    return { text: label, callback_data: "open_" + module };
  }
}

function externalTelegramButton(label, rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" ||
        !["t.me", "telegram.me"].includes(url.hostname.toLowerCase()) ||
        url.pathname === "/") return null;
    return { text: label, url: url.toString() };
  } catch {
    return null;
  }
}

/**
 * Build the live bot keyboard from configured origins and verified community links.
 * It never invents Telegram usernames, community URLs, or Mini App domains.
 */
export function buildMainKeyboard(env = process.env) {
  const rows = [
    [appButton(BASE_ACTIONS[0][0], BASE_ACTIONS[0][1], env), appButton(BASE_ACTIONS[1][0], BASE_ACTIONS[1][1], env)],
    [appButton(BASE_ACTIONS[2][0], BASE_ACTIONS[2][1], env), appButton(BASE_ACTIONS[3][0], BASE_ACTIONS[3][1], env)],
    [appButton(BASE_ACTIONS[4][0], BASE_ACTIONS[4][1], env), appButton(BASE_ACTIONS[5][0], BASE_ACTIONS[5][1], env)],
    [appButton(BASE_ACTIONS[6][0], BASE_ACTIONS[6][1], env), appButton(BASE_ACTIONS[7][0], BASE_ACTIONS[7][1], env)],
    [appButton(BASE_ACTIONS[8][0], BASE_ACTIONS[8][1], env), appButton(BASE_ACTIONS[9][0], BASE_ACTIONS[9][1], env)]
  ];

  const community = [
    externalTelegramButton("👥 NHÓM CHAT", env.GROUP_CHAT_URL),
    externalTelegramButton("📢 KÊNH THÔNG BÁO", env.NEWS_CHANNEL_URL)
  ].filter(Boolean);
  if (community.length) rows.push(community);

  const support = externalTelegramButton("☎️ LIÊN HỆ CSKH", env.SUPPORT_URL);
  if (support) rows.push([support]);

  return { inline_keyboard: rows };
}
