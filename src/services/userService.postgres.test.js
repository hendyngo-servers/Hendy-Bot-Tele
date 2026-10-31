const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databaseUrl = process.env.DATABASE_URL;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-users-postgres-'));
process.env.DATA_DIR = dataDir;

const userService = require('./userService');

test('userService migrates legacy users.json into PostgreSQL and persists updates', {
  skip: !databaseUrl
}, async () => {
  const legacyId = 'legacy-' + process.pid;
  const currentId = 'postgres-' + process.pid;
  const legacyFile = path.join(dataDir, 'users.json');

  fs.writeFileSync(legacyFile, JSON.stringify({
    [legacyId]: {
      id: legacyId,
      name: 'Thành viên cũ',
      username: 'legacy_member',
      balance: 765432,
      vipLevel: 3,
      createdAt: '2026-01-15T12:00:00.000Z'
    }
  }));

  await userService.loadDatabase();
  assert.equal(userService.isPostgres(), true);

  const migrated = userService.getUser(legacyId);
  assert.ok(migrated);
  assert.equal(migrated.balance, 765432);
  assert.equal(migrated.vipLevel, 3);
  assert.equal(migrated.username, 'legacy_member');

  const backup = fs.readdirSync(dataDir).find(name => name.startsWith('users.json.migrated-'));
  assert.ok(backup, 'legacy JSON is renamed to a backup after the import commits');

  const current = userService.initUser(currentId, {
    first_name: 'Postgres',
    last_name: 'Test',
    username: 'postgres_test'
  });
  current.balance = 420000;
  current.vipLevel = 2;
  await userService.saveDatabase();

  await userService.closeDatabase();
  await userService.loadDatabase();

  const reloaded = userService.getUser(currentId);
  assert.ok(reloaded);
  assert.equal(reloaded.balance, 420000);
  assert.equal(reloaded.vipLevel, 2);
  assert.equal(userService.getUser(legacyId).balance, 765432);
});

test.after(async () => {
  await userService.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
