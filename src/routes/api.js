const express = require('express');
const rateLimit = require('express-rate-limit');
const userService = require('../services/userService');
const appDataService = require('../services/appDataService');
const botController = require('../controllers/botController');
const qrStorageService = require('../services/qrStorageService');
const { requireTelegramAuth } = require('../security/telegramAuth');

const router = express.Router();
const CATEGORIES = new Set(['tool', 'code', 'otp_proxy', 'vip', 'duel']);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}), requireTelegramAuth);

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message) => res.status(status).json({ success: false, message });

function requireAdmin(req, res, next) {
  const adminId = String(process.env.ADMIN_ID || '');
  if (!adminId || String(req.telegramUser?.id) !== adminId) {
    return fail(res, 403, 'Tài khoản Telegram này không có quyền quản trị.');
  }
  return next();
}
const admin = [requireAdmin];

function validHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

// Mini App chỉ xác thực phiên Admin. Menu thành viên không sử dụng API này.
router.get('/session', (req, res) => {
  const userId = String(req.telegramUser.id);
  const adminId = String(process.env.ADMIN_ID || '');
  if (!adminId || userId !== adminId) {
    return fail(res, 403, 'Mini App chỉ dành cho tài khoản Admin.');
  }
  const user = userService.getUser(userId);
  const name = user?.name ||
    [req.telegramUser.first_name, req.telegramUser.last_name].filter(Boolean).join(' ') ||
    'Admin';
  return ok(res, {
    profile: {
      id: userId,
      name,
      username: user?.username || req.telegramUser.username || null
    },
    isAdmin: true
  });
});

// ADMIN OVERVIEW AND SETTINGS
router.get('/admin/overview', ...admin, (_req, res) =>
  ok(res, {
    ...appDataService.getAdminOverview(userService.getUsers()),
    integrations: {
      database: userService.isMongo() ? 'mongodb-atlas' : 'local-json',
      fileStorage: 'render-persistent-disk'
    }
  })
);

router.get('/admin/settings', ...admin, async (_req, res, next) => {
  try {
    const payment = appDataService.getPaymentSettings();
    const qrPreviewUrl = payment.qrImagePath
      ? qrStorageService.getReadUrl(payment.qrImagePath)
      : payment.qrImageUrl;
    return ok(res, {
      payment,
      qrPreviewUrl,
      storage: {
        database: userService.isMongo() ? 'mongodb-atlas' : 'local-json',
        files: 'render-persistent-disk'
      },
      botUsername: payment.botUsername || process.env.BOT_USERNAME || '',
      referralCommissionPercent: Number(payment.referralCommissionPercent || 0)
    });
  } catch (error) { return next(error); }
});

router.post('/admin/assets/qr', ...admin, async (req, res, next) => {
  try {
    const dataUrl = String(req.body?.dataUrl || '');
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return fail(res, 400, 'Ảnh QR phải là PNG, JPEG hoặc WebP.');
    const contentType = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > qrStorageService.MAX_IMAGE_BYTES) {
      return fail(res, 413, 'Ảnh QR tối đa 2 MB.');
    }
    qrStorageService.validateQrImage(buffer, contentType);

    const oldFilename = appDataService.getPaymentSettings().qrImagePath;
    const uploaded = await qrStorageService.uploadQrImage(buffer, contentType);
    await appDataService.updatePaymentSettings({
      qrImagePath: uploaded.filename,
      qrImageUrl: ''
    });
    if (oldFilename && oldFilename !== uploaded.filename) {
      await qrStorageService.deleteQrImage(oldFilename).catch(error => {
        console.warn('[Storage] Không xóa được ảnh QR cũ:', error.message);
      });
    }
    return ok(res, {
      filename: uploaded.filename,
      previewUrl: uploaded.url,
      contentType: uploaded.contentType,
      size: uploaded.size
    }, 201);
  } catch (error) {
    return next(error);
  }
});

router.put('/admin/settings', ...admin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const payment = body.payment || {};
    const bankBin = String(payment.bankBin || '').trim().slice(0, 24);
    const bankName = String(payment.bankName || '').trim().slice(0, 80);
    const bankAccount = String(payment.bankAccount || '').trim().slice(0, 40);
    const bankAccountName = String(payment.bankAccountName || '').trim().slice(0, 100);
    const qrImageUrl = String(payment.qrImageUrl || '').trim();
    const qrImagePath = String(payment.qrImagePath || '').trim();
    const instructions = String(payment.instructions || '').trim().slice(0, 500);
    const minDeposit = Number(payment.minDeposit);
    const commission = Number(body.referralCommissionPercent);
    const botUsername = String(body.botUsername || payment.botUsername || '').replace(/^@/, '').trim();
    const groupChatUrl = String(body.groupChatUrl || payment.groupChatUrl || '').trim();
    const newsChannelUrl = String(body.newsChannelUrl || payment.newsChannelUrl || '').trim();
    const supportUsername = String(body.supportUsername || payment.supportUsername || '').replace(/^@/, '').trim();

    if (botUsername && !/^[a-zA-Z0-9_]{5,32}$/.test(botUsername)) {
      return fail(res, 400, 'BOT_USERNAME không hợp lệ.');
    }
    if ((groupChatUrl && !validHttpUrl(groupChatUrl)) ||
      (newsChannelUrl && !validHttpUrl(newsChannelUrl))) {
      return fail(res, 400, 'Liên kết nhóm/kênh phải là HTTPS hợp lệ.');
    }
    if (supportUsername && !/^[a-zA-Z0-9_]{5,32}$/.test(supportUsername)) {
      return fail(res, 400, 'Username hỗ trợ không hợp lệ.');
    }
    if (bankBin && !/^\d{6}$/.test(bankBin)) {
      return fail(res, 400, 'Mã BIN ngân hàng phải gồm 6 chữ số.');
    }
    if (bankAccount && !/^\d{4,24}$/.test(bankAccount)) {
      return fail(res, 400, 'Số tài khoản ngân hàng phải gồm 4 đến 24 chữ số.');
    }
    if (Boolean(bankBin) !== Boolean(bankAccount)) {
      return fail(res, 400, 'Cần nhập đồng thời cả BIN và số tài khoản ngân hàng.');
    }
    if (qrImageUrl && (!validHttpUrl(qrImageUrl) || qrImageUrl.length > 500)) {
      return fail(res, 400, 'Đường dẫn QR phải là HTTPS hợp lệ và tối đa 500 ký tự.');
    }
    if (qrImagePath && !qrStorageService.isQrImageFileName(qrImagePath)) {
      return fail(res, 400, 'Tên tệp ảnh QR không hợp lệ.');
    }
    if (!Number.isSafeInteger(minDeposit) || minDeposit < 10000 || minDeposit > 100000000) {
      return fail(res, 400, 'Mức nạp tối thiểu phải từ 10.000 đến 100.000.000 VNĐ.');
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 20) {
      return fail(res, 400, 'Hoa hồng giới thiệu phải từ 0% đến 20%.');
    }
    return ok(res, await appDataService.updatePaymentSettings({
      bankBin, bankName, bankAccount, bankAccountName,
      qrImageUrl, qrImagePath, instructions, minDeposit,
      referralCommissionPercent: commission,
      botUsername,
      groupChatUrl,
      newsChannelUrl,
      supportUsername
    }));
  } catch (error) { return next(error); }
});

// ADMIN: DEPOSITS, ORDERS, CATALOG, GIFT CODES, MEMBERS, SUPPORT
router.get('/admin/deposits', ...admin, (_req, res) => ok(res, appDataService.listAllDeposits()));
router.patch('/admin/deposits/:id', ...admin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '');
    if (!['paid', 'rejected'].includes(status)) return fail(res, 400, 'Trạng thái xử lý không hợp lệ.');
    const current = appDataService.getDeposit(req.params.id);
    if (!current) return fail(res, 404, 'Không tìm thấy yêu cầu nạp.');
    if (current.status !== 'pending') return fail(res, 409, 'Yêu cầu này đã được xử lý.');

    let commission = 0;
    const result = await appDataService.processDeposit(
      req.params.id,
      status,
      req.telegramUser.id,
      async ({ userId, amount }) => {
        if (status !== 'paid') return;
        const user = userService.getUser(userId);
        if (!user) throw new Error('Không tìm thấy người dùng của yêu cầu nạp.');
        const nextBalance = Number(user.balance || 0) + Number(amount);
        if (!Number.isSafeInteger(nextBalance)) throw new Error('Không thể cập nhật số dư.');
        user.balance = nextBalance;
        await userService.saveDatabase();
        commission = await appDataService.addReferralCommission(userId, amount, userService.getUsers());
        if (commission > 0) await userService.saveDatabase();
      }
    );
    if (result.error) return fail(res, 409, 'Yêu cầu đã được xử lý ở một thao tác khác.');
    const userMessage = status === 'paid'
      ? '✅ Yêu cầu nạp ' + result.deposit.reference + ' đã được xác nhận. Số dư ví đã được cập nhật.'
      : '❌ Yêu cầu nạp ' + result.deposit.reference + ' đã bị từ chối. Vui lòng liên hệ CSKH nếu cần hỗ trợ.';
    await botController.sendUserMessage(result.userId, userMessage).catch(() => {});
    return ok(res, { ...result, commission });
  } catch (error) { return next(error); }
});

router.get('/admin/orders', ...admin, (_req, res) => ok(res, appDataService.listOrders(null)));
router.patch('/admin/orders/:id', ...admin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '');
    if (!['approved', 'rejected'].includes(status)) return fail(res, 400, 'Trạng thái đơn không hợp lệ.');
    const order = appDataService.getOrder(req.params.id);
    if (!order) return fail(res, 404, 'Không tìm thấy đơn hàng.');
    if (order.status !== 'pending') return fail(res, 409, 'Đơn hàng đã được xử lý.');

    const result = await appDataService.processOrder(
      req.params.id,
      status,
      req.telegramUser.id,
      async ({ order: currentOrder }) => {
        if (status !== 'approved') return;
        const user = userService.getUser(currentOrder.userId);
        if (!user) throw new Error('Không tìm thấy người dùng của đơn hàng.');
        if (Number(user.balance || 0) < Number(currentOrder.amount)) {
          throw new Error('Số dư thành viên không đủ để thanh toán đơn hàng.');
        }
        user.balance = Number(user.balance || 0) - Number(currentOrder.amount);
        if (currentOrder.category === 'vip') {
          const requestedLevel = Number(currentOrder.vipLevel || 0);
          if (requestedLevel < 1 || requestedLevel > 10) {
            throw new Error('Sản phẩm VIP chưa được cấu hình cấp nâng cấp hợp lệ.');
          }
          user.vipLevel = Math.max(Number(user.vipLevel || 0), requestedLevel);
        }
        await userService.saveDatabase();
      }
    );
    if (result.error === 'out_of_stock' || result.error === 'item_unavailable') {
      return fail(res, 409, 'Sản phẩm không còn khả dụng hoặc đã hết tồn kho.');
    }
    if (result.error) return fail(res, 409, 'Đơn hàng đã được xử lý ở một thao tác khác.');
    const userMessage = status === 'approved'
      ? '✅ Đơn hàng "' + result.order.itemName + '" đã được Admin duyệt. Vui lòng xem lại số dư và hướng dẫn nhận dịch vụ trong Mini App.'
      : '❌ Đơn hàng "' + result.order.itemName + '" đã bị Admin từ chối. Số dư chưa bị trừ.';
    await botController.sendUserMessage(result.order.userId, userMessage).catch(() => {});
    return ok(res, result);
  } catch (error) { return next(error); }
});

router.get('/admin/catalog', ...admin, (_req, res) => ok(res, appDataService.listAdminCatalog()));
router.post('/admin/catalog', ...admin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim().slice(0, 500);
    const category = String(body.category || '');
    const price = Number(body.price);
    const durationDays = Number(body.durationDays || 0);
    const vipLevel = Number(body.vipLevel || 0);
    const stock = body.stock === '' || body.stock === null || body.stock === undefined ? null : Number(body.stock);
    if (!CATEGORIES.has(category)) return fail(res, 400, 'Danh mục không hợp lệ.');
    if (name.length < 2 || name.length > 100) return fail(res, 400, 'Tên sản phẩm phải từ 2 đến 100 ký tự.');
    if (!Number.isSafeInteger(price) || price < 0 || price > 1000000000) return fail(res, 400, 'Giá không hợp lệ.');
    if (!Number.isSafeInteger(durationDays) || durationDays < 0 || durationDays > 3650) return fail(res, 400, 'Thời hạn không hợp lệ.');
    if (!Number.isSafeInteger(vipLevel) || vipLevel < 0 || vipLevel > 10 || (category === 'vip' && vipLevel < 1)) return fail(res, 400, 'Cấp VIP phải từ 1 đến 10 với sản phẩm VIP.');
    if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000)) return fail(res, 400, 'Tồn kho không hợp lệ.');
    const item = await appDataService.saveCatalogItem({
      category, name, description, price, durationDays, vipLevel, stock, active: body.active !== false
    });
    return ok(res, item, 201);
  } catch (error) { return next(error); }
});

router.put('/admin/catalog/:id', ...admin, async (req, res, next) => {
  try {
    const existing = appDataService.listAdminCatalog().find(item => item.id === req.params.id);
    if (!existing) return fail(res, 404, 'Không tìm thấy sản phẩm.');
    const body = { ...existing, ...(req.body || {}) };
    const category = String(body.category || '');
    const name = String(body.name || '').trim();
    const price = Number(body.price);
    const durationDays = Number(body.durationDays || 0);
    const vipLevel = Number(body.vipLevel || 0);
    const stock = body.stock === '' || body.stock === null || body.stock === undefined ? null : Number(body.stock);
    if (!CATEGORIES.has(category) || name.length < 2 || name.length > 100 ||
      !Number.isSafeInteger(price) || price < 0 || price > 1000000000 ||
      !Number.isSafeInteger(durationDays) || durationDays < 0 || durationDays > 3650 ||
      !Number.isSafeInteger(vipLevel) || vipLevel < 0 || vipLevel > 10 || (category === 'vip' && vipLevel < 1) ||
      (stock !== null && (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000))) {
      return fail(res, 400, 'Thông tin sản phẩm không hợp lệ.');
    }
    return ok(res, await appDataService.saveCatalogItem({
      category, name, description: String(body.description || '').slice(0, 500),
      price, durationDays, vipLevel, stock, active: body.active !== false
    }, req.params.id));
  } catch (error) { return next(error); }
});
router.delete('/admin/catalog/:id', ...admin, async (req, res, next) => {
  try {
    const removed = await appDataService.deleteCatalogItem(req.params.id);
    if (!removed) return fail(res, 404, 'Không tìm thấy sản phẩm.');
    return ok(res, { removed: true });
  } catch (error) { return next(error); }
});

router.get('/admin/giftcodes', ...admin, (_req, res) => ok(res, appDataService.listGiftcodes()));
router.post('/admin/giftcodes', ...admin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const code = String(body.code || '').trim().toUpperCase();
    const rewardType = String(body.rewardType || '');
    const rewardValue = Number(body.rewardValue);
    const maxUses = Number(body.maxUses || 1);
    let expiresAt = null;
    if (body.expiresAt) {
      const date = new Date(body.expiresAt);
      if (Number.isNaN(date.getTime())) return fail(res, 400, 'Ngày hết hạn không hợp lệ.');
      expiresAt = date.toISOString();
    }
    if (!/^[A-Z0-9_-]{3,64}$/.test(code)) return fail(res, 400, 'Mã chỉ gồm chữ in hoa, số, gạch ngang hoặc gạch dưới.');
    if (!['balance', 'vip'].includes(rewardType)) return fail(res, 400, 'Loại phần thưởng không hợp lệ.');
    if (!Number.isSafeInteger(rewardValue) || rewardValue < 1 || rewardValue > 100000000) return fail(res, 400, 'Giá trị phần thưởng không hợp lệ.');
    if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 1000000) return fail(res, 400, 'Số lượt sử dụng không hợp lệ.');
    if (rewardType === 'vip' && rewardValue > 10) return fail(res, 400, 'Cấp VIP tối đa là 10.');
    const result = await appDataService.createGiftcode({ code, rewardType, rewardValue, maxUses, expiresAt });
    if (result.error) return fail(res, 409, 'Mã giftcode đã tồn tại.');
    return ok(res, result, 201);
  } catch (error) { return next(error); }
});
router.patch('/admin/giftcodes/:id', ...admin, async (req, res, next) => {
  try {
    const result = await appDataService.setGiftcodeActive(req.params.id, req.body?.active);
    if (!result) return fail(res, 404, 'Không tìm thấy giftcode.');
    return ok(res, result);
  } catch (error) { return next(error); }
});

router.get('/admin/users', ...admin, (_req, res) =>
  ok(res, appDataService.getAdminOverview(userService.getUsers()).users)
);
router.patch('/admin/users/:id', ...admin, async (req, res, next) => {
  try {
    const user = userService.getUser(req.params.id);
    if (!user) return fail(res, 404, 'Không tìm thấy thành viên.');
    const body = req.body || {};
    if (body.balanceDelta !== undefined) {
      const delta = Number(body.balanceDelta);
      const nextBalance = Number(user.balance || 0) + delta;
      if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(nextBalance) || nextBalance < 0) {
        return fail(res, 400, 'Số dư điều chỉnh không hợp lệ.');
      }
      user.balance = nextBalance;
    }
    if (body.vipLevel !== undefined) {
      const level = Number(body.vipLevel);
      if (!Number.isSafeInteger(level) || level < 0 || level > 10) return fail(res, 400, 'Cấp VIP phải từ 0 đến 10.');
      user.vipLevel = level;
    }
    await userService.saveDatabase();
    return ok(res, {
      id: String(req.params.id),
      balance: Number(user.balance || 0),
      vipLevel: Number(user.vipLevel || 0)
    });
  } catch (error) { return next(error); }
});

router.post('/admin/broadcast', ...admin, async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (message.length < 2 || message.length > 3500) {
      return fail(res, 400, 'Nội dung thông báo phải từ 2 đến 3.500 ký tự.');
    }
    const result = await botController.broadcastToUsers('📢 THÔNG BÁO TỪ HENDY\\n\\n' + message);
    return ok(res, result);
  } catch (error) { return next(error); }
});

router.get('/admin/tickets', ...admin, (_req, res) => ok(res, appDataService.listTickets(null)));
router.patch('/admin/tickets/:id', ...admin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '');
    const reply = String(req.body?.reply || '').trim();
    const result = await appDataService.updateTicket(req.params.id, status, reply);
    if (!result) return fail(res, 404, 'Không tìm thấy yêu cầu hỗ trợ hoặc trạng thái không hợp lệ.');
    if (status === 'answered' && reply) {
      try {
        await botController.sendUserMessage(
          result.userId,
          '💬 PHẢN HỒI TỪ HENDY CSKH\\n\\n' + reply
        );
      } catch (error) {
        return fail(res, 503, 'Đã lưu phản hồi nhưng Bot chưa gửi được tin nhắn Telegram. Hãy kiểm tra trạng thái Bot.');
      }
    }
    return ok(res, result);
  } catch (error) { return next(error); }
});

module.exports = router;
