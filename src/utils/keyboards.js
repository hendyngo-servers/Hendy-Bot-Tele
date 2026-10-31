const { Markup } = require('telegraf');

function getMiniAppUrl(section = 'admin') {
  const configured = String(
    process.env.WEBAPP_URL ||
    process.env.MINI_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ''
  ).trim();
  if (!/^https:\/\//i.test(configured)) return null;
  try {
    const url = new URL(configured);
    url.searchParams.set('section', section);
    return url.toString();
  } catch {
    return null;
  }
}

function mainMenu(userId, adminId = process.env.ADMIN_ID) {
  const rows = [
    [
      Markup.button.callback('🚀 MINIGAME LIVE', 'member:live'),
      Markup.button.callback('🧰 THUÊ TOOL (NEW)', 'member:tools')
    ],
    [Markup.button.callback('🎁 MUA LÌ XÌ · CODE MÀN · CODE TELE', 'member:codes')],
    [
      Markup.button.callback('💳 NẠP TIỀN', 'member:wallet'),
      Markup.button.callback('⚙️ OTP & PROXY', 'member:otp')
    ],
    [Markup.button.callback('🏆 VIP KHO CÔNG CỤ ĐẶC QUYỀN', 'member:viptools')],
    [Markup.button.callback('💎 TRUNG TÂM KHÁCH HÀNG', 'member:customer')],
    [Markup.button.callback('⚔️ HỆ THỐNG GHÉP ĐỐI ĐẦU', 'member:duel')],
    [
      Markup.button.callback('🎊 GIỚI THIỆU REF', 'member:ref'),
      Markup.button.callback('👑 TRUNG TÂM VIP', 'member:vip')
    ],
    [
      Markup.button.callback('🗣️ NHÓM CHAT', 'member:group'),
      Markup.button.callback('📢 KÊNH THÔNG BÁO', 'member:news')
    ],
    [
      Markup.button.callback('🎟️ NHẬP GIFTCODE', 'member:gift'),
      Markup.button.callback('🧑‍💻 LIÊN HỆ CSKH', 'member:support')
    ]
  ];

  if (adminId && String(userId) === String(adminId)) {
    const adminUrl = getMiniAppUrl('admin');
    if (adminUrl) {
      rows.push([Markup.button.webApp('🛡️ BẢNG ĐIỀU KHIỂN ADMIN', adminUrl)]);
    } else {
      rows.push([Markup.button.callback('🛡️ ADMIN · Cấu hình WEBAPP_URL', 'member:admin-unavailable')]);
    }
  }
  return Markup.inlineKeyboard(rows);
}

function homeKeyboard(userId, adminId = process.env.ADMIN_ID) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 MENU CHÍNH', 'member:home')],
    ...(adminId && String(userId) === String(adminId) && getMiniAppUrl('admin')
      ? [[Markup.button.webApp('🛡️ BẢNG ĐIỀU KHIỂN ADMIN', getMiniAppUrl('admin'))]]
      : [])
  ]);
}

function categoryKeyboard(items, _userId, includeHome = true) {
  const rows = items.map(item => [
    Markup.button.callback(
      String(item.name + ' · ' + Number(item.price || 0).toLocaleString('vi-VN') + ' VNĐ').slice(0, 60),
      'member:order:' + item.id
    )
  ]);
  if (includeHome) rows.push([Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]);
  return Markup.inlineKeyboard(rows);
}

module.exports = { getMiniAppUrl, mainMenu, homeKeyboard, categoryKeyboard };
