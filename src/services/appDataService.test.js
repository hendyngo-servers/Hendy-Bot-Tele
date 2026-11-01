const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-app-data-'));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
delete process.env.RENDER;
delete process.env.RENDER_EXTERNAL_URL;
delete process.env.RENDER_SERVICE_ID;

const service = require('./appDataService');
const jsonDatabase = require('./jsonDatabase');

async function resetData() {
  await jsonDatabase.resetForTests();
  await service.init();
}

test('dịch vụ dữ liệu lưu cấu hình QR, đơn hàng, giftcode, REF và hỗ trợ', async t => {
  try {
    await resetData();

    await t.test('cấu hình QR và duyệt nạp chỉ một lần', async () => {
      await resetData();
      await service.updatePaymentSettings({
        bankBin: '970422',
        bankName: 'MB',
        bankAccount: '0123456789',
        bankAccountName: 'HENDY TEST',
        minDeposit: 20000
      });

      const deposit = await service.createDeposit('user-1', 50000);
      assert.equal(deposit.status, 'pending');
      assert.match(deposit.qrUrl, /amount=50000/);
      assert.match(deposit.qrUrl, /addInfo=/);

      let applied = 0;
      const first = service.processDeposit(deposit.id, 'paid', 'admin-1', async () => {
        applied += 1;
      });
      const second = service.processDeposit(deposit.id, 'paid', 'admin-1', async () => {
        applied += 1;
      });
      const results = await Promise.all([first, second]);

      assert.equal(results.filter(item => !item.error).length, 1);
      assert.equal(results.filter(item => item.error === 'already_processed').length, 1);
      assert.equal(applied, 1);
      assert.equal(service.listAllDeposits()[0].status, 'paid');
    });

    await t.test('đơn hàng kiểm tra tồn kho và trừ đúng một sản phẩm', async () => {
      await resetData();
      const item = await service.saveCatalogItem({
        category: 'vip',
        name: 'VIP cấp 2',
        description: 'Gói nâng cấp thử nghiệm',
        price: 150000,
        durationDays: 0,
        vipLevel: 2,
        stock: 1,
        active: true
      });

      const order = await service.createOrder('user-2', item.id);
      assert.equal(order.status, 'pending');
      assert.equal(order.vipLevel, 2);

      const result = await service.processOrder(order.id, 'approved', 'admin-1');
      assert.equal(result.order.status, 'approved');
      assert.equal(service.listAdminCatalog()[0].stock, 0);

      const secondOrder = await service.createOrder('user-3', item.id);
      assert.equal(secondOrder.error, 'out_of_stock');
    });

    await t.test('giftcode giới hạn số lần và không cho một người đổi hai lần', async () => {
      await resetData();
      await service.createGiftcode({
        code: 'HENDY-TEST-2026',
        rewardType: 'balance',
        rewardValue: 25000,
        maxUses: 2,
        expiresAt: null
      });

      const first = await service.redeemGiftcode('user-1', 'hendy-test-2026');
      assert.equal(first.rewardType, 'balance');
      assert.equal(first.rewardValue, 25000);

      const duplicate = await service.redeemGiftcode('user-1', 'HENDY-TEST-2026');
      assert.equal(duplicate.error, 'used');

      const second = await service.redeemGiftcode('user-2', 'HENDY-TEST-2026');
      assert.equal(second.rewardType, 'balance');

      const exhausted = await service.redeemGiftcode('user-3', 'HENDY-TEST-2026');
      assert.equal(exhausted.error, 'exhausted');
    });

    await t.test('REF ghi nhận một lần và tính hoa hồng theo cấu hình', async () => {
      await resetData();
      assert.equal(await service.registerReferral('referrer-1', 'new-user-1'), true);
      assert.equal(await service.registerReferral('referrer-2', 'new-user-1'), false);
      assert.equal(await service.registerReferral('new-user-1', 'new-user-1'), false);

      await service.updatePaymentSettings({ referralCommissionPercent: 5 });
      const users = { 'referrer-1': { balance: 0 } };
      const commission = await service.addReferralCommission('new-user-1', 200000, users);

      assert.equal(commission, 10000);
      assert.equal(users['referrer-1'].balance, 10000);
      assert.equal(service.getReferralStats('referrer-1').invited, 1);
      assert.equal(service.getReferralStats('referrer-1').commission, 10000);
    });

    await t.test('đơn dịch vụ có thời hạn và lịch sử hoạt động của thành viên', async () => {
      await resetData();
      const item = await service.saveCatalogItem({
        category: 'tool',
        name: 'Tool thuê 7 ngày',
        description: 'Gói dịch vụ có thời hạn',
        price: 70000,
        durationDays: 7,
        vipLevel: 0,
        stock: null,
        active: true
      });
      const order = await service.createOrder('user-5', item.id);
      const result = await service.processOrder(order.id, 'approved', 'admin-1');
      assert.equal(result.order.status, 'approved');
      assert.ok(result.order.activatedAt);
      assert.ok(result.order.expiresAt);
      assert.equal(
        Math.round((Date.parse(result.order.expiresAt) - Date.parse(result.order.activatedAt)) / 86400000),
        7
      );
      const history = service.getActivity('user-5');
      assert.equal(history.length, 1);
      assert.equal(history[0].type, 'order');
      assert.equal(history[0].status, 'approved');
      assert.ok(history[0].expiresAt);
    });

    await t.test('ticket lưu phản hồi và trạng thái', async () => {
      await resetData();
      const ticket = await service.createTicket('user-4', 'Tôi cần hỗ trợ tài khoản.');
      const updated = await service.updateTicket(ticket.id, 'answered', 'Đã tiếp nhận yêu cầu của bạn.');
      assert.equal(updated.status, 'answered');
      assert.equal(updated.reply, 'Đã tiếp nhận yêu cầu của bạn.');
      assert.equal(service.listTickets('user-4')[0].status, 'answered');
    });
  } finally {
    await jsonDatabase.flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
