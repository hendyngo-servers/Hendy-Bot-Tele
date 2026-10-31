const crypto = require('node:crypto');
function verifyTelegramInitData(initData, botToken, options = {}) {
  const maxAgeSeconds = options.maxAgeSeconds ?? 86400;
  if (typeof initData !== 'string' || !initData || !botToken) throw new Error('Thiếu dữ liệu xác thực Telegram.');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) throw new Error('Chữ ký Telegram không hợp lệ.');
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k+'='+v).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256',secret).update(checkString).digest();
  const actual = Buffer.from(receivedHash,'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual,expected)) throw new Error('Không thể xác minh chữ ký Telegram.');
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now()/1000);
  if (!Number.isSafeInteger(authDate) || authDate > now+60 || now-authDate > maxAgeSeconds) throw new Error('Phiên Telegram đã hết hạn. Vui lòng mở lại Mini App.');
  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { throw new Error('Thông tin người dùng Telegram không hợp lệ.'); }
  if (!user || !Number.isSafeInteger(Number(user.id))) throw new Error('Không tìm thấy tài khoản Telegram trong phiên.');
  return user;
}
function requireTelegramAuth(req,res,next) {
  try { req.telegramUser = verifyTelegramInitData(req.get('X-Telegram-Init-Data'),process.env.BOT_TOKEN); next(); }
  catch(error) { res.status(401).json({success:false,message:error.message}); }
}
module.exports = {verifyTelegramInitData,requireTelegramAuth};
