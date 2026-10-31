const { Telegraf, Markup } = require('telegraf');
const userService = require('../services/userService');
const appDataService = require('../services/appDataService');
const {
  runWithTelegramRetry,
  formatTelegramError
} = require('../services/telegramStartup');

let bot = null;
let adminId = null;
const cooldowns = new Map();

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const styled = (button, style) => ({ ...button, style });
const callbackButton = (text, action, style = 'primary') =>
  styled(Markup.button.callback(text, action), style);
const urlButton = (text, target, style = 'success') =>
  styled(Markup.button.url(text, target), style);

function miniAppButton() {
  const target = process.env.MINI_APP_URL;
  return target && /^https:\/\//i.test(target)
    ? [styled(Markup.button.webApp('🚀 MỞ HENDY MINI APP', target), 'primary')]
    : [callbackButton('🚀 MINI APP CHƯA CẤU HÌNH', 'mini_missing', 'primary')];
}

function mainMenu() {
  return Markup.inlineKeyboard([
    miniAppButton(),
    [
      callbackButton(' 🚀 MINIGAME LIVE', 'live', 'danger'),
      callbackButton(' 🧰 THUÊ TOOL', 'unconfigured', 'primary')
    ],
    [callbackButton(' 🎁 MUA LÌ XÌ · CODE', 'catalog', 'success')],
    [
      callbackButton(' 💳 NẠP TIỀN', 'deposit', 'danger'),
      callbackButton(' ⚙️ OTP & PROXY', 'unconfigured', 'primary')
    ],
    [callbackButton('🏆 VIP KHO CÔNG CỤ ĐẶC QUYỀN', 'unconfigured', 'success')],
    [callbackButton('💎 TRUNG TÂM KHÁCH HÀNG', 'customer', 'primary')],
    [callbackButton('⚔️ HỆ THỐNG GHÉP ĐỐI ĐẦU', 'unconfigured', 'danger')],
    [
      callbackButton('👥 GIỚI THIỆU REF', 'unconfigured', 'primary'),
      callbackButton('👑 VIP TRUNG TÂM VIP', 'unconfigured', 'success')
    ],
    [
      urlButton('👥 NHÓM CHAT', 'https://t.me/lethituanem_nhomchat', 'success'),
      callbackButton('📢 KÊNH THÔNG BÁO', 'unconfigured', 'success')
    ],
    [
      callbackButton('🎟️ NHẬP GIFTCODE', 'unconfigured', 'danger'),
      callbackButton('🧑‍💻 LIÊN HỆ CSKH', 'customer', 'success')
    ]
  ]);
}

function welcomeText(user, chatId) {
  return [
    '🤖 <b>HENDY BOT TELEGRAM</b>',
    'Chào mừng <b>' + escapeHtml(user.name) + '</b>!',
    '🆔 ID: <code>' + escapeHtml(chatId) + '</code>',
    '',
    '💰 Số dư: <b>' + Number(user.balance || 0).toLocaleString('vi-VN') + ' VNĐ</b>',
    '👑 Cấp VIP: <b>' + Number(user.vipLevel || 0) + '</b>',
    '',
    'Chọn chức năng hoặc mở Mini App.'
  ].join('\n');
}

function requireAdmin(ctx, next) {
  if (!adminId || String(ctx.from?.id) !== String(adminId)) {
    return ctx.reply('⛔ Bạn không có quyền sử dụng lệnh này.');
  }
  return next();
}

function setupBot(instance) {
  instance.use(async (ctx, next) => {
    if (!ctx.callbackQuery) return next();
    const userId = String(ctx.from?.id || '');
    const now = Date.now();
    if (now - (cooldowns.get(userId) || 0) < 900) {
      await ctx.answerCbQuery('Vui lòng thao tác chậm lại.').catch(() => {});
      return;
    }
    cooldowns.set(userId, now);
    return next();
  });

  instance.start(async ctx => {
    const user = userService.initUser(ctx.from.id, ctx.from);
    console.info('[BOT] Người dùng ' + ctx.from.id + ' đã mở bot.');
    await ctx.reply(welcomeText(user, ctx.from.id), {
      parse_mode: 'HTML',
      ...mainMenu()
    });
  });

  instance.command('admin', requireAdmin, ctx => ctx.reply(
    '<b>QUẢN TRỊ</b>\n/status - Trạng thái\n/pending - Yêu cầu nạp đang chờ\n/broadcast nội dung - Gửi thông báo',
    { parse_mode: 'HTML' }
  ));

  instance.command('status', requireAdmin, ctx => ctx.reply(
    'Bot: ' + (bot ? 'Đang chạy' : 'Đã dừng') +
    '\nNgười dùng: ' + Object.keys(userService.getUsers()).length +
    '\nRAM: ' + Math.round(process.memoryUsage().rss / 1048576) + ' MB'
  ));

  instance.command('pending', requireAdmin, ctx => {
    const pending = appDataService.listPendingDeposits(15);
    if (!pending.length) return ctx.reply('Không có yêu cầu nạp tiền đang chờ.');
    return ctx.reply('YÊU CẦU NẠP ĐANG CHỜ:\n' + pending.map(item =>
      '• ' + item.reference + ' | ' + Number(item.amount).toLocaleString('vi-VN') +
      ' VNĐ | UID ' + item.userId
    ).join('\n'));
  });

  instance.command('broadcast', requireAdmin, async ctx => {
    const message = ctx.message.text.replace(/^\/broadcast(?:@\w+)?\s*/i, '').trim();
    if (!message) return ctx.reply('Cú pháp: /broadcast nội dung');

    let sent = 0;
    for (const userId of Object.keys(userService.getUsers())) {
      try {
        await instance.telegram.sendMessage(userId, message);
        sent += 1;
      } catch (error) {
        console.warn('Không gửi được thông báo:', error.message);
      }
    }
    await ctx.reply('Đã gửi thông báo tới ' + sent + ' người dùng.');
  });

  instance.action('mini_missing', ctx =>
    ctx.answerCbQuery('Quản trị viên chưa cấu hình MINI_APP_URL.', { show_alert: true })
  );

  instance.action('live', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText(
      '🚀 <b>MINIGAME LIVE</b>\nQuản lý tài khoản liên kết tại Mini App. Không có tài khoản mẫu.',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          miniAppButton(),
          [callbackButton('🔙 MENU CHÍNH', 'back', 'danger')]
        ])
      }
    );
  });

  instance.action('catalog', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText(
      '🎁 <b>TRUNG TÂM SẢN PHẨM</b>\nDanh mục hiển thị sau khi cấu hình sản phẩm và nhà cung cấp thật.',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          miniAppButton(),
          [callbackButton('🔙 MENU CHÍNH', 'back', 'danger')]
        ])
      }
    );
  });

  instance.action('deposit', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('💳 Tạo yêu cầu nạp và xem QR trong Hendy Mini App.', {
      ...Markup.inlineKeyboard(miniAppButton())
    });
  });

  instance.action('customer', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    const rows = [];
    if (process.env.SUPPORT_USERNAME) {
      rows.push([urlButton(
        '💬 Liên hệ hỗ trợ',
        'https://t.me/' + process.env.SUPPORT_USERNAME.replace(/^@/, ''),
        'success'
      )]);
    }
    rows.push(
      miniAppButton(),
      [callbackButton('🔙 MENU CHÍNH', 'back', 'danger')]
    );
    await ctx.editMessageText(
      '💎 <b>TRUNG TÂM KHÁCH HÀNG</b>\nMở Mini App để quản lý hồ sơ và gửi yêu cầu hỗ trợ.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
    );
  });

  instance.action('unconfigured', ctx =>
    ctx.answerCbQuery('Chức năng cần cấu hình dịch vụ thật trước khi mở.', { show_alert: true })
  );

  instance.action('back', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    const user = userService.initUser(ctx.from.id, ctx.from);
    await ctx.editMessageText(welcomeText(user, ctx.from.id), {
      parse_mode: 'HTML',
      ...mainMenu()
    });
  });

  instance.catch(error => console.error('Lỗi xử lý Telegram update:', error.message));
}

async function startBot(token = process.env.BOT_TOKEN, configuredAdmin = process.env.ADMIN_ID) {
  if (bot) return true;
  if (!token) {
    console.warn('BOT_TOKEN chưa cấu hình; Telegram Bot chưa được khởi chạy.');
    return false;
  }

  adminId = configuredAdmin || null;
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
            '[BOT] Chưa kết nối được Telegram (lần ' + attempt + '/' + maxAttempts +
            '): ' + formatTelegramError(error) +
            '. Thử lại sau ' + delayMs + ' ms.'
          );
        }
      }
    );

    // Telegraf dùng botInfo này ở launch(), tránh gọi getMe() lần thứ hai.
    instance.botInfo = botInfo;
    bot = instance;

    // launch() giữ promise trong suốt vòng đời long polling nên không await tại đây.
    // Tuy nhiên mọi lỗi khởi chạy polling đều được ghi nhận và làm health check chuyển 503.
    instance.launch().catch(error => {
      console.error('[BOT] Không thể duy trì Telegram long polling:', formatTelegramError(error));
      if (bot === instance) bot = null;
    });

    console.log(
      '[BOT] Đã xác thực Telegram Bot @' + (botInfo.username || 'unknown') +
      '; đang khởi chạy long polling.'
    );
    return true;
  } catch (error) {
    bot = null;
    console.error('[BOT] Không khởi chạy được Telegram Bot:', formatTelegramError(error));
    return false;
  }
}

function stopBot() {
  if (!bot) return;
  const current = bot;
  bot = null;
  current.stop('SIGTERM');
}

module.exports = {
  startBot,
  stopBot,
  isRunning: () => Boolean(bot)
};
