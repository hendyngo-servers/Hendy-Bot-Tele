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
const ALLOWED_MODULES = new Set(BASE_ACTIONS.map((item) => item[1]));

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

export function buildMainKeyboard(env = process.env, settings = {}) {
  const overrides = Array.isArray(settings.menu_config) ? settings.menu_config : [];
  const configured = BASE_ACTIONS.map(([defaultLabel, module]) => {
    const override = overrides.find((item) => item?.module === module);
    if (override?.enabled === false) return null;
    const label = String(override?.label || defaultLabel).trim().slice(0, 48);
    return label ? appButton(label, module, env) : appButton(defaultLabel, module, env);
  }).filter(Boolean);

  const rows = [];
  for (let index = 0; index < configured.length; index += 2) {
    rows.push(configured.slice(index, index + 2));
  }

  const community = [
    externalTelegramButton("👥 NHÓM CHAT", settings.group_chat_url ?? env.GROUP_CHAT_URL),
    externalTelegramButton("📢 KÊNH THÔNG BÁO", settings.news_channel_url ?? env.NEWS_CHANNEL_URL)
  ].filter(Boolean);
  if (community.length) rows.push(community);

  const support = externalTelegramButton("☎️ LIÊN HỆ CSKH", settings.support_url ?? env.SUPPORT_URL);
  if (support) rows.push([support]);

  return { inline_keyboard: rows };
}
