const {Telegraf,Markup}=require('telegraf');
const users=require('../services/userService');
const data=require('../services/appDataService');
const backend=require('../services/backendService');
let bot=null,adminId=null;
const cooldowns=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function miniButton(){const url=process.env.MINI_APP_URL;return url&&/^https:\/\//i.test(url)?[Markup.button.webApp('🚀 MỞ HENDY MINI APP',url)]:[Markup.button.callback('🚀 MINI APP CHƯA CẤU HÌNH','mini_missing')];}
function menu(){return Markup.inlineKeyboard([
 miniButton(),
 [Markup.button.callback('🟥 🚀 MINIGAME LIVE','live'),Markup.button.callback('🟦 🧰 THUÊ TOOL','unconfigured')],
 [Markup.button.callback('🟩 🎁 MUA LÌ XÌ · CODE','catalog')],
 [Markup.button.callback('🟥 💳 NẠP TIỀN','deposit'),Markup.button.callback('🟦 ⚙️ OTP & PROXY','unconfigured')],
 [Markup.button.callback('🟧 🏆 VIP KHO CÔNG CỤ ĐẶC QUYỀN','unconfigured')],
 [Markup.button.callback('🟦 💎 TRUNG TÂM KHÁCH HÀNG','customer')],
 [Markup.button.callback('🟥 ⚔️ HỆ THỐNG GHÉP ĐỐI ĐẦU','unconfigured')],
 [Markup.button.callback('🟦 👥 GIỚI THIỆU REF','unconfigured'),Markup.button.callback('🟧 👑 VIP TRUNG TÂM VIP','unconfigured')],
 [Markup.button.url('🟩 👥 NHÓM CHAT','https://t.me/Hendy_Support_Group'),Markup.button.callback('🟩 📢 KÊNH THÔNG BÁO','unconfigured')],
 [Markup.button.callback('🟥 🎟️ NHẬP GIFTCODE','unconfigured'),Markup.button.callback('🟫 🧑‍💻 LIÊN HỆ CSKH','customer')]
]);}
function welcome(user,id){return '🤖 <b>HENDY BOT TELEGRAM</b>\nChào mừng <b>'+esc(user.name)+'</b>!\n🆔 ID: <code>'+esc(id)+'</code>\n\n💰 Số dư: <b>'+Number(user.balance||0).toLocaleString('vi-VN')+' VNĐ</b>\n👑 Cấp VIP: <b>'+Number(user.vipLevel||0)+'</b>\n\nChọn chức năng hoặc mở Mini App.';}
function admin(ctx,next){if(!adminId||String(ctx.from?.id)!==String(adminId))return ctx.reply('⛔ Bạn không có quyền sử dụng lệnh này.');return next();}
function setup(instance){
 instance.use(async(ctx,next)=>{if(!ctx.callbackQuery)return next();const id=String(ctx.from?.id||''),now=Date.now();if(now-(cooldowns.get(id)||0)<900){await ctx.answerCbQuery('Vui lòng thao tác chậm lại.').catch(()=>{});return;}cooldowns.set(id,now);return next();});
 instance.start(async ctx=>{const user=users.initUser(ctx.from.id,ctx.from);backend.sendLogToWeb('Người dùng '+ctx.from.id+' đã mở bot.');await ctx.reply(welcome(user,ctx.from.id),{parse_mode:'HTML',...menu()});});
 instance.command('admin',admin,ctx=>ctx.reply('<b>QUẢN TRỊ</b>\n/status - Trạng thái\n/pending - Yêu cầu nạp đang chờ\n/broadcast nội dung - Gửi thông báo',{parse_mode:'HTML'}));
 instance.command('status',admin,ctx=>ctx.reply('Bot: '+(bot?'Đang chạy':'Đã dừng')+'\nNgười dùng: '+Object.keys(users.getUsers()).length+'\nRAM: '+Math.round(process.memoryUsage().rss/1048576)+' MB'));
 instance.command('pending',admin,ctx=>{const rows=data.listPendingDeposits(15);return ctx.reply(rows.length?('YÊU CẦU NẠP ĐANG CHỜ:\n'+rows.map(x=>'• '+x.reference+' | '+Number(x.amount).toLocaleString('vi-VN')+' VNĐ | UID '+x.userId).join('\n')):'Không có yêu cầu nạp đang chờ.');});
 instance.command('broadcast',admin,async ctx=>{const msg=ctx.message.text.replace(/^\/broadcast(?:@\w+)?\s*/i,'').trim();if(!msg)return ctx.reply('Cú pháp: /broadcast nội dung');let sent=0;for(const id of Object.keys(users.getUsers())){try{await instance.telegram.sendMessage(id,msg);sent++;}catch(e){console.warn('Không gửi được thông báo:',e.message);}}await ctx.reply('Đã gửi thông báo tới '+sent+' người dùng.');});
 instance.action('mini_missing',ctx=>ctx.answerCbQuery('Quản trị viên chưa cấu hình MINI_APP_URL.',{show_alert:true}));
 instance.action('live',async ctx=>{await ctx.answerCbQuery().catch(()=>{});await ctx.editMessageText('🚀 <b>MINIGAME LIVE</b>\nQuản lý tài khoản liên kết tại Mini App. Không có tài khoản mẫu.',{parse_mode:'HTML',...Markup.inlineKeyboard([miniButton(),[Markup.button.callback('🔙 MENU CHÍNH','back')]])});});
 instance.action('catalog',async ctx=>{await ctx.answerCbQuery().catch(()=>{});await ctx.editMessageText('🎁 <b>TRUNG TÂM SẢN PHẨM</b>\nDanh mục hiển thị sau khi cấu hình sản phẩm và nhà cung cấp thật.',{parse_mode:'HTML',...Markup.inlineKeyboard([miniButton(),[Markup.button.callback('🔙 MENU CHÍNH','back')]])});});
 instance.action('deposit',async ctx=>{await ctx.answerCbQuery().catch(()=>{});await ctx.reply('💳 Tạo yêu cầu nạp và xem QR trong Hendy Mini App.',{...Markup.inlineKeyboard(miniButton())});});
 instance.action('customer',async ctx=>{await ctx.answerCbQuery().catch(()=>{});const rows=[];if(process.env.SUPPORT_USERNAME)rows.push([Markup.button.url('💬 Liên hệ hỗ trợ','https://t.me/'+process.env.SUPPORT_USERNAME.replace(/^@/,''))]);rows.push(miniButton(),[Markup.button.callback('🔙 MENU CHÍNH','back')]);await ctx.editMessageText('💎 <b>TRUNG TÂM KHÁCH HÀNG</b>\nMở Mini App để quản lý hồ sơ và gửi yêu cầu hỗ trợ.',{parse_mode:'HTML',...Markup.inlineKeyboard(rows)});});
 instance.action('unconfigured',ctx=>ctx.answerCbQuery('Chức năng cần cấu hình dịch vụ thật trước khi mở.',{show_alert:true}));
 instance.action('back',async ctx=>{await ctx.answerCbQuery().catch(()=>{});const user=users.initUser(ctx.from.id,ctx.from);await ctx.editMessageText(welcome(user,ctx.from.id),{parse_mode:'HTML',...menu()});});
 instance.catch(error=>console.error('Telegram update:',error.message));
}
async function startBot(token=process.env.BOT_TOKEN,configuredAdmin=process.env.ADMIN_ID){
 if(bot)return true;if(!token){console.warn('BOT_TOKEN chưa cấu hình; chỉ chạy API/Mini App.');return false;}adminId=configuredAdmin||null;
 const instance=new Telegraf(token);setup(instance);
 try{await instance.telegram.getMe();bot=instance;instance.launch().catch(e=>{console.error('Telegram polling dừng:',e.message);if(bot===instance)bot=null;});console.log('Telegram Bot đã khởi chạy.');return true;}
 catch(e){bot=null;console.error('Không khởi chạy được Telegram Bot:',e.message);return false;}
}
function stopBot(){if(!bot)return;const current=bot;bot=null;current.stop('SIGTERM');}
async function broadcastToAdmin(message){if(!bot||!adminId)return false;await bot.telegram.sendMessage(adminId,String(message).slice(0,3500));return true;}
module.exports={startBot,stopBot,isRunning:()=>Boolean(bot),broadcastToAdmin};
