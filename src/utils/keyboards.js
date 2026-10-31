const { Markup } = require('telegraf');

// Bộ icon động ngẫu nhiên cho các mục chính
const getRandomIcons = () => {
  const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return {
    rocket: sample(['🚀', '🛸', '🛰️', '☄️']),
    gem: sample(['💎', '💍', '🔮', '✨']),
    gift: sample(['🎁', '🎊', '🎉', '🧧']),
    card: sample(['💳', '💰', '💸', '💵']),
    tool: sample(['🧰', '🔧', '🔨', '⚙️']),
    shield: sample(['🛡️', '⚔️', '🔒', '🔑']),
    fire: sample(['🔥', '💥', '⚡', '🌟'])
  };
};

const getMainMenu = () => {
  const icons = getRandomIcons();
  return Markup.inlineKeyboard([
    // Hàng 1: Minigame Live & Thuê Tool (Màu đỏ & Xanh dương nhạt)
    [
      Markup.button.callback(`🎯 MINIGAME LIVE`, 'menu_minigame'), 
      Markup.button.callback(`🌐 THUÊ TOOL (NEW)`, 'unimplemented')
    ],
    // Hàng 2: Mua lì xì (Nút dài màu xanh lá)
    [
      Markup.button.callback(`🎁 MUA LÌ XÌ - CODE MÀN - CODE TELE`, 'buy_code')
    ],
    // Hàng 3: Nạp tiền & OTP Proxy (Đỏ & Xanh dương)
    [
      Markup.button.callback(`💳 NẠP TIỀN`, 'deposit'), 
      Markup.button.callback(`🌐 OTP & PROXY`, 'menu_otp_proxy')
    ],
    // Hàng 4: VIP Kho công cụ (Cam đậm)
    [
      Markup.button.callback('🏆 VIP KHO CÔNG CỤ ĐẶC QUYỀN', 'menu_vip_tools')
    ],
    // Hàng 5: Trung tâm khách hàng (Xanh dương)
    [
      Markup.button.callback('💎 TRUNG TÂM KHÁCH HÀNG', 'customer_center')
    ],
    // Hàng 6: Hệ thống ghép đối đầu (Đỏ)
    [
      Markup.button.callback('⚔️ HỆ THỐNG GHÉP ĐỐI ĐẦU', 'menu_duel')
    ],
    // Hàng 7: Giới thiệu REF & VIP Trung tâm VIP (Xanh dương & Vàng cam)
    [
      Markup.button.callback('👥 Giới thiệu REF', 'unimplemented'), 
      Markup.button.callback('👑 VIP TRUNG TÂM VIP', 'unimplemented')
    ],
    // Hàng 8: Nhóm chat & Kênh thông báo (Xanh lá)
    [
      Markup.button.url('👥 NHÓM CHAT', 'https://t.me/Hendy_Support_Group'), 
      Markup.button.callback('📢 KÊNH THÔNG BÁO', 'unimplemented')
    ],
    // Hàng 9: Nhập Giftcode & Liên hệ CSKH (Đỏ & Nâu)
    [
      Markup.button.callback('🎟️ NHẬP GIFTCODE', 'unimplemented'), 
      Markup.button.callback('🧑🏻‍💻 LIÊN HỆ CSKH', 'unimplemented')
    ]
  ]);
};

const getMinigameMenu = () => Markup.inlineKeyboard([
  [
    Markup.button.callback('🚀 QQ88 78Win SC88 C168', 'minigame_group_1'), 
    Markup.button.callback('🚀 RR88 MM88 GG88', 'minigame_group_2')
  ],
  [
    Markup.button.callback('🚀 [ABCVIP] XX8 U888 J88 ABC8 88CLB', 'minigame_group_3')
  ],
  [
    Markup.button.callback('⭐ AUTO ĐẶT LẠI', 'unimplemented'), 
    Markup.button.callback('💥 TRÚNG KHÔNG PHÁT', 'unimplemented')
  ],
  [
    Markup.button.callback('🔙 TRỞ VỀ MENU CHÍNH', 'back_start')
  ]
]);

const getBuyCodeMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('🎮 V2 LIÊN KẾT (QQ88, 78Win, SC88, C168)', 'v2_links')],
  [Markup.button.callback('🕹️ Trang Live Riêng', 'unimplemented')],
  [Markup.button.callback('🔙 Quay lại', 'back_start')]
]);

const getV2LinksMenu = (links) => Markup.inlineKeyboard([
  [
    Markup.button.callback(`🎯 QQ88 (${links.QQ88?.length || 0})`, 'manage_QQ88'), 
    Markup.button.callback(`🎯 78Win (${links['78WIN']?.length || 0})`, 'manage_78WIN')
  ],
  [
    Markup.button.callback(`🎯 SC88 (${links.SC88?.length || 0})`, 'manage_SC88'), 
    Markup.button.callback(`🎯 C168 (${links.C168?.length || 0})`, 'manage_C168')
  ],
  [
    Markup.button.callback(`🎯 CM88 (${links.CM88?.length || 0})`, 'manage_CM88'), 
    Markup.button.callback(`🎯 F8BET (${links.F8BET?.length || 0})`, 'manage_F8BET')
  ],
  [Markup.button.callback('📖 HƯỚNG DẪN - CHI TIẾT', 'guide_detail')],
  [Markup.button.callback('🔙 Quay lại', 'buy_code')]
]);

const getBackMenu = (callbackData) => Markup.inlineKeyboard([
  [Markup.button.callback('🔙 Quay lại', callbackData)]
]);

module.exports = { getRandomIcons, getMainMenu, getMinigameMenu, getBuyCodeMenu, getV2LinksMenu, getBackMenu };
