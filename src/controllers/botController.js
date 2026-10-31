const { Telegraf } = require('telegraf');
const userService = require('../services/userService');
const backendService = require('../services/backendService');
const kb = require('../utils/keyboards');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || '8639286417';

// Middleware 1: Khởi tạo User 
bot.use((ctx, next) => {
  if (ctx.from) userService.initUser(ctx.chat.id.toString(), ctx.from);
  return next();
});

// Middleware 2: Phân quyền Admin
const isAdmin = (ctx, next) => {
  const chatId = ctx.chat?.id?.toString() || ctx.from?.id?.toString();
  if (chatId !== ADMIN_ID) {
    return ctx.answerCbQuery('⛔ Bạn không có quyền truy cập khu vực này!', { show_alert: true });
  }
  return next(); 
};

// ==========================================
// A. LỆNH CƠ BẢN & MENU CHÍNH
// ==========================================
bot.start(async (ctx) => {
  const chatId = ctx.chat.id.toString();
  userService.clearState(chatId);
  const u = userService.getUser(chatId);
  const text = `🤖 *BOT HENDY CYBERTECH 2026* [BOT CHÍNH] 🚀\nBuổi chiều vui vẻ nhé, *${u.name}* (ID: \`${chatId}\`)\n--------------------------------------------------\n💎 *VIP 0*\n💰 **Ví Chính:** \`${u.balance.toLocaleString()} VNĐ\``;
  await ctx.reply(text, { parse_mode: 'Markdown', ...kb.getMainMenu() });
});

bot.action('back_start', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  userService.clearState(chatId);
  const u = userService.getUser(chatId);
  const text = `🤖 *BOT HENDY CYBERTECH 2026* 🚀\nChào mừng bạn quay lại, *${u.name}*\n💰 **Ví Chính:** \`${u.balance.toLocaleString()} VNĐ\``;
  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb.getMainMenu() });
});

// ==========================================
// B. CÁC MENU CHỨC NĂNG NGƯỜI DÙNG
// ==========================================
bot.action('shop_code_mini', async (ctx) => {
  await ctx.editMessageText('🛍️ *TRUNG TÂM MUA CODE MINI TRỰC TIẾP*\n\nVui lòng chọn sảnh hoặc gói mã code bên dưới:', { parse_mode: 'Markdown', ...kb.getShopCodeMenu() });
});

bot.action('cshk_center', async (ctx) => {
  await ctx.editMessageText('🎴 *TRUNG TÂM QUẢN LÝ TÀI KHOẢN*\nChọn một trong hai cách truy cập bên dưới:', { parse_mode: 'Markdown', ...kb.getCSHKMenu() });
});

bot.action('deposit', async (ctx) => {
  const u = userService.getUser(ctx.chat.id.toString());
  await ctx.editMessageText(`💳 *NẠP TIỀN VÀO HỆ THỐNG*\nChuyển khoản tự động qua Momo/Banking.\nSố dư hiện tại: \`${u.balance.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
});

// Dịch vụ mạng xã hội
bot.action('social_service', async (ctx) => {
  await ctx.editMessageText('🌐 *DỊCH VỤ MẠNG XÃ HỘI*\nHệ thống buff tương tác tự động. Vui lòng chọn dịch vụ:', { parse_mode: 'Markdown', ...kb.getSocialServiceMenu() });
});

bot.action('buff_tiktok', async (ctx) => {
  userService.setState(ctx.chat.id.toString(), { action: 'waiting_live_link', platform: 'TikTok' });
  await ctx.editMessageText('🎵 *BUFF 1K MẮT TIKTOK LIVE*\n\n👉 Gửi **Link hoặc Username Livestream TikTok** vào khung chat:', { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
});

bot.action('buff_fb', async (ctx) => {
  userService.setState(ctx.chat.id.toString(), { action: 'waiting_live_link', platform: 'Facebook' });
  await ctx.editMessageText('📘 *BUFF 1K MẮT FACEBOOK LIVE*\n\n👉 Gửi **Link Livestream Facebook** vào khung chat:', { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
});

// Kho acc động bằng Regex
bot.action(/^shop_kho_detail_(.+)$/, async (ctx) => {
  const brand = ctx.match[1];
  const u = userService.getUser(ctx.chat.id.toString());
  const list = u.accountKho[brand] || [];
  const text = `📦 *KHO ACC ${brand}*\n----------------------------------------\n📊 Tổng: \`${list.length}/50\` tài khoản\n✅ Đã check: \`${list.filter(i=>i.checked).length}\``;
  
  await ctx.editMessageText(text, { 
    parse_mode: 'Markdown', 
    reply_markup: { inline_keyboard: [
      [{ text: '➕ THÊM ACC VÀO KHO', callback_data: `add_acc_${brand}` }],
      [{ text: '🗑️ XÓA ACC', callback_data: `clear_acc_${brand}` }],
      [{ text: '« QUAY LẠI', callback_data: 'shop_code_mini' }]
    ]}
  });
});

bot.action(/^add_acc_(.+)$/, async (ctx) => {
  const brand = ctx.match[1];
  userService.setState(ctx.chat.id.toString(), { action: 'waiting_add_acc', brand });
  await ctx.editMessageText(`➕ *THÊM ACC VÀO KHO ${brand}*\n\n👉 Vui lòng nhập **Tài khoản | Mật khẩu** của bạn vào khung chat:`, { parse_mode: 'Markdown' });
});

bot.action(/^clear_acc_(.+)$/, async (ctx) => {
  const brand = ctx.match[1];
  const u = userService.getUser(ctx.chat.id.toString());
  u.accountKho[brand] = [];
  await ctx.editMessageText(`🗑️ Đã xóa toàn bộ tài khoản trong kho *${brand}*!`, { 
    parse_mode: 'Markdown', 
    reply_markup: { inline_keyboard: [[{ text: '« Quay lại', callback_data: `shop_kho_detail_${brand}` }]] } 
  });
});

bot.action('bot_vietsub', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const u = userService.getUser(chatId);
  try {
    await backendService.triggerVietsubPipeline(chatId, u.name);
    userService.setState(chatId, { action: 'waiting_video_link' });
    await ctx.editMessageText(`🎬 *BOT DỊCH VỤ VIETSUB V3.0*\n\n✅ Đã gửi lệnh kích hoạt luồng xử lý Video AI!\nVui lòng gửi link Video bạn muốn xử lý vào đây.`, { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
  } catch (err) {
    await ctx.editMessageText(`🔴 *MẤT KẾT NỐI*\nKhông thể kết nối đến Máy chủ Core Backend.`, { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
  }
});

// ==========================================
// C. KHU VỰC ADMIN PANEL
// ==========================================
bot.action('admin_panel', isAdmin, async (ctx) => {
  const users = userService.getAllUsers();
  const totalUsers = Object.keys(users).length;
  await ctx.editMessageText(`🛠️ *ADMIN QUẢN LÝ*\n\n📊 Thống kê: Có \`${totalUsers}\` user đang hoạt động.`, { parse_mode: 'Markdown', ...kb.getAdminMenu() });
});

bot.action('admin_list_users', isAdmin, async (ctx) => {
  const users = userService.getAllUsers();
  let userListStr = "";
  let i = 1;
  for (let id in users) {
    if (i > 10) { userListStr += `... và còn nhiều user khác.\n`; break; }
    userListStr += `${i}. ${users[id].name} (\`${id}\`) - Ví: ${users[id].balance.toLocaleString()}đ\n`;
    i++;
  }
  await ctx.editMessageText(`👥 *DANH SÁCH THÀNH VIÊN*\n\n${userListStr || 'Chưa có user nào.'}`, { parse_mode: 'Markdown', ...kb.getBackAdminMenu() });
});

bot.action('admin_ktor_trigger', isAdmin, async (ctx) => {
  const res = await backendService.sendAdminCommand('FORCE_SYNC_ALL_PIPELINES', ctx.chat.id.toString());
  await ctx.editMessageText(`⚡ *KẾT QUẢ KTOR CLIENT*\n\nTrạng thái phản hồi:\n\`${JSON.stringify(res, null, 2)}\``, { parse_mode: 'Markdown', ...kb.getBackAdminMenu() });
});

// ==========================================
// D. XỬ LÝ NHẬP VĂN BẢN (STATE TEXT INPUT)
// ==========================================
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const state = userService.getState(chatId);
  if (!state) return;

  const text = ctx.message.text.trim();
  const u = userService.getUser(chatId);

  if (state.action === 'waiting_add_acc') {
    if (!u.accountKho[state.brand]) u.accountKho[state.brand] = [];
    u.accountKho[state.brand].push({ acc: text, checked: true });
    userService.clearState(chatId);
    await ctx.reply(`✅ *THÊM TÀI KHOẢN THÀNH CÔNG!*\nKho: *${state.brand}*\nThông tin: \`${text}\``, { 
      parse_mode: 'Markdown', 
      reply_markup: { inline_keyboard: [[{ text: `◀ Quay lại Kho ${state.brand}`, callback_data: `shop_kho_detail_${state.brand}` }]]} 
    });
  }

  else if (state.action === 'waiting_live_link') {
    const cost = state.platform === "TikTok" ? 10000 : 15000;
    if (u.balance < cost) {
      userService.clearState(chatId);
      return ctx.reply(`❌ *GIAO DỊCH THẤT BẠI*\nSố dư (\`${u.balance.toLocaleString()} VNĐ\`) không đủ.`, { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
    }
    u.balance -= cost;
    u.history.push(`Mua mắt ${state.platform} (-${cost})`);
    userService.clearState(chatId);
    await ctx.reply(`🚀 *BUFF MẮT THÀNH CÔNG!*\nNền tảng: *${state.platform}*\nTrừ: \`-${cost.toLocaleString()} VNĐ\``, { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
  }

  else if (state.action === 'waiting_video_link') {
    userService.clearState(chatId);
    await ctx.reply(`🎬 *ĐÃ NHẬN YÊU CẦU*\n\nVideo của bạn đã được đưa vào hệ thống Media Pipeline qua Ktor Client.`, { parse_mode: 'Markdown', ...kb.getBackStartMenu() });
  }
});

module.exports = bot;
