const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const uri = process.env.MONGODB_TEST_URI;
const dbName = 'hendy_app_test_' + process.pid;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-app-mongo-'));
process.env.DATA_DIR = dataDir;
process.env.MONGODB_DB_NAME = dbName;

const service = require('./appDataService');
const mongoService = require('./mongoService');

test('appDataService migrates app-data.json and persists bot business collections in MongoDB', {
  skip: !uri
}, async () => {
  const legacyFile = path.join(dataDir, 'app-data.json');
  fs.writeFileSync(legacyFile, JSON.stringify({
    linkedAccounts: [{
      id: 'legacy-link-' + process.pid,
      userId: 'member-1',
      brand: 'QQ88',
      username: 'member',
      miniCode: 'member',
      encryptedPassword: 'encrypted-only',
      createdAt: '2026-01-01T00:00:00.000Z'
    }],
    deposits: [],
    tickets: [],
    catalog: [],
    orders: [],
    giftcodes: [],
    referrals: [],
    paymentSettings: {
      bankBin: '970422',
      bankName: 'MB',
      bankAccount: '123456789',
      bankAccountName: 'HENDY TEST',
      minDeposit: 20000
    }
  }));

  await service.init();
  assert.equal(service.listLinkedAccounts('member-1').length, 1);
  assert.equal(service.getPaymentSettings().bankAccount, '123456789');
  assert.ok(fs.readdirSync(dataDir).some(name => name.startsWith('app-data.json.migrated-mongodb-')));

  await service.saveCatalogItem({
    category: 'tool',
    name: 'Mongo Tool',
    description: 'Persisted in Atlas',
    price: 25000,
    durationDays: 7,
    vipLevel: 0,
    stock: null,
    active: true
  });
  await service.createTicket('member-2', 'Cần hỗ trợ MongoDB');
  await service.updatePaymentSettings({ bankAccount: '987654321' });

  await service.init();
  assert.equal(service.listAdminCatalog()[0].name, 'Mongo Tool');
  assert.equal(service.listTickets('member-2').length, 1);
  assert.equal(service.getPaymentSettings().bankAccount, '987654321');
});

test.after(async () => {
  await mongoService.closeMongo();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
