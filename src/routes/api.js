const express = require('express');
const rateLimit = require('express-rate-limit');
const userService = require('../services/userService');
const appDataService = require('../services/appDataService');
const { requireTelegramAuth } = require('../security/telegramAuth');
const { encryptSecret } = require('../security/cryptoService');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}), requireTelegramAuth);

router.get('/overview', (req, res) => {
  const userId = String(req.telegramUser.id);
  const user = userService.initUser(userId, req.telegramUser);
  res.json({ success: true, data: appDataService.getOverview(userId, user) });
});

router.post('/links', async (req, res, next) => {
  try {
    const { brand, username, password, miniCode } = req.body || {};
    const allowedBrands = new Set(['QQ88', '78WIN', 'SC88', 'C168', 'CM88', 'F8BET']);
    const normalizedBrand = String(brand || '').toUpperCase();
    const userId = String(req.telegramUser.id);

    if (!allowedBrands.has(normalizedBrand)) {
      return res.status(400).json({ success: false, message: 'Nhà cung cấp không hợp lệ.' });
    }
    if (typeof username !== 'string' || username.trim().length < 2 || username.length > 80) {
      return res.status(400).json({ success: false, message: 'Tên tài khoản phải từ 2 đến 80 ký tự.' });
    }
    if (typeof password !== 'string' || password.length < 1 || password.length > 256) {
      return res.status(400).json({ success: false, message: 'Mật khẩu không hợp lệ.' });
    }

    const ownedAccounts = appDataService.listLinkedAccounts(userId);
    if (ownedAccounts.length >= 10) {
      return res.status(409).json({ success: false, message: 'Mỗi tài khoản Telegram chỉ được liên kết tối đa 10 tài khoản.' });
    }
    if (ownedAccounts.some(item =>
      item.brand === normalizedBrand &&
      item.username.toLowerCase() === username.trim().toLowerCase()
    )) {
      return res.status(409).json({ success: false, message: 'Tài khoản này đã được liên kết.' });
    }

    const account = await appDataService.addLinkedAccount(userId, {
      brand: normalizedBrand,
      username: username.trim(),
      miniCode: typeof miniCode === 'string' && miniCode.trim()
        ? miniCode.trim().slice(0, 80)
        : username.trim(),
      encryptedPassword: encryptSecret(password)
    });

    res.status(201).json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
});

router.delete('/links/:id', async (req, res, next) => {
  try {
    const removed = await appDataService.deleteLinkedAccount(req.telegramUser.id, req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản liên kết.' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/deposits', async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount);
    const minimum = Math.max(10000, Number(process.env.MIN_DEPOSIT_VND) || 10000);

    if (!Number.isSafeInteger(amount) || amount < minimum || amount > 100000000) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền nạp phải từ ' + minimum.toLocaleString('vi-VN') + ' đến 100.000.000 VNĐ.'
      });
    }

    const deposit = await appDataService.createDeposit(req.telegramUser.id, amount);
    res.status(201).json({
      success: true,
      data: deposit,
      message: 'Yêu cầu đã tạo và đang chờ xác nhận.'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/deposits', (req, res) => {
  res.json({ success: true, data: appDataService.listDeposits(req.telegramUser.id) });
});

router.post('/support', async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (message.length < 5 || message.length > 2000) {
      return res.status(400).json({ success: false, message: 'Nội dung hỗ trợ phải từ 5 đến 2.000 ký tự.' });
    }
    const ticket = await appDataService.createTicket(req.telegramUser.id, message);
    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

router.get('/catalog', (_req, res) => res.json({ success: true, data: [] }));

module.exports = router;
