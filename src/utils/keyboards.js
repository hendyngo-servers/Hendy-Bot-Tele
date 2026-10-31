const { Markup } = require('telegraf');

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://ngogiaidy56-eng.github.io/BOT-TELE';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://telegram-mini-app.ngogiaidy56.workers.dev';

const getMainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('🛍️ TRUNG TÂM MUA CODE MINI TRỰC TIẾP', 'shop_code_mini')],
  [Markup.button.callback('🌐 DỊCH VỤ MẠNG XÃ HỘI', 'social_service')],
  [Markup.button.callback('💳 NẠP TIỀN', 'deposit')],
  [Markup.button.callback('💎 TRUNG TÂM KHÁCH HÀNG', 'cshk_center')],
  [Markup.button.callback('🤖 BOT DỊCH VỤ VIETSUB (PIPELINE)', 'bot_vietsub')],
  [Markup.button.callback('🚀 COMPOSE WEB / TMA KTOR ENTRYPOINT', 'compose_web_tma')],
  [Markup.button.url('🎧 LIÊN HỆ CSKH', 'https://t.me/your_support')],
  [Markup.button.callback('🛠 ADMIN QUẢN LÝ XÂY DỰNG PHÁT TRIỂN Vietsub', 'admin_panel')]
]);

const getShopCodeMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('🚀 Liên Minh KJC', 'shop_kjc'), Markup.button.callback('🚀 Liên Minh KJC CŨ', 'shop_kjc_cu')],
  [Markup.button.callback('🚀 Liên Minh ABCVIP', 'shop_abcvip_group')],
  [Markup.button.callback('🐶 TRỞ VỀ MENU CHÍNH', 'back_start')]
]);

const getSocialServiceMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('🎵 Buff 1K Mắt TikTok Live (10k VNĐ)', 'buff_tiktok')],
  [Markup.button.callback('📘 Buff 1K Mắt Facebook Live (15k VNĐ)', 'buff_fb')],
  [Markup.button.callback('🔙 Quay lại', 'back_start')]
]);

const getCSHKMenu = () => Markup.inlineKeyboard([
  [Markup.button.webApp('🚀 [MINI APP] BẢN MỚI | CHỈ MOBILE', MINI_APP_URL)],
  [Markup.button.url('🔑 PHIÊN BẢN WEB CŨ', WEB_APP_URL)],
  [Markup.button.callback('⬅️ TRỞ VỀ MENU CHÍNH', 'back_start')]
]);

const getAdminMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('👥 Danh Sách User Online', 'admin_list_users')],
  [Markup.button.callback('⚡ Ký Lệnh Quản Trị Ktor Client', 'admin_ktor_trigger')],
  [Markup.button.callback('🔙 Quay lại Menu Chính', 'back_start')]
]);

const getBackAdminMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('◀ Quay lại Admin', 'admin_panel')]
]);

const getBackStartMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('🔙 Quay lại Menu Chính', 'back_start')]
]);

module.exports = { 
  getMainMenu, getShopCodeMenu, getSocialServiceMenu, 
  getCSHKMenu, getAdminMenu, getBackAdminMenu, getBackStartMenu 
};
