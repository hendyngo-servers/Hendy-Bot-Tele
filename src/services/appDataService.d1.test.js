const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-app-d1-'));
process.env.DATA_DIR = dataDir;
delete process.env.MONGODB_URI;
process.env.CLOUDFLARE_ACCOUNT_ID = '918ff2f016938fc978ed23b96505b21e';
process.env.CLOUDFLARE_D1_DATABASE_ID = '11111111-2222-4333-8444-555555555555';
process.env.CLOUDFLARE_API_TOKEN = 'test-d1-api-token';
const originalFetch = globalThis.fetch;
const records = new Map();
const settings = new Map();

globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  const execute = statement => {
    const sql = statement.sql.trim();
    const params = statement.params || [];

    if (/^CREATE TABLE|^CREATE INDEX/i.test(sql)) {
      return { success: true, results: [] };
    }
    if (/^SELECT collection, record_id, data_json FROM hendy_app_records/i.test(sql)) {
      return { success: true, results: [...records.values()] };
    }
    if (/^SELECT setting_key, value_json FROM hendy_app_settings/i.test(sql)) {
      const row = settings.get(params[0]);
      return { success: true, results: row ? [row] : [] };
    }
    if (/^INSERT INTO hendy_app_records/i.test(sql)) {
      const [collection, recordId, userId, createdAt, dataJson, updatedAt] = params;
      records.set(collection + ':' + recordId, {
        collection,
        record_id: recordId,
        user_id: userId || null,
        created_at: createdAt,
        data_json: dataJson,
        updated_at: updatedAt
      });
      return { success: true, results: [] };
    }
    if (/^DELETE FROM hendy_app_records/i.test(sql)) {
      records.delete(params[0] + ':' + params[1]);
      return { success: true, results: [] };
    }
    if (/^INSERT INTO hendy_app_settings/i.test(sql)) {
      settings.set(params[0], {
        setting_key: params[0],
        value_json: params[1],
        updated_at: params[2]
      });
      return { success: true, results: [] };
    }
    throw new Error('Unexpected mocked D1 SQL: ' + sql);
  };

  return new Response(JSON.stringify({
    success: true,
    result: body.batch ? body.batch.map(execute) : [execute(body)]
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const service = require('./appDataService');

test('appDataService imports JSON records and persists subsequent changes to D1', async () => {
  const legacy = {
    linkedAccounts: [{
      id: 'linked-1',
      userId: 'member-1',
      brand: 'QQ88',
      username: 'member-name',
      miniCode: 'member-name',
      encryptedPassword: 'ciphertext-only',
      createdAt: '2026-01-01T00:00:00.000Z'
    }],
    deposits: [],
    tickets: [],
    catalog: [{
      id: 'catalog-1',
      category: 'tool',
      name: 'Tool D1',
      description: 'D1 migration test',
      price: 10000,
      durationDays: 7,
      vipLevel: 0,
      stock: null,
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z'
    }],
    orders: [],
    giftcodes: [],
    referrals: [],
    paymentSettings: {
      bankBin: '970422',
      bankName: 'MB',
      bankAccount: '0123456789',
      bankAccountName: 'HENDY TEST',
      minDeposit: 20000
    }
  };
  fs.writeFileSync(path.join(dataDir, 'app-data.json'), JSON.stringify(legacy));

  await service.init();
  assert.equal(service.listAdminCatalog()[0].name, 'Tool D1');
  assert.equal(service.getPaymentSettings().bankAccount, '0123456789');
  assert.equal(service.listLinkedAccounts('member-1').length, 1);

  const backup = fs.readdirSync(dataDir).find(name => name.startsWith('app-data.json.migrated-d1-'));
  assert.ok(backup, 'legacy app-data JSON is backed up after import');

  await service.createTicket('member-2', 'Yêu cầu hỗ trợ D1');
  await service.saveCatalogItem({
    category: 'code',
    name: 'Code mới',
    description: '',
    price: 25000,
    durationDays: 0,
    vipLevel: 0,
    stock: null,
    active: true
  });

  await service.init();
  assert.equal(service.listTickets('member-2').length, 1);
  assert.equal(service.listAdminCatalog().length, 2);
  assert.equal(service.getPaymentSettings().bankName, 'MB');
});

test.after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});
