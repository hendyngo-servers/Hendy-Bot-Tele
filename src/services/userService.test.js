const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-users-'));
process.env.DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.MONGODB_URI;

const userService = require('./userService');

test('userService local adapter persists user profiles and balances', async () => {
  await userService.loadDatabase();

  const user = userService.initUser('100200300', {
    first_name: 'Hendy',
    last_name: 'Test',
    username: 'hendy_test'
  });
  assert.equal(user.name, 'Hendy Test');
  assert.equal(user.username, 'hendy_test');

  user.balance = 250000;
  user.vipLevel = 2;
  await userService.saveDatabase();

  await userService.loadDatabase();
  const reloaded = userService.getUser('100200300');
  assert.ok(reloaded);
  assert.equal(reloaded.balance, 250000);
  assert.equal(reloaded.vipLevel, 2);
  assert.equal(reloaded.username, 'hendy_test');

  const file = path.join(dataDir, 'users.json');
  assert.ok(fs.existsSync(file));
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved['100200300'].balance, 250000);
});

test('userService does not accept unsafe balance or VIP values', async () => {
  await userService.loadDatabase();
  userService.getUsers()['invalid-user'] = {
    id: 'invalid-user',
    name: 'Invalid',
    username: null,
    balance: Number.MAX_SAFE_INTEGER + 1,
    vipLevel: 0,
    createdAt: new Date().toISOString()
  };
  assert.throws(() => userService.saveDatabase(), /số nguyên an toàn/i);
  delete userService.getUsers()['invalid-user'];
});

test.after(async () => {
  await userService.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
