const { Telegraf } = require('telegraf');
const userService = require('../services/userService');
const backendService = require('../services/backendService');
const kb = require('../utils/keyboards');

let bot = null;
let currentAdminId = process.env.ADMIN_ID;

const getVNDateTime = () => new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

const setupBotLogic = (botInstance) => {
  // Middleware chống Spam (1.5s)
  botInstance.use(async (ctx, next) => {
    if (ctx.callbackQuery) {
      const chatId = ctx.chat?.id?.toString();
      const cooldowns = userService.getCooldowns();
      const now = Date.now();
      if (cooldowns[chatId] && (now - cooldowns[chatId] < 1500)) {
        return ctx.answerCbQuery('⚠️ Thao tác quá nhanh, từ từ thôi sếp ơi!');
      }
      cooldowns[chatId] = now;
    }
    return next();
  });

  // Lệnh /start
  botInstance.start(async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const u = userService.initUser(chatId, ctx.from);
    backendService.sendLogToWeb(`👤 Khách [${u.name}] (ID: ${chatId}) vừa mở Bot.`);

    const icons = kb.getRandomIcons();
    const text = `🤖 *BOT HENDY CYBERTECH 2026* [BOT CHÍNH] ${icons.rocket}\nBuổi chiều vui vẻ nhé, *${u.name}* (ID: \`${chatId}\`)\n--------------------------------------------------\n💎 *VIP 0*\n\n💰 **Ví Chính:** \`${u.balance.toLocaleString('vi-VN')} VNĐ\`\n🎁 **Ví Voucher:** \`${u.voucher.toLocaleString('vi-VN')} VNĐ\`\n--------------------------------------------------\n👉 Trang Chủ Website: https://hendy-cybertech.com`;
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb.getMainMenu() });
  });

  // Middleware Admin
  const checkAdmin = (ctx, next) => ctx.chat.id.toString() === currentAdminId ? next() : ctx.reply('⛔ Sếp không có quyền!');
  
  botInstance.command('admin', checkAdmin, (ctx) => {
    ctx.reply("🛠️ *BẢNG QUẢN TRỊ HỆ THỐNG*\n- `/status`: Trạng thái\n- `/user [ID]`: Thông tin KH\n- `/addmoney [ID] [Tiền]`: Cộng trừ tiền\n- `/trungcode [ID] [Trang] [TK] [Code]`: Cấp code\n- `/broadcast [Nội dung]`: Phát loa", { parse_mode: 'Markdown' });
  });

  botInstance.command('status', checkAdmin, (ctx) => {
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    ctx.reply(`⚙️ *TRẠNG THÁI BOT*\n👥 Tổng khách: \`${Object.keys(userService.getUsers()).length}\`\n🧠 RAM: \`${mem} MB\``, { parse_mode: 'Markdown' });
  });

  botInstance.command('addmoney', checkAdmin, (ctx) => {
    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) return;
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    const users = userService.getUsers();
    
    if (!users[targetId] || isNaN(amount)) return ctx.reply('❌ Lỗi ID hoặc số tiền.');
    users[targetId].balance += amount;
    userService.saveDatabase();
    
    ctx.reply(`✅ Cập nhật cho ${targetId}. Số dư mới: \`${users[targetId].balance.toLocaleString('vi-VN')} VNĐ\``, { parse_mode: 'Markdown' });
    botInstance.telegram.sendMessage(targetId, `💰 *BIẾN ĐỘNG SỐ DƯ*\nTài khoản được điều chỉnh: \`${amount > 0 ? '+'+amount : amount} VNĐ\`\n💎 Hiện tại: \`${users[targetId].balance.toLocaleString('vi-VN')} VNĐ\``, { parse_mode: 'Markdown' }).catch(()=>{});
  });

  botInstance.command('broadcast', checkAdmin, async (ctx) => {
    const msg = ctx.message.text.substring(11).trim();
    if (!msg) return ctx.reply('⚠️ Thiếu nội dung!');
    let count = 0;
    for (const uid of Object.keys(userService.getUsers())) {
      try {
        await botInstance.telegram.sendMessage(uid, `📢 *THÔNG BÁO TỪ HỆ THỐNG:*\n\n{msg}`, { parse_mode: 'Markdown' });
        count++;
      } catch (e) {}
    }
    ctx.reply(`✅ Phát loa thành công tới \`${count}\` khách!`, { parse_mode: 'Markdown' });
  });

  // Action Nút Bấm
  botInstance.action('back_start', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const u = userService.getUser(chatId);
    const text = `🤖 *BOT HENDY CYBERTECH 2026* [BOT CHÍNH] 🚀\nChào bạn, *${u.name}*\n💰 **Ví Chính:** \`${u.balance.toLocaleString('vi-VN')} VNĐ\``;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb.getMainMenu() });
  });

  // Mở Menu Minigame Live (giống ảnh mẫu Telegram của bạn)
  botInstance.action('menu_minigame', async (ctx) => {
    const u = userService.getUser(ctx.chat.id.toString());
    const text = `LIVESTREAM 🚀\n*PREMIUM* 👑\n\n╭─────────────╮\n  💭 Chào, *${u.name}*.\n╰─────────────╯\n\n● Tổng đơn đang chờ duyệt chạy: \`[ 0 ]\`\n● Tổng đơn đang chạy: \`[ 0 ]\`\n● Tổng đơn hoàn thành: \`[ 0 ]\`\n--------------------------------------------------\n🎉 🎊 Cập nhật tính năng yêu cầu hoàn đơn nếu trúng mà không thấy phát.`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb.getMinigameMenu() });
  });

  botInstance.action('buy_code', async (ctx) => {
    await ctx.editMessageText('🖤 *TRUNG TÂM MUA CODE*\n💎 *TRẠNG THÁI ĐƠN HÀNG:*\n- Đơn hàng MINI GAME: Chờ [0] | Hoàn tất [0]', { parse_mode: 'Markdown', ...kb.getBuyCodeMenu() });
  });

  botInstance.action('v2_links', async (ctx) => {
    const u = userService.getUser(ctx.chat.id.toString());
    const links = u.linkedAccounts || {};
    const text = `MINI GAME\n🖤 Chào *${u.name}*\n--------------------------------------------------\n📊 *Thống Kê Liên Kết:*\n- QQ88: [${links.QQ88?.length || 0}]\n- 78Win: [${links['78WIN']?.length || 0}]\n- SC88: [${links.SC88?.length || 0}]\n- C168: [${links.C168?.length || 0}]`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb.getV2LinksMenu(links) });
  });

  botInstance.action('guide_detail', async (ctx) => {
    const text = `📖 *HƯỚNG DẪN SỬ DỤNG HỆ THỐNG HENDY CYBERTECH*\n1️⃣ *Liên Kết Tài Khoản xem live:*\n- Cú pháp: \`Taikhoan | Matkhau | TÊN MINI CODE\``;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb.getBackMenu('v2_links') });
  });

  // Điều hướng nhanh khi bấm vào các nhóm sảnh minigame
  botInstance.action(['minigame_group_1', 'minigame_group_2', 'minigame_group_3'], async (ctx) => {
    await ctx.answerCbQuery('🚀 Chuyển hướng đến trung tâm quản lý tài khoản liên kết sảnh!', { show_alert: false });
    // Chuyển trực tiếp sang menu v2_links để quản lý tài khoản sảnh
    const u = userService.getUser(ctx.chat.id.toString());
    const links = u.linkedAccounts || {};
    const text = `MINI GAME SẢNH\n🖤 Chào *${u.name}*\n--------------------------------------------------\n👉 Chọn trang game bên dưới để quản lý hoặc đặt đơn:`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb.getV2LinksMenu(links) });
  });

  botInstance.action(/^manage_(.+)$/, async (ctx) => {
    const brand = ctx.match[1];
    const u = userService.getUser(ctx.chat.id.toString());
    if (!u.linkedAccounts[brand]) u.linkedAccounts[brand] = [];
    const accounts = u.linkedAccounts[brand];
    
    let text = `📂 *DANH SÁCH TÀI KHOẢN (${brand})*\n--------------------------------------------------\n`;
    const buttons = [];
    if (accounts.length === 0) text += "Chưa có tài khoản nào được liên kết.";
    else {
      accounts.forEach((acc, idx) => {
        text += `${idx + 1}. TK: \`${acc.tk}\` - Code: \`${acc.miniCode}\`\n`;
        buttons.push([{ text: `❌ Xóa ${acc.tk}`, callback_data: `del_${brand}_${idx}` }]);
      });
    }
    buttons.push([{ text: `➕ THÊM LIÊN KẾT | ACC ${brand}`, callback_data: `link_${brand}` }]);
    buttons.push([{ text: '🔙 Quay lại', callback_data: 'v2_links' }]);
    
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  });

  botInstance.action(/^del_(.+)_(\d+)$/, async (ctx) => {
    const brand = ctx.match[1];
    const idx = parseInt(ctx.match[2]);
    const u = userService.getUser(ctx.chat.id.toString());
    
    if (u.linkedAccounts[brand] && u.linkedAccounts[brand].length > idx) {
      u.linkedAccounts[brand].splice(idx, 1);
      userService.saveDatabase();
      await ctx.answerCbQuery('Đã xóa thành công!');
      ctx.match[1] = brand; 
      botInstance.handleUpdate({ callback_query: { id: ctx.callbackQuery.id, from: ctx.from, message: ctx.callbackQuery.message, chat_instance: ctx.callbackQuery.chat_instance, data: `manage_${brand}` }});
    }
  });

  botInstance.action(/^link_(.+)$/, async (ctx) => {
    const brand = ctx.match[1];
    userService.getStates()[ctx.chat.id.toString()] = { step: 'WAITING_FOR_CREDENTIALS', brand };
    await ctx.reply(`📍 *TRANG: ${brand} MINI GAME*\n🔒 Vui lòng gửi thông tin đăng nhập theo cú pháp:\n\`Taikhoan | Matkhau | TÊN MINI CODE\``, { parse_mode: 'Markdown' });
  });

  botInstance.action('deposit', async (ctx) => {
    userService.getStates()[ctx.chat.id.toString()] = { step: 'WAITING_FOR_DEPOSIT_AMOUNT' };
    await ctx.reply('💵 Nhập số tiền sếp muốn nạp vào ví (Tối thiểu 10.000đ):');
  });

  botInstance.action('unimplemented', (ctx) => ctx.answerCbQuery('🚀 Tính năng sắp ra mắt!', { show_alert: true }));

  // Xử lý Text Input (Nhập thông tin tài khoản hoặc số tiền nạp)
  botInstance.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    const chatId = ctx.chat.id.toString();
    const text = ctx.message.text.trim();
    const u = userService.initUser(chatId, ctx.from);
    const states = userService.getStates();

    if (states[chatId]?.step === 'WAITING_FOR_DEPOSIT_AMOUNT') {
      const amount = parseInt(text.replace(/\D/g, ''));
      if (amount && amount >= 10000) {
        const qrUrl = `https://img.vietqr.io/image/MB-0123456789ABC-compact2.png?amount=${amount}&addInfo=HENDY${chatId}`;
        await ctx.replyWithPhoto(qrUrl, { caption: `⚡ *LỆNH NẠP TIỀN TỰ ĐỘNG*\n💵 Số tiền: \`${amount.toLocaleString('vi-VN')} VNĐ\`\n📝 Nội dung: \`HENDY${chatId}\``, parse_mode: 'Markdown' });
        delete states[chatId];
      } else {
        await ctx.reply('⚠️ Số tiền nạp tối thiểu là 10.000 VNĐ!');
      }
      return;
    }

    const lines = text.split('\n');
    let success = [], duplicate = 0, error = 0, limit = 0;
    const MAX = 10; // Đã nâng giới hạn lưu trữ acc cho thoải mái
    let totalAcc = Object.values(u.linkedAccounts).reduce((sum, arr) => sum + arr.length, 0);

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 2) {
        const tk = parts[0], mk = parts[1];
        const miniCode = parts.length >= 3 ? parts[2] : tk;
        const brand = parts.length >= 4 ? parts[3].toUpperCase() : (states[chatId]?.brand || 'QQ88');

        if (!u.linkedAccounts[brand]) u.linkedAccounts[brand] = [];
        if (totalAcc >= MAX) { limit++; continue; }

        if (u.linkedAccounts[brand].some(a => a.tk.toLowerCase() === tk.toLowerCase())) {
          duplicate++;
        } else {
          u.linkedAccounts[brand].push({ tk, mk, miniCode });
          totalAcc++;
          success.push(`[${tk}] tại ${brand}`);
          backendService.syncTeleAccount({ tk, mk, tab: miniCode, brand, sender: u.name });
        }
      } else {
        error++;
      }
    }

    if (success.length > 0) userService.saveDatabase();

    let replyMsg = "";
    if (success.length > 0) replyMsg += `🥰 *Ting ting! Chốt đơn ${success.length} acc lúc ${getVNDateTime().split(' ')[1]}:*\n${success.map(s => `👉 ${s}`).join('\n')}\n\n`;
    if (duplicate > 0) replyMsg += `😅 *Quen quen nha!* Bỏ qua **${duplicate} acc** đã có sẵn.\n`;
    if (limit > 0) replyMsg += `😢 *Giỏ hàng đầy!* Từ chối **${limit} acc** (Max ${MAX}).\n`;
    if (error > 0 && success.length === 0 && duplicate === 0) replyMsg += `🤪 *Lạc nhịp rồi!* Sai cú pháp (Chuẩn: TK | MK | Code | Brand).\n`;

    if (success.length === 0 && duplicate > 0 && limit === 0) replyMsg = "😅 *Toàn hàng cũ!* Đã liên kết trước đó rồi.";
    else if (success.length === 0 && limit > 0) replyMsg = `😢 *Kho đã đầy!* Bạn đã chạm nóc giới hạn ${MAX} acc.`;

    if (replyMsg) {
      await ctx.reply(replyMsg, { 
        parse_mode: 'Markdown', 
        reply_markup: { inline_keyboard: [[{ text: "🌟 Tuyệt!", callback_data: "buy_code" }, { text: "📜 Quản lý tài khoản", callback_data: "v2_links" }]] } 
      });
    }

    if (states[chatId]?.step === 'WAITING_FOR_CREDENTIALS') delete states[chatId];
  });
};

module.exports = {
  startBot: async (token, adminId) => {
    if (bot) bot.stop();
    if (adminId) currentAdminId = adminId;
    if (!token) return false;

    try {
      bot = new Telegraf(token);
      setupBotLogic(bot);

      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      bot.launch({ dropPendingUpdates: true });

      console.log('🤖 Bot Telegram đã khởi động thành công!');
      return true;
    } catch (e) {
      console.error('❌ Lỗi khởi động bot:', e);
      return false;
    }
  },
  stopBot: () => {
    if (bot) {
      bot.stop();
      bot = null;
    }
  },
  broadcastToAdmin: (msg) => {
    if (bot && currentAdminId) {
      bot.telegram.sendMessage(currentAdminId, `📢 *THÔNG BÁO TỪ TRẠM MẸ:*\n\n{msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
    }
  },
  isRunning: () => bot !== null
};
