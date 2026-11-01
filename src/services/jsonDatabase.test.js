const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'hendy-json-db-'));
process.env.DATA_DIR = dataDir;
const database = require('./jsonDatabase');

test('database.json migrates legacy users and app-data JSON files', async () => {
  const oldUsers = {
    '1001': {
      id: '1001',
      name: 'Thành viên cũ',
      balance: 12345,
      vipLevel: 1,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  };
  const oldAppData = {
    catalog: [{ id: 'item-1', name: 'Sản phẩm cũ' }],
    paymentSettings: { bankName: 'MB' }
  };
  await fs.writeFile(path.join(dataDir, 'users.json'), JSON.stringify(oldUsers));
  await fs.writeFile(path.join(dataDir, 'app-data.json'), JSON.stringify(oldAppData));

  await database.init();
  assert.deepEqual(database.getSection('users'), oldUsers);
  assert.deepEqual(database.getSection('appData'), oldAppData);

  const saved = JSON.parse(await fs.readFile(database.getDatabaseFilePath(), 'utf8'));
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.users['1001'].balance, 12345);
  assert.equal(saved.appData.catalog[0].id, 'item-1');

  const names = await fs.readdir(dataDir);
  assert.ok(names.some(name => name.startsWith('users.json.migrated-to-database-')));
  assert.ok(names.some(name => name.startsWith('app-data.json.migrated-to-database-')));
});

test('section writes are serialized and preserve unrelated sections', async () => {
  await database.writeSection('users', { member: { balance: 9000 } });
  await database.writeSection('appData', { tickets: [{ id: 'ticket-1' }] });
  const saved = JSON.parse(await fs.readFile(database.getDatabaseFilePath(), 'utf8'));
  assert.equal(saved.users.member.balance, 9000);
  assert.equal(saved.appData.tickets[0].id, 'ticket-1');
  assert.ok(saved.updatedAt);
});

test('corrupted database is rejected without overwriting its bytes', async () => {
  const corrupt = '{ this is not json';
  await fs.writeFile(database.getDatabaseFilePath(), corrupt);
  await database.reloadForTests().catch(() => {});
  await assert.rejects(database.init(), /Không thể đọc database\.json/);
  assert.equal(await fs.readFile(database.getDatabaseFilePath(), 'utf8'), corrupt);
});

test.after(async () => {
  await database.flush().catch(() => {});
  await fs.rm(dataDir, { recursive: true, force: true });
});
