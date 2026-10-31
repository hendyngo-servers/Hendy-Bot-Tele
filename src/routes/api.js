const express = require('express');
const rateLimit = require('express-rate-limit');
const userService = require('../services/userService');
const appDataService = require('../services/appDataService');
const { requireTelegramAuth } = require('../security/telegramAuth');
const { encryptSecret } = require('../security/cryptoService');

const router = express.Router();
const ALLOWED_BRANDS = new Set(['QQ88', '78WIN', 'SC88', 'C168', 'CM88', 'F8BET']);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}), requireTelegramAuth);

function requireAdmin(req, res, next) {
  const adminId = String(process.env.ADMIN_ID || '');
  if (!adminId || String(req.telegramUser?.id) !== adminId) {
    return res.status(403).json({
      success: false,
      message: 'Tài khoản Telegram này không có quyền quản trị.'
    });
  }
  return next();
}

// Phiên đăng nhập được xác thực bằng chữ ký initData của Telegram.
// Quyền admin luôn được xác minh lại ở máy chủ, không tin cậy trạng thái từ trình duyệt.
router.get('/session', (req, res) => {
  const userId = String(req.telegramUser.id);
  const user = userService.initUser(userId, req.telegramUser);
  res.json({
    success: true,
    data: {
      profile: {
        id: userId,
        name: user.name,
        username: user.username || null
      },
      isAdmin: Boolean(process.env.ADMIN_ID) &&
        userId === String(process.env.ADMIN_ID)
    }
  });
});

// TRUNG TÂM QUẢN LÝ TÀI KHOẢN
router.get('/overview', (req, res) => {
  const userId = String(req.telegramUser.id);
  const user = userService.initUser(userId, req.telegramUser);
  const overview = appDataService.getOverview(userId, user);

  res.json({
    success: true,
    data: {
      profile: overview.profile,
      linkedAccounts: overview.linkedAccounts,
      counts: {
        linkedAccounts: overview.counts.linkedAccounts
      }
    }
  });
});

router.post('/links', async (req, res, next) => {
  try {
    const { brand, username, password, miniCode } = req.body || {};
    const normalizedBrand = String(brand || '').trim().toUpperCase();
    const userId = String(req.telegramUser.id);
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';

    if (!ALLOWED_BRANDS.has(normalizedBrand)) {
      return res.status(400).json({
        success: false,
        message: 'Nhà cung cấp không hợp lệ.'
      });
    }
    if (normalizedUsername.length < 2 || normalizedUsername.length > 80) {
      return res.status(400).json({
        success: false,
        message: 'Tên tài khoản phải từ 2 đến 80 ký tự.'
      });
    }
    if (typeof password !== 'string' || password.length < 1 || password.length > 256) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu không hợp lệ.'
      });
    }

    const ownedAccounts = appDataService.listLinkedAccounts(userId);
    if (ownedAccounts.length >= 10) {
      return res.status(409).json({
        success: false,
        message: 'Mỗi tài khoản Telegram chỉ được liên kết tối đa 10 tài khoản.'
      });
    }
    if (ownedAccounts.some(item =>
      item.brand === normalizedBrand &&
      item.username.toLowerCase() === normalizedUsername.toLowerCase()
    )) {
      return res.status(409).json({
        success: false,
        message: 'Tài khoản này đã được liên kết.'
      });
    }

    const account = await appDataService.addLinkedAccount(userId, {
      brand: normalizedBrand,
      username: normalizedUsername,
      miniCode: typeof miniCode === 'string' && miniCode.trim()
        ? miniCode.trim().slice(0, 80)
        : normalizedUsername,
      encryptedPassword: encryptSecret(password)
    });

    res.status(201).json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
});

router.delete('/links/:id', async (req, res, next) => {
  try {
    const removed = await appDataService.deleteLinkedAccount(
      req.telegramUser.id,
      req.params.id
    );
    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản liên kết.'
      });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ĐĂNG NHẬP ADMIN — mọi dữ liệu quản trị đều kiểm tra ADMIN_ID ở máy chủ.
router.get('/admin/overview', requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: appDataService.getAdminOverview(userService.getUsers())
  });
});

module.exports = router;
