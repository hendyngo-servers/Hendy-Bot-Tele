const { Markup } = require('telegraf');

const getRandomIcons = () => {
  const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return {
    rocket: sample(['🚀', '🛸', '🛰️', '☄️']),
    gem: sample(['💎', '💍', '🔮', '✨']),
    gift: sample(['🎁', '🎊', '🎉', '🧧']),
    card: sample(['💳', '💰', '💸', '💵']),
    tool: sample(['🧰', '🔧', '🔨', '⚙️']),
    shield: sample(['🛡️', '⚔️', '🔒', '🔑'])
  };
};

const getMainMenu = () => {
  const icons = getRandomIcons();
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${icons.rocket} MINIGAME LIVE`, 'menu_minigame'), Markup.button.callback(`${icons.tool} THUÊ TOOL (NEW)`, 'unimplemented')],
    [Markup.button.callback(`${icons.gift} MUA LÌ XÌ - CODE MÀN - CODE TELE`, 'buy_code')],
    [Markup.button.callback(`${icons.card} NẠP TIỀN`, 'deposit'), Markup.button.callback(`${icons.shield} OTP & PROXY`, 'menu_otp_proxy')],
    [Markup.button.callback('🏆 KHO CÔNG CỤ ĐẶC QUYỀN', 'menu_vip_tools')],
    [Markup.button.callback(`${icons.gem} TRUNG TÂM KHÁCH HÀNG`, 'customer_center')],
    [Markup.button.callback('⚔️ HỆ THỐNG GHÉP ĐỐI ĐẦU', 'menu_duel')],
    [Markup.button.callback('👥 Giới thiệu REF', 'unimplemented'), Markup.button.callback('👑 TRUNG TÂM VIP', 'unimplemented')],
    [Markup.button.url('👨‍👩‍👧 NHÓM CHAT', 'https://t.me/Hendy_Support_Group'), Markup.button.callback('📢 KÊNH THÔNG BÁO', 'unimplemented')],
    [Markup.button.callback('🎟️ NHẬP GIFTCODE', 'unimplemented'), Markup.button.callback('🧑🏻‍💻 LIÊN HỆ CSKH', 'unimplemented')]
  ]);
};

const getBuyCodeMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('🎮 V2 LIÊN KẾT (SC88, C168, CM88, F8BET)', 'v2_links')],
  [Markup.button.callback('🕹️ Trang Live Riêng [QQ88, Hi88, 78Win..]', 'unimplemented')],
  [Markup.button.callback('🔙 Quay lại', 'back_start')]
]);

const getV2LinksMenu = (cSC88, cC168, cCM88, cF8BET) => Markup.inlineKeyboard([
  [Markup.button.callback(`🎯 SC88 (${cSC88})`, 'manage_SC88'), Markup.button.callback(`🎯 C168 (${cC168})`, 'manage_C168')],
  [Markup.button.callback(`🎯 CM88 (${cCM88})`, 'manage_CM88'), Markup.button.callback(`🎯 F8BET (${cF8BET})`, 'manage_F8BET')],
  [Markup.button.callback('📖 HƯỚNG DẪN - CHI TIẾT', 'guide_detail')],
  [Markup.button.callback('🔙 Quay lại', 'buy_code')]
]);

const getBackMenu = (callbackData) => Markup.inlineKeyboard([
  [Markup.button.callback('🔙 Quay lại', callbackData)]
]);

module.exports = { getRandomIcons, getMainMenu, getBuyCodeMenu, getV2LinksMenu, getBackMenu };
