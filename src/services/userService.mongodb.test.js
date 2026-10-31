const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const uri = process.env.MONGODB_URI;
const dbName = 'hendy_user_test_' + process.pid;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-users-mongo-'));
process.env.DATA_DIR = dataDir;
process.env.MONGODB_DB_NAME = dbName;

const userService = require('./userService');

test('userService imports legacy JSON and persists member profiles in MongoDB Atlas', {
  skip: !uri
}, async () => {
  const legacyId = 'legacy-mongo-' + process.pid;
  const currentId = 'mongo-user-' + process.pid;
  fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify({
    [legacyId]: {
      id: legacyId,
      name: 'Thành viên cũ Mongo',
      username: 'legacy_mongo',
      balance: 654321,
      vipLevel: 3,
      createdAt: '2026-01-15T12:00:00.000Z'
    }
  }));

  await userService.loadDatabase();
  assert.equal(userService.isMongo(), true);
  const migrated = userService.getUser(legacyId);
  assert.ok(migrated);
  assert.equal(migrated.balance, 654321);
  assert.equal(migrated.vipLevel, 3);
  assert.equal(migrated.username, 'legacy_mongo');
  assert.ok(fs.readdirSync(dataDir).some(name => name.startsWith('users.json.migrated-mongodb-')));

  const current = userService.initUser(currentId, {
    first_name: 'MongoDB',
    last_name: 'Atlas',
    username: 'mongo_atlas'
  });
  current.balance = 987654;
  current.vipLevel = 4;
  await userService.saveDatabase();
  await userService.closeDatabase();

  await userService.loadDatabase();
  const reloaded = userService.getUser(currentId);
  assert.ok(reloaded);
  assert.equal(reloaded.balance, 987654);
  assert.equal(reloaded.vipLevel, 4);
  assert.equal(userService.getUser(legacyId).balance, 654321);
});

test.after(async () => {
  await userService.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
