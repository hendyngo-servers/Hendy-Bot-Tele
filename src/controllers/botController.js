const { Telegraf, Markup } = require('telegraf');
const userService = require('../services/userService');
const appDataService = require('../services/appDataService');
const {
  runWithTelegramRetry,
  formatTelegramError
} = require('../services/telegramStartup');

let bot = null;
let botReady = false;
let currentAdminId = String(process.env.ADMIN_ID || '');
const cooldowns = new Map();

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function getWelcomeText(user, chatId) {
  const linkedCount = appDataService.listLinkedAccounts(chatId).length;
  return [
    '🤖 <b>HENDY BOT | HENDY CYBERTECH</b>',
    'Xin chào <b>' + escapeHtml(user.name) + '</b>!',
    '🆔 ID Telegram: <code>' + escapeHtml(chatId) + '</code>',
    '━━━━━━━━━━━━━━━━━━━━',
    '💰 Ví chính: <b>' + Number(user.balance || 0).toLocaleString('vi-VN') + ' VNĐ</b>',
    '👑 Cấp thành viên: <b>VIP ' + Number(user.vipLevel || 0) + '</b>',
    '🔗 Tài khoản đã liên kết: <b>' + linkedCount + '</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    'Chọn khu vực bên dưới để tiếp tục.'
  ].join('\n');
}

function getMiniAppUrl(mode = 'accounts') {
  const configured = String(process.env.MINI_APP_URL || '').trim();
  if (!/^https:\/\//i.test(configured)) return null;
  try {
    const url = new URL(configured);
    url.searchParams.set('mode', mode);
    return url.toString();
  } catch {
    return null;
  }
}

function mainMenu(userId) {
  const accountUrl = getMiniAppUrl('accounts');
  const rows = [];

  if (accountUrl) {
    rows.push([Markup.button.webApp('🔐 TRUNG TÂM QUẢN LÝ TÀI KHOẢN', accountUrl)]);
  } else {
    rows.push([Markup.button.callback('🔐 TRUNG TÂM QUẢN LÝ TÀI KHOẢN', 'mini_missing')]);
  }

  if (currentAdminId && String(userId) === currentAdminId) {
    const adminUrl = getMiniAppUrl('admin');
    if (adminUrl) {
      rows.push([Markup.button.webApp('🛡️ ĐĂNG NHẬP ADMIN', adminUrl)]);
    }
  }

  rows.push([Markup.button.callback('📖 HƯỚNG DẪN SỬ DỤNG', 'guide_detail')]);
  return Markup.inlineKeyboard(rows);
}

function requireAdmin(ctx, next) {
  if (!currentAdminId || String(ctx.from?.id) !== currentAdminId) {
    return ctx.reply('⛔ Bạn không có quyền quản trị.');
  }
  return next();
}

function setupBot(instance) {
  instance.use(async (ctx, next) => {
    if (!ctx.callbackQuery) return next();
    const userId = String(ctx.from?.id || '');
    const now = Date.now();
    const lastAction = cooldowns.get(userId) || 0;
    if (now - lastAction < 900) {
      await ctx.answerCbQuery('Vui lòng thao tác chậm lại.').catch(() => {});
      return;
    }
    cooldowns.set(userId, now);
    return next();
  });

  instance.start(async ctx => {
    const chatId = String(ctx.from.id);
    const user = userService.initUser(chatId, ctx.from);
    console.info('[BOT] Người dùng ' + chatId + ' đã mở bot.');
    await ctx.reply(getWelcomeText(user, chatId), {
      parse_mode: 'HTML',
      ...mainMenu(chatId)
    });
  });

  instance.command('admin', requireAdmin, ctx => ctx.reply(
    [
      '🛠️ <b>BẢNG QUẢN TRỊ HỆ THỐNG</b>',
      '/status — Trạng thái hệ thống',
      '/user ID — Thông tin thành viên',
      '/addmoney ID SỐ_TIỀN — Điều chỉnh số dư',
      '/broadcast NỘI_DUNG — Gửi thông báo'
    ].join('\n'),
    { parse_mode: 'HTML' }
  ));

  instance.command('status', requireAdmin, ctx => {
    const memoryMb = Math.round(process.memoryUsage().rss / 1048576);
    const userCount = Object.keys(userService.getUsers()).length;
    const accountCount = Object.keys(userService.getUsers())
      .reduce((total, id) => total + appDataService.listLinkedAccounts(id).length, 0);

    return ctx.reply([
      '⚙️ <b>TRẠNG THÁI HỆ THỐNG</b>',
      '🤖 Bot: ' + (botReady ? 'Đang chạy' : 'Chưa sẵn sàng'),
      '👥 Thành viên: ' + userCount,
      '🔗 Tài khoản liên kết: ' + accountCount,
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
      'Số dư: ' + Number(user.balance || 0).toLocaleString('vi-VN') + ' VNĐ',
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
      '. Số dư mới: <b>' + nextBalance.toLocaleString('vi-VN') + ' VNĐ</b>.',
      { parse_mode: 'HTML' }
    );
    await instance.telegram.sendMessage(
      targetId,
      '💰 Số dư tài khoản của bạn vừa được điều chỉnh: ' +
      (amount > 0 ? '+' : '') + amount.toLocaleString('vi-VN') + ' VNĐ.\n' +
      'Số dư hiện tại: ' + nextBalance.toLocaleString('vi-VN') + ' VNĐ.'
    ).catch(() => {});
  });

  instance.command('broadcast', requireAdmin, async ctx => {
    const message = ctx.message.text.replace(/^\/broadcast(?:@\w+)?\s*/i, '').trim();
    if (!message) return ctx.reply('Cú pháp: /broadcast nội dung');
    if (message.length > 3500) return ctx.reply('Nội dung thông báo quá dài.');

    let sent = 0;
    let failed = 0;
    for (const userId of Object.keys(userService.getUsers())) {
      try {
        await instance.telegram.sendMessage(userId, '📢 THÔNG BÁO TỪ HỆ THỐNG\n\n' + message);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    return ctx.reply('Đã gửi: ' + sent + ' · Không gửi được: ' + failed + '.');
  });

  instance.action('mini_missing', ctx =>
    ctx.answerCbQuery('Quản trị viên chưa cấu hình MINI_APP_URL.', { show_alert: true })
  );

  instance.action('guide_detail', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      '📖 <b>HƯỚNG DẪN</b>\n' +
      '1. Mở TRUNG TÂM QUẢN LÝ TÀI KHOẢN trong Mini App.\n' +
      '2. Chọn nhà cung cấp và nhập thông tin tài khoản cần liên kết.\n' +
      '3. Mật khẩu được mã hóa ở máy chủ trước khi lưu.\n' +
      '4. Chỉ quản trị viên có Telegram ID được cấu hình trong ADMIN_ID mới thấy và vào được khu vực Admin.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.webApp(
          '🔐 MỞ TRUNG TÂM QUẢN LÝ TÀI KHOẢN',
          getMiniAppUrl('accounts') || 'https://example.invalid'
        )]
      ]) }
    );
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
  if (current) {
    try {
      current.stop('SIGTERM');
    } catch (error) {
      console.warn('[BOT] Không thể dừng bot một cách sạch sẽ:', formatTelegramError(error));
    }
  }
}

module.exports = {
  startBot,
  stopBot,
  isRunning: () => Boolean(bot && botReady)
};
