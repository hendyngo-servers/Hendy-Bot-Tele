const { Telegraf, Markup } = require('telegraf');
const userService = require('../services/userService');
const appDataService = require('../services/appDataService');
const { encryptSecret } = require('../security/cryptoService');
const {
  runWithTelegramRetry,
  formatTelegramError
} = require('../services/telegramStartup');

let bot = null;
let botReady = false;
let currentAdminId = String(process.env.ADMIN_ID || '');

const cooldowns = new Map();
const pendingInputs = new Map();
const ALLOWED_BRANDS = ['QQ88', '78WIN', 'SC88', 'C168', 'CM88', 'F8BET'];
const INPUT_TTL_MS = 10 * 60 * 1000;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const money = value => Number(value || 0).toLocaleString('vi-VN') + ' VNĐ';
const dateText = value => value ? new Date(value).toLocaleString('vi-VN') : '—';

function getMiniAppUrl(section = 'admin') {
  const configured = String(process.env.MINI_APP_URL || '').trim();
  if (!/^https:\/\//i.test(configured)) return null;
  try {
    const url = new URL(configured);
    url.searchParams.set('section', section);
    return url.toString();
  } catch {
    return null;
  }
}

function mainMenu(userId) {
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

  if (currentAdminId && String(userId) === currentAdminId) {
    const adminUrl = getMiniAppUrl('admin');
    if (adminUrl) {
      rows.push([Markup.button.webApp('🛡️ BẢNG ĐIỀU KHIỂN ADMIN', adminUrl)]);
    } else {
      rows.push([Markup.button.callback('🛡️ ADMIN · Cấu hình MINI_APP_URL', 'member:admin-unavailable')]);
    }
  }
  return Markup.inlineKeyboard(rows);
}

function homeKeyboard(userId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 MENU CHÍNH', 'member:home')],
    ...(currentAdminId && String(userId) === currentAdminId && getMiniAppUrl('admin')
      ? [[Markup.button.webApp('🛡️ BẢNG ĐIỀU KHIỂN ADMIN', getMiniAppUrl('admin'))]]
      : [])
  ]);
}

function categoryKeyboard(items, userId, includeHome = true) {
  const rows = items.map(item => [
    Markup.button.callback(
      String(item.name + ' · ' + money(item.price)).slice(0, 60),
      'member:order:' + item.id
    )
  ]);
  if (includeHome) rows.push([Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]);
  return Markup.inlineKeyboard(rows);
}

function setPending(userId, data) {
  pendingInputs.set(String(userId), {
    ...data,
    expiresAt: Date.now() + INPUT_TTL_MS
  });
}

function setPendingStep(userId, data) {
  setPending(userId, data);
}

async function editOrReply(ctx, text, keyboard = homeKeyboard(ctx.from?.id)) {
  try {
    return await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...keyboard
    });
  } catch (error) {
    if (/message is not modified/i.test(error.message || '')) return null;
    return ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...keyboard
    });
  }
}

function getWelcomeText(user, chatId) {
  const linkedCount = appDataService.listLinkedAccounts(chatId).length;
  return [
    '🤖 <b>HENDY BOT | HENDY CYBERTECH</b>',
    'Xin chào <b>' + escapeHtml(user.name) + '</b>!',
    '🆔 ID Telegram: <code>' + escapeHtml(chatId) + '</code>',
    '━━━━━━━━━━━━━━━━━━━━',
    '💰 Ví chính: <b>' + money(user.balance) + '</b>',
    '👑 Cấp thành viên: <b>VIP ' + Number(user.vipLevel || 0) + '</b>',
    '🔗 Tài khoản đã liên kết: <b>' + linkedCount + '</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    'Chọn chức năng bên dưới. Các thao tác thành viên được xử lý trực tiếp trong Telegram Bot, không mở Mini App.'
  ].join('\n');
}

async function showDeposit(ctx, userId, amount) {
  const user = userService.getUser(userId);
  const settings = appDataService.getPaymentSettings();
  if (!user) return ctx.reply('Không tìm thấy hồ sơ thành viên. Hãy gửi /start trước.');

  let deposit;
  try {
    deposit = await appDataService.createDeposit(userId, amount);
  } catch (error) {
    return ctx.reply(error.message || 'Không thể tạo yêu cầu nạp.');
  }

  const text = [
    '💳 <b>THÔNG TIN NẠP TIỀN</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    'Số tiền: <b>' + money(deposit.amount) + '</b>',
    'Ngân hàng: <b>' + escapeHtml(settings.bankName || 'Chưa cấu hình') + '</b>',
    'Số tài khoản: <code>' + escapeHtml(settings.bankAccount || 'Chưa cấu hình') + '</code>',
    'Chủ tài khoản: <b>' + escapeHtml(settings.bankAccountName || '—') + '</b>',
    'Nội dung chuyển khoản: <code>' + escapeHtml(deposit.reference) + '</code>',
    '━━━━━━━━━━━━━━━━━━━━',
    'Trạng thái: <b>Chờ đối soát</b>',
    escapeHtml(settings.instructions || 'Chuyển khoản đúng số tiền và nội dung. Admin sẽ xác nhận sau khi đối soát.')
  ].join('\n');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 KIỂM TRA LỊCH SỬ NẠP', 'member:deposit-history')],
    [Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]
  ]);

  if (deposit.qrUrl) {
    return ctx.replyWithPhoto(deposit.qrUrl, {
      caption: text,
      parse_mode: 'HTML',
      ...keyboard
    });
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

function requireAdmin(ctx, next) {
  if (!currentAdminId || String(ctx.from?.id) !== currentAdminId) {
    return ctx.reply('⛔ Bạn không có quyền quản trị.');
  }
  return next();
}

async function showCatalog(ctx, userId, category, title) {
  const products = appDataService.listActiveCatalog(category).slice(0, 20);
  const orders = appDataService.listOrders(userId, 5);
  const lines = [
    '🛍️ <b>' + escapeHtml(title) + '</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    products.length
      ? 'Chọn sản phẩm bên dưới để tạo yêu cầu đặt dịch vụ:'
      : 'Hiện chưa có sản phẩm nào được Admin đăng bán.',
    '',
    '<b>ĐƠN GẦN ĐÂY</b>',
    ...(orders.length
      ? orders.map(item =>
        '• ' + escapeHtml(item.itemName) + ' — ' + money(item.amount) +
        ' · ' + (item.status === 'pending' ? 'Chờ duyệt' : item.status === 'approved' ? 'Đã duyệt' : 'Từ chối')
      )
      : ['Chưa có đơn hàng.'])
  ];
  return editOrReply(
    ctx,
    lines.join('\n'),
    products.length ? categoryKeyboard(products, userId) : homeKeyboard(userId)
  );
}

async function openMemberSection(ctx, action) {
  const userId = String(ctx.from.id);
  const user = userService.getUser(userId) || userService.initUser(userId, ctx.from);
  const settings = appDataService.getPaymentSettings();

  if (action === 'home') {
    pendingInputs.delete(userId);
    return editOrReply(ctx, getWelcomeText(user, userId), mainMenu(userId));
  }

  if (action === 'live') {
    const accounts = appDataService.listLinkedAccounts(userId);
    const rows = accounts.map(item => [
      Markup.button.callback('🗑 ' + item.brand + ' · ' + item.username, 'member:link-delete:' + item.id)
    ]);
    rows.push([Markup.button.callback('➕ LIÊN KẾT TÀI KHOẢN', 'member:link-new')]);
    rows.push([Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]);
    return editOrReply(ctx, [
      '🚀 <b>MINIGAME LIVE · QUẢN LÝ TÀI KHOẢN</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      'Tài khoản đã liên kết: <b>' + accounts.length + '/10</b>',
      '',
      ...(accounts.length
        ? accounts.map((item, index) => (index + 1) + '. <b>' + escapeHtml(item.brand) + '</b> · ' + escapeHtml(item.username) + ' · ' + dateText(item.createdAt))
        : ['Bạn chưa liên kết tài khoản nào.']),
      '',
      'Thông tin mật khẩu không hiển thị trong danh sách.'
    ].join('\n'), Markup.inlineKeyboard(rows));
  }

  if (action === 'tools') return showCatalog(ctx, userId, 'tool', 'THUÊ TOOL');
  if (action === 'codes') return showCatalog(ctx, userId, 'code', 'MUA LÌ XÌ · CODE MÀN · CODE TELE');
  if (action === 'otp') return showCatalog(ctx, userId, 'otp_proxy', 'OTP & PROXY');
  if (action === 'viptools') return showCatalog(ctx, userId, 'tool', 'KHO CÔNG CỤ ĐẶC QUYỀN');
  if (action === 'duel') return showCatalog(ctx, userId, 'duel', 'HỆ THỐNG GHÉP ĐỐI ĐẦU');

  if (action === 'wallet') {
    const pending = appDataService.listDeposits(userId).filter(item => item.status === 'pending').length;
    const presetAmounts = [10000, 20000, 50000, 100000, 200000, 500000]
      .filter(amount => amount >= settings.minDeposit);
    const buttons = [];
    for (let index = 0; index < presetAmounts.length; index += 2) {
      buttons.push(presetAmounts.slice(index, index + 2).map(amount =>
        Markup.button.callback(money(amount), 'member:deposit:' + amount)
      ));
    }
    buttons.push([Markup.button.callback('✍️ NHẬP SỐ TIỀN KHÁC', 'member:deposit-custom')]);
    buttons.push([Markup.button.callback('📜 LỊCH SỬ GIAO DỊCH', 'member:deposit-history')]);
    buttons.push([Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]);
    return editOrReply(ctx, [
      '💳 <b>VÍ ĐIỆN TỬ</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      'Số dư hiện tại: <b>' + money(user.balance) + '</b>',
      'Yêu cầu nạp đang chờ: <b>' + pending + '</b>',
      'Mức nạp tối thiểu: <b>' + money(settings.minDeposit) + '</b>',
      '',
      'Chọn số tiền cần nạp. Bot sẽ tạo mã tham chiếu và QR theo cấu hình nhận tiền.'
    ].join('\n'), Markup.inlineKeyboard(buttons));
  }

  if (action === 'deposit-history') {
    const deposits = appDataService.listDeposits(userId).slice(0, 10);
    return editOrReply(ctx, [
      '📜 <b>LỊCH SỬ NẠP TIỀN</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      ...(deposits.length ? deposits.map(item =>
        '• <b>' + money(item.amount) + '</b> · ' + escapeHtml(item.reference) +
        '\n  ' + dateText(item.createdAt) + ' · ' +
        (item.status === 'pending' ? 'Chờ xác nhận' : item.status === 'paid' ? 'Đã cộng tiền' : item.status === 'rejected' ? 'Từ chối' : item.status)
      ) : ['Chưa có giao dịch nạp tiền.'])
    ].join('\n'), Markup.inlineKeyboard([
      [Markup.button.callback('💳 TẠO YÊU CẦU NẠP', 'member:wallet')],
      [Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]
    ]));
  }

  if (action === 'customer') {
    const overview = appDataService.getOverview(userId, user);
    const activity = appDataService.getActivity(userId, 6);
    return editOrReply(ctx, [
      '💎 <b>TRUNG TÂM KHÁCH HÀNG</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      'Thành viên: <b>' + escapeHtml(user.name) + '</b>',
      'Telegram ID: <code>' + userId + '</code>',
      'Username: ' + escapeHtml(user.username ? '@' + user.username : '—'),
      'Số dư: <b>' + money(user.balance) + '</b>',
      'VIP: <b>' + Number(user.vipLevel || 0) + '</b>',
      'Tài khoản liên kết: <b>' + overview.counts.linkedAccounts + '</b>',
      '',
      '<b>HOẠT ĐỘNG GẦN ĐÂY</b>',
      ...(activity.length ? activity.map(item =>
        '• ' + escapeHtml(item.title) + ' · ' + dateText(item.createdAt)
      ) : ['Chưa có hoạt động.'])
    ].join('\n'), Markup.inlineKeyboard([
      [Markup.button.callback('🧑‍💻 GỬI YÊU CẦU CSKH', 'member:support')],
      [Markup.button.callback('📜 LỊCH SỬ ĐƠN HÀNG', 'member:orders')],
      [Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]
    ]));
  }

  if (action === 'orders') {
    const orders = appDataService.listOrders(userId, 20);
    return editOrReply(ctx, [
      '📦 <b>LỊCH SỬ ĐƠN HÀNG</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      ...(orders.length ? orders.map(item =>
        '• <b>' + escapeHtml(item.itemName) + '</b> · ' + money(item.amount) +
        '\n  ' + dateText(item.createdAt) + ' · ' +
        (item.status === 'pending' ? 'Chờ xử lý' : item.status === 'approved' ? 'Đã duyệt' : 'Từ chối') +
        (item.expiresAt ? ' · Hết hạn: ' + dateText(item.expiresAt) : '')
      ) : ['Bạn chưa có đơn hàng.'])
    ].join('\n'), homeKeyboard(userId));
  }

  if (action === 'vip') {
    const levels = [
      'VIP 0 · Thành viên thường',
      'VIP 1 · Ưu tiên hỗ trợ theo chính sách',
      'VIP 2 · Ưu tiên xử lý theo chính sách',
      'VIP 3 · Đặc quyền theo chính sách'
    ];
    const packages = appDataService.listActiveCatalog('vip').slice(0, 10);
    const rows = packages.map(item => [
      Markup.button.callback(
        (item.name + ' · ' + money(item.price)).slice(0, 60),
        'member:order:' + item.id
      )
    ]);
    rows.push([Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]);
    return editOrReply(ctx, [
      '👑 <b>TRUNG TÂM VIP</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      'Cấp hiện tại: <b>VIP ' + Number(user.vipLevel || 0) + '</b>',
      '',
      ...levels,
      '',
      '<b>GÓI NÂNG CẤP</b>',
      ...(packages.length ? packages.map(item =>
        '• ' + escapeHtml(item.name) + ' — ' + money(item.price)
      ) : ['Chưa có gói VIP.'])
    ].join('\n'), Markup.inlineKeyboard(rows));
  }

  if (action === 'ref') {
    const username = String(bot?.botInfo?.username || process.env.BOT_USERNAME || '').replace(/^@/, '');
    const referralLink = /^[a-zA-Z0-9_]{5,32}$/.test(username)
      ? 'https://t.me/' + username + '?start=ref_' + userId
      : null;
    const stats = appDataService.getReferralStats(userId);
    const rows = [];
    if (referralLink) {
      rows.push([Markup.button.url('🔗 CHIA SẺ LINK GIỚI THIỆU', referralLink)]);
    }
    rows.push([Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]);
    return editOrReply(ctx, [
      '🎊 <b>CHƯƠNG TRÌNH GIỚI THIỆU REF</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      'Mã giới thiệu: <code>ref_' + userId + '</code>',
      referralLink ? 'Liên kết: ' + escapeHtml(referralLink) : 'Admin chưa cấu hình BOT_USERNAME.',
      'Số thành viên đã mời: <b>' + stats.invited + '</b>',
      'Hoa hồng tích lũy: <b>' + money(stats.commission) + '</b>',
      'Tỷ lệ hiện tại: <b>' + Number(settings.referralCommissionPercent || 0) + '%</b>'
    ].join('\n'), Markup.inlineKeyboard(rows));
  }

  if (action === 'gift') {
    setPending(userId, { type: 'giftcode' });
    return editOrReply(ctx, [
      '🎟️ <b>NHẬP GIFTCODE</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      'Gửi mã giftcode vào khung chat này.',
      'Mã được kiểm tra ngay trong Bot. Bạn có 10 phút để nhập.',
      'Dùng /cancel để hủy.'
    ].join('\n'), Markup.inlineKeyboard([
      [Markup.button.callback('❌ HỦY', 'member:home')]
    ]));
  }

  if (action === 'support') {
    setPending(userId, { type: 'support' });
    return editOrReply(ctx, [
      '🧑‍💻 <b>LIÊN HỆ CSKH</b>',
      '━━━━━━━━━━━━━━━━━━━━',
      'Gửi nội dung cần hỗ trợ vào khung chat này (5–2.000 ký tự).',
      'Bot sẽ tạo ticket và chuyển yêu cầu tới bộ phận quản trị.',
      'Dùng /cancel để hủy.'
    ].join('\n'), Markup.inlineKeyboard([
      [Markup.button.callback('❌ HỦY', 'member:home')]
    ]));
  }

  if (action === 'group' || action === 'news') {
    const url = action === 'group' ? settings.groupChatUrl : settings.newsChannelUrl;
    const label = action === 'group' ? 'NHÓM CHAT' : 'KÊNH THÔNG BÁO';
    if (!url) {
      return editOrReply(ctx, '🔗 <b>' + label + '</b>\nAdmin chưa cấu hình liên kết.', homeKeyboard(userId));
    }
    return editOrReply(ctx, '🔗 <b>' + label + '</b>\nNhấn nút bên dưới để mở Telegram.', Markup.inlineKeyboard([
      [Markup.button.url('MỞ ' + label, url)],
      [Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]
    ]));
  }

  if (action === 'admin-unavailable') {
    return editOrReply(ctx, '🛡️ Admin cần cấu hình MINI_APP_URL trên Render.', homeKeyboard(userId));
  }

  return editOrReply(ctx, 'Chức năng chưa được hỗ trợ.', homeKeyboard(userId));
}

function setupBot(instance) {
  instance.use(async (ctx, next) => {
    if (!ctx.callbackQuery) return next();
    const userId = String(ctx.from?.id || '');
    const now = Date.now();
    const lastAction = cooldowns.get(userId) || 0;
    if (now - lastAction < 400) {
      await ctx.answerCbQuery('Vui lòng thao tác chậm lại.').catch(() => {});
      return;
    }
    cooldowns.set(userId, now);
    return next();
  });

  instance.start(async ctx => {
    const chatId = String(ctx.from.id);
    const isFirstVisit = !userService.getUser(chatId);
    const user = userService.initUser(chatId, ctx.from);
    const payload = String(ctx.startPayload || '');
    const referralMatch = payload.match(/^ref_(\d{1,20})$/);
    if (isFirstVisit && referralMatch && userService.getUser(referralMatch[1])) {
      const registered = await appDataService.registerReferral(referralMatch[1], chatId);
      if (registered) console.info('[REF] Đã ghi nhận lượt giới thiệu cho ID ' + referralMatch[1] + '.');
    }
    await ctx.reply(getWelcomeText(user, chatId), {
      parse_mode: 'HTML',
      ...mainMenu(chatId)
    });
  });

  instance.command('menu', async ctx => {
    const userId = String(ctx.from.id);
    pendingInputs.delete(userId);
    const user = userService.getUser(userId) || userService.initUser(userId, ctx.from);
    await ctx.reply(getWelcomeText(user, userId), {
      parse_mode: 'HTML',
      ...mainMenu(userId)
    });
  });

  instance.command('cancel', async ctx => {
    const userId = String(ctx.from.id);
    pendingInputs.delete(userId);
    return ctx.reply('Đã hủy thao tác đang thực hiện.', mainMenu(userId));
  });

  instance.command('admin', requireAdmin, ctx => ctx.reply(
    [
      '🛡️ <b>HENDY ADMIN CENTER</b>',
      'Chọn nút bên dưới để mở bảng điều khiển quản trị.',
      '',
      '/status — Trạng thái hệ thống',
      '/user ID — Thông tin thành viên',
      '/addmoney ID SỐ_TIỀN — Điều chỉnh số dư',
      '/broadcast NỘI_DUNG — Gửi thông báo'
    ].join('\n'),
    {
      parse_mode: 'HTML',
      ...(getMiniAppUrl('admin') ? Markup.inlineKeyboard([
        [Markup.button.webApp('🛡️ MỞ ADMIN CENTER', getMiniAppUrl('admin'))]
      ]) : {})
    }
  ));

  instance.command('status', requireAdmin, ctx => {
    const memoryMb = Math.round(process.memoryUsage().rss / 1048576);
    const userCount = Object.keys(userService.getUsers()).length;
    const accountCount = userCount
      ? Object.keys(userService.getUsers()).reduce(
        (total, id) => total + appDataService.listLinkedAccounts(id).length, 0
      )
      : 0;
    const adminOverview = appDataService.getAdminOverview(userService.getUsers());

    return ctx.reply([
      '⚙️ <b>TRẠNG THÁI HỆ THỐNG</b>',
      '🤖 Bot: ' + (botReady ? 'Đang chạy' : 'Chưa sẵn sàng'),
      '👥 Thành viên: ' + userCount,
      '🔗 Tài khoản liên kết: ' + accountCount,
      '💳 Nạp chờ duyệt: ' + adminOverview.totals.pendingDeposits,
      '📦 Đơn chờ xử lý: ' + adminOverview.totals.pendingOrders,
      '🧠 RAM: ' + memoryMb + ' MB'
    ].join('\n'), { parse_mode: 'HTML' });
  });

  instance.command('user', requireAdmin, ctx => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const targetId = parts[1];
    if (!targetId) return ctx.reply('Cú pháp: /user ID');

    const user = userService.getUser(targetId);
    if (!user) return ctx.reply('Không tìm thấy thành viên này.');

    return ctx.reply([
      '👤 <b>THÔNG TIN THÀNH VIÊN</b>',
      'ID: <code>' + escapeHtml(targetId) + '</code>',
      'Tên: ' + escapeHtml(user.name),
      'Username: ' + escapeHtml(user.username ? '@' + user.username : '—'),
      'Số dư: ' + money(user.balance),
      'VIP: ' + Number(user.vipLevel || 0),
      'Tài khoản liên kết: ' + appDataService.listLinkedAccounts(targetId).length
    ].join('\n'), { parse_mode: 'HTML' });
  });

  instance.command('addmoney', requireAdmin, async ctx => {
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length !== 3) return ctx.reply('Cú pháp: /addmoney ID SỐ_TIỀN');
    const targetId = parts[1];
    const amountText = parts[2];
    if (!/^-?\d+$/.test(amountText)) return ctx.reply('Số tiền phải là số nguyên.');

    const amount = Number(amountText);
    const user = userService.getUser(targetId);
    if (!user || !Number.isSafeInteger(amount) || amount === 0) {
      return ctx.reply('ID thành viên hoặc số tiền không hợp lệ.');
    }
    const nextBalance = Number(user.balance || 0) + amount;
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
      return ctx.reply('Số dư mới không hợp lệ hoặc không thể nhỏ hơn 0.');
    }

    user.balance = nextBalance;
    await userService.saveDatabase();
    await ctx.reply(
      '✅ Đã cập nhật số dư thành viên ' + escapeHtml(targetId) +
      '. Số dư mới: <b>' + money(nextBalance) + '</b>.',
      { parse_mode: 'HTML' }
    );
    await instance.telegram.sendMessage(
      targetId,
      '💰 Số dư tài khoản vừa được điều chỉnh: ' +
      (amount > 0 ? '+' : '') + money(amount) + '.\n' +
      'Số dư hiện tại: ' + money(nextBalance) + '.'
    ).catch(() => {});
  });

  instance.command('broadcast', requireAdmin, async ctx => {
    const message = ctx.message.text.replace(/^\/broadcast(?:@\w+)?\s*/i, '').trim();
    if (!message) return ctx.reply('Cú pháp: /broadcast nội dung');
    if (message.length > 3500) return ctx.reply('Nội dung thông báo quá dài.');

    const result = await broadcastToUsers(message);
    return ctx.reply(
      '📢 Hoàn tất gửi thông báo.\nTổng: ' + result.total +
      '\nThành công: ' + result.sent + '\nThất bại: ' + result.failed
    );
  });

  instance.action(/^member:(.+)$/, async ctx => {
    const userId = String(ctx.from.id);
    const action = String(ctx.match?.[1] || '');
    try {
      await ctx.answerCbQuery().catch(() => {});
      if (['home', 'live', 'wallet'].includes(action)) pendingInputs.delete(userId);

      if (action.startsWith('link-delete:')) {
        const id = action.slice('link-delete:'.length);
        const removed = await appDataService.deleteLinkedAccount(userId, id);
        return editOrReply(
          ctx,
          removed ? '✅ Đã xóa tài khoản liên kết.' : 'Không tìm thấy tài khoản cần xóa.',
          Markup.inlineKeyboard([[Markup.button.callback('↩️ QUẢN LÝ TÀI KHOẢN', 'member:live')]])
        );
      }

      if (action.startsWith('link-brand:')) {
        const brand = action.slice('link-brand:'.length).toUpperCase();
        if (!ALLOWED_BRANDS.includes(brand)) return ctx.reply('Nhà cung cấp không hợp lệ.');
        setPendingStep(userId, { type: 'link-username', brand });
        return editOrReply(ctx,
          '🔐 <b>LIÊN KẾT ' + escapeHtml(brand) + '</b>\nGửi tên đăng nhập tài khoản vào khung chat.\nDùng /cancel để hủy.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ HỦY', 'member:live')]])
        );
      }

      if (action === 'link-new') {
        const existing = appDataService.listLinkedAccounts(userId);
        if (existing.length >= 10) {
          return editOrReply(ctx, 'Bạn đã đạt giới hạn 10 tài khoản liên kết.', homeKeyboard(userId));
        }
        const rows = ALLOWED_BRANDS.map(brand => [
          Markup.button.callback(brand, 'member:link-brand:' + brand)
        ]);
        rows.push([Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]);
        return editOrReply(ctx,
          '🔐 <b>CHỌN NHÀ CUNG CẤP</b>\nChọn thương hiệu tài khoản bạn muốn liên kết:',
          Markup.inlineKeyboard(rows)
        );
      }

      if (action.startsWith('deposit:')) {
        const amount = Number(action.slice('deposit:'.length));
        return showDeposit(ctx, userId, amount);
      }

      if (action === 'deposit-custom') {
        setPending(userId, { type: 'deposit-custom' });
        return editOrReply(ctx,
          '✍️ <b>NHẬP SỐ TIỀN NẠP</b>\nGửi số tiền bằng VNĐ (chỉ nhập chữ số). Dùng /cancel để hủy.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ HỦY', 'member:wallet')]])
        );
      }

      if (action.startsWith('order:')) {
        const itemId = action.slice('order:'.length);
        const product = appDataService.listActiveCatalog().find(item => item.id === itemId);
        if (!product) return editOrReply(ctx, 'Sản phẩm không còn khả dụng.', homeKeyboard(userId));
        const result = await appDataService.createOrder(userId, itemId);
        if (result.error) {
          return editOrReply(ctx,
            result.error === 'out_of_stock' ? 'Sản phẩm đã hết hàng.' : 'Không thể tạo đơn hàng.',
            homeKeyboard(userId)
          );
        }
        return editOrReply(ctx, [
          '✅ <b>ĐÃ TẠO YÊU CẦU ĐẶT DỊCH VỤ</b>',
          '━━━━━━━━━━━━━━━━━━━━',
          'Sản phẩm: <b>' + escapeHtml(result.itemName) + '</b>',
          'Giá: <b>' + money(result.amount) + '</b>',
          'Mã đơn: <code>' + escapeHtml(result.id) + '</code>',
          'Trạng thái: <b>Chờ Admin xử lý</b>',
          'Đơn chỉ trừ số dư khi được duyệt.'
        ].join('\n'), Markup.inlineKeyboard([
          [Markup.button.callback('📦 LỊCH SỬ ĐƠN HÀNG', 'member:orders')],
          [Markup.button.callback('🏠 MENU CHÍNH', 'member:home')]
        ]));
      }

      if (action === 'link-new' || action.startsWith('link-brand:')) return;
      return openMemberSection(ctx, action);
    } catch (error) {
      console.error('[BOT] Lỗi thao tác thành viên:', formatTelegramError(error));
      return ctx.reply('Không thể hoàn tất thao tác. Vui lòng thử lại hoặc dùng /menu.');
    }
  });

  instance.on('text', async ctx => {
    const userId = String(ctx.from.id);
    const pending = pendingInputs.get(userId);
    if (!pending) return;
    if (ctx.message.text.startsWith('/')) return;
    if (Date.now() > pending.expiresAt) {
      pendingInputs.delete(userId);
      return ctx.reply('Phiên nhập liệu đã hết hạn. Hãy mở lại chức năng từ /menu.');
    }

    const rawValue = String(ctx.message.text || '');
    const value = rawValue.trim();
    if (!value) return ctx.reply('Nội dung không được để trống.');

    if (pending.type === 'link-username') {
      if (value.length < 2 || value.length > 80) {
        return ctx.reply('Tên đăng nhập phải từ 2 đến 80 ký tự. Hãy nhập lại.');
      }
      setPendingStep(userId, { type: 'link-password', brand: pending.brand, username: value });
      return ctx.reply(
        '🔒 Gửi mật khẩu tài khoản ' + pending.brand + ' vào đây.\nBot sẽ xóa tin nhắn chứa mật khẩu sau khi nhận được (nếu Telegram cho phép).',
        Markup.forceReply()
      );
    }

    if (pending.type === 'link-password') {
      pendingInputs.delete(userId);
      await ctx.deleteMessage().catch(() => {});
      if (rawValue.length > 256) return ctx.reply('Mật khẩu quá dài. Hãy liên kết lại và nhập mật khẩu dưới 256 ký tự.');
      try {
        await appDataService.addLinkedAccount(userId, {
          brand: pending.brand,
          username: pending.username,
          miniCode: pending.username,
          encryptedPassword: encryptSecret(rawValue)
        });
        return ctx.reply(
          '✅ Đã liên kết tài khoản <b>' + escapeHtml(pending.brand) +
          '</b> · ' + escapeHtml(pending.username) + '. Mật khẩu đã được mã hóa.',
          { parse_mode: 'HTML', ...homeKeyboard(userId) }
        );
      } catch (error) {
        console.error('[BOT] Không lưu được tài khoản liên kết:', error.message);
        return ctx.reply('Không thể lưu tài khoản. Hãy thử lại sau.');
      }
    }

    if (pending.type === 'deposit-custom') {
      const amount = Number(value.replace(/[,. ]/g, ''));
      if (!/^\d+$/.test(value.replace(/[,. ]/g, '')) || !Number.isSafeInteger(amount)) {
        return ctx.reply('Số tiền phải là số nguyên dương. Hãy nhập lại hoặc /cancel.');
      }
      pendingInputs.delete(userId);
      return showDeposit(ctx, userId, amount);
    }

    if (pending.type === 'giftcode') {
      pendingInputs.delete(userId);
      const user = userService.getUser(userId) || userService.initUser(userId, ctx.from);
      const result = await appDataService.redeemGiftcode(userId, value);
      const messages = {
        invalid: 'Giftcode không tồn tại hoặc đã bị tắt.',
        expired: 'Giftcode đã hết hạn.',
        exhausted: 'Giftcode đã hết lượt sử dụng.',
        used: 'Bạn đã sử dụng giftcode này.'
      };
      if (result.error) return ctx.reply('❌ ' + (messages[result.error] || 'Không thể đổi giftcode.'));
      if (result.rewardType === 'balance') {
        user.balance = Number(user.balance || 0) + result.rewardValue;
      } else {
        user.vipLevel = Math.max(Number(user.vipLevel || 0), result.rewardValue);
      }
      await userService.saveDatabase();
      return ctx.reply(
        result.rewardType === 'balance'
          ? '🎉 Giftcode hợp lệ! Ví được cộng ' + money(result.rewardValue) + '.\nSố dư mới: ' + money(user.balance)
          : '🎉 Giftcode hợp lệ! Bạn được nâng lên VIP ' + user.vipLevel + '.',
        homeKeyboard(userId)
      );
    }

    if (pending.type === 'support') {
      pendingInputs.delete(userId);
      if (value.length < 5 || value.length > 2000) {
        pendingInputs.set(userId, pending);
        return ctx.reply('Nội dung hỗ trợ phải từ 5 đến 2.000 ký tự. Hãy nhập lại.');
      }
      const ticket = await appDataService.createTicket(userId, value);
      if (currentAdminId) {
        await instance.telegram.sendMessage(
          currentAdminId,
          '🧑‍💻 <b>YÊU CẦU CSKH MỚI</b>\nUID: <code>' + userId +
          '</code>\nTicket: <code>' + ticket.id + '</code>\n\n' + escapeHtml(value),
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
      return ctx.reply('✅ Đã gửi yêu cầu hỗ trợ. Mã ticket: ' + ticket.id.slice(0, 8) + '. Admin sẽ phản hồi qua bot.', homeKeyboard(userId));
    }
  });
}

async function startBot(token = process.env.BOT_TOKEN, configuredAdmin = process.env.ADMIN_ID) {
  if (bot && botReady) return true;
  if (!token) {
    console.error('[BOT] BOT_TOKEN chưa được cấu hình.');
    return false;
  }

  currentAdminId = String(configuredAdmin || '');
  const instance = new Telegraf(token);
  setupBot(instance);

  try {
    const botInfo = await runWithTelegramRetry(
      () => instance.telegram.getMe(),
      {
        attempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 8000,
        onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
          console.warn(
            '[BOT] Kết nối Telegram thất bại (' + attempt + '/' + maxAttempts +
            '): ' + formatTelegramError(error) +
            '. Thử lại sau ' + delayMs + ' ms.'
          );
        }
      }
    );

    instance.botInfo = botInfo;
    bot = instance;
    botReady = true;

    instance.launch({ dropPendingUpdates: true }).catch(error => {
      console.error('[BOT] Telegram polling dừng:', formatTelegramError(error));
      if (bot === instance) {
        bot = null;
        botReady = false;
      }
    });

    console.log('[BOT] Đã xác thực và khởi chạy @' + (botInfo.username || 'unknown') + '.');
    return true;
  } catch (error) {
    bot = null;
    botReady = false;
    console.error('[BOT] Không khởi chạy được Telegram Bot:', formatTelegramError(error));
    return false;
  }
}

function stopBot() {
  const current = bot;
  bot = null;
  botReady = false;
  pendingInputs.clear();
  cooldowns.clear();
  if (current) {
    try {
      current.stop('SIGTERM');
    } catch (error) {
      console.warn('[BOT] Không thể dừng bot một cách sạch sẽ:', formatTelegramError(error));
    }
  }
}

async function sendUserMessage(userId, message) {
  if (!bot || !botReady) return false;
  await bot.telegram.sendMessage(String(userId), String(message).slice(0, 3500));
  return true;
}

async function broadcastToUsers(message) {
  if (!bot || !botReady) throw new Error('Telegram Bot chưa sẵn sàng.');
  const users = Object.keys(userService.getUsers());
  let sent = 0;
  let failed = 0;
  for (const userId of users) {
    try {
      await bot.telegram.sendMessage(userId, String(message).slice(0, 3500));
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { total: users.length, sent, failed };
}

module.exports = {
  startBot,
  stopBot,
  sendUserMessage,
  broadcastToUsers,
  mainMenu,
  isRunning: () => Boolean(bot && botReady)
};
