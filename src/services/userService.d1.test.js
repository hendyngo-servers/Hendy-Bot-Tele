const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hendy-users-d1-'));
const legacyId = 'legacy-d1-' + process.pid;
const currentId = 'current-d1-' + process.pid;
process.env.DATA_DIR = dataDir;
process.env.CLOUDFLARE_ACCOUNT_ID = '918ff2f016938fc978ed23b96505b21e';
process.env.CLOUDFLARE_D1_DATABASE_ID = '11111111-2222-4333-8444-555555555555';
process.env.CLOUDFLARE_API_TOKEN = 'test-d1-api-token';
delete process.env.DATABASE_URL;
delete process.env.MONGODB_URI;

const database = new Map();
const originalFetch = globalThis.fetch;

globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  const execute = statement => {
    const sql = statement.sql;
    const params = statement.params || [];

    if (/^CREATE TABLE|^CREATE INDEX/i.test(sql.trim())) {
      return { success: true, results: [], meta: { changes: 0 } };
    }

    if (/^SELECT 1 AS connected/i.test(sql.trim())) {
      return { success: true, results: [{ connected: 1 }] };
    }

    if (/^SELECT telegram_id/i.test(sql.trim())) {
      return {
        success: true,
        results: [...database.values()].sort((a, b) =>
          String(a.created_at).localeCompare(String(b.created_at))
        )
      };
    }

    if (/^INSERT INTO hendy_users/i.test(sql.trim())) {
      const [id, name, username, balance, vipLevel, createdAt, updatedAt] = params;
      if (!database.has(id) || /DO UPDATE SET/i.test(sql)) {
        database.set(id, {
          telegram_id: id,
          name,
          username: username || null,
          balance: Number(balance),
          vip_level: Number(vipLevel),
          created_at: createdAt,
          updated_at: updatedAt
        });
      }
      return { success: true, results: [], meta: { changes: 1 } };
    }

    throw new Error('Unexpected mocked D1 SQL: ' + sql);
  };

  const result = body.batch
    ? body.batch.map(execute)
    : [execute(body)];

  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const userService = require('./userService');

test('userService imports old JSON profiles into D1 and writes subsequent changes there', async () => {
  fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify({
    [legacyId]: {
      id: legacyId,
      name: 'Thành viên JSON cũ',
      username: 'legacy_member',
      balance: 350000,
      vipLevel: 2,
      createdAt: '2026-01-12T10:00:00.000Z'
    }
  }));

  await userService.loadDatabase();
  assert.equal(userService.isCloudflareD1(), true);
  assert.equal(userService.isPostgres(), false);

  const migrated = userService.getUser(legacyId);
  assert.ok(migrated);
  assert.equal(migrated.balance, 350000);
  assert.equal(migrated.vipLevel, 2);
  assert.equal(migrated.username, 'legacy_member');

  const backup = fs.readdirSync(dataDir).find(name => name.startsWith('users.json.migrated-d1-'));
  assert.ok(backup, 'Legacy JSON is retained as a backup after successful import');

  const current = userService.initUser(currentId, {
    first_name: 'Cloudflare',
    last_name: 'D1',
    username: 'cloudflare_d1'
  });
  current.balance = 875000;
  current.vipLevel = 4;
  await userService.saveDatabase();

  await userService.loadDatabase();
  const reloaded = userService.getUser(currentId);
  assert.ok(reloaded);
  assert.equal(reloaded.balance, 875000);
  assert.equal(reloaded.vipLevel, 4);
  assert.equal(userService.getUser(legacyId).balance, 350000);
});

test.after(async () => {
  await userService.closeDatabase();
  globalThis.fetch = originalFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

