const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const { CloudflareD1Client } = require('./cloudflareD1Service');
const mongoService = require('./mongoService');

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const legacyFile = path.join(dir, 'users.json');

let users = {};
let pool = null;
let mongoUsers = null;
let d1Client = null;
let activeStore = 'json';
let persistedSnapshot = {};
let queue = Promise.resolve();

function normalizeUser(id, value = {}) {
  const balance = Number(value.balance || 0);
  const vipLevel = Number(value.vipLevel || value.vip_level || 0);
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new Error('Số dư của thành viên ' + id + ' không phải số nguyên an toàn.');
  }
  if (!Number.isSafeInteger(vipLevel) || vipLevel < 0 || vipLevel > 10) {
    throw new Error('Cấp VIP của thành viên ' + id + ' không hợp lệ.');
  }
  const createdAt = value.createdAt || value.created_at || new Date();
  const createdAtDate = new Date(createdAt);
  if (Number.isNaN(createdAtDate.getTime())) {
    throw new Error('Ngày tạo hồ sơ của thành viên ' + id + ' không hợp lệ.');
  }
  return {
    id: String(id),
    name: String(value.name || 'Người dùng').slice(0, 160),
    username: value.username ? String(value.username).replace(/^@/, '').slice(0, 64) : null,
    balance,
    vipLevel,
    createdAt: createdAtDate.toISOString()
  };
}

async function readLegacyUsers() {
  try {
    const raw = await fs.readFile(legacyFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Tệp users.json không có định dạng object.');
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Không đọc được users.json cũ: ' + error.message);
  }
}

async function persistJson(snapshot) {
  await fs.mkdir(dir, { recursive: true });
  const temporaryFile = legacyFile + '.tmp';
  await fs.writeFile(temporaryFile, JSON.stringify(snapshot, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  });
  await fs.rename(temporaryFile, legacyFile);
}

async function persistPostgres(snapshot) {
  if (!pool) throw new Error('PostgreSQL chưa được khởi tạo.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const user of Object.values(snapshot)) {
      await client.query(
        'INSERT INTO hendy_users (telegram_id, name, username, balance, vip_level, created_at, updated_at) ' +
        'VALUES ($1, $2, $3, $4, $5, $6, NOW()) ' +
        'ON CONFLICT (telegram_id) DO UPDATE SET ' +
        'name = EXCLUDED.name, username = EXCLUDED.username, balance = EXCLUDED.balance, ' +
        'vip_level = EXCLUDED.vip_level, updated_at = NOW()',
        [user.id, user.name, user.username, user.balance, user.vipLevel, user.createdAt]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function persistMongo(snapshot) {
  if (!mongoUsers) throw new Error('MongoDB users collection chưa được khởi tạo.');
  const operations = Object.values(snapshot).map(user => ({
    updateOne: {
      filter: { _id: user.id },
      update: {
        $set: {
          name: user.name,
          username: user.username,
          balance: user.balance,
          vipLevel: user.vipLevel,
          createdAt: user.createdAt,
          updatedAt: new Date()
        },
        $setOnInsert: { _id: user.id }
      },
      upsert: true
    }
  }));
  for (let offset = 0; offset < operations.length; offset += 500) {
    await mongoUsers.bulkWrite(operations.slice(offset, offset + 500), { ordered: true });
  }
}

async function migrateLegacyUsersToMongo() {
  const legacyUsers = await readLegacyUsers();
  if (!legacyUsers) return 0;
  const operations = Object.entries(legacyUsers).map(([id, value]) => {
    const user = normalizeUser(id, value);
    return {
      updateOne: {
        filter: { _id: user.id },
        update: {
          $setOnInsert: {
            _id: user.id,
            name: user.name,
            username: user.username,
            balance: user.balance,
            vipLevel: user.vipLevel,
            createdAt: user.createdAt,
            updatedAt: new Date()
          }
        },
        upsert: true
      }
    };
  });
  for (let offset = 0; offset < operations.length; offset += 500) {
    await mongoUsers.bulkWrite(operations.slice(offset, offset + 500), { ordered: true });
  }
  const backup = legacyFile + '.migrated-mongodb-' + Date.now();
  await fs.rename(legacyFile, backup);
  console.info('[DB] Đã nhập ' + operations.length + ' hồ sơ JSON vào MongoDB. Bản sao lưu: ' + path.basename(backup));
  return operations.length;
}

async function migratePostgresUsersToMongo() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) return 0;
  const legacyPool = new Pool({
    connectionString,
    ...(String(process.env.PGSSLMODE || '').toLowerCase() === 'require'
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true
  });
  try {
    const result = await legacyPool.query(
      'SELECT telegram_id, name, username, balance, vip_level, created_at FROM hendy_users'
    );
    const operations = result.rows.map(row => {
      const user = normalizeUser(row.telegram_id, {
        name: row.name,
        username: row.username,
        balance: Number(row.balance),
        vipLevel: row.vip_level,
        createdAt: row.created_at
      });
      return {
        updateOne: {
          filter: { _id: user.id },
          update: {
            $setOnInsert: {
              _id: user.id,
              name: user.name,
              username: user.username,
              balance: user.balance,
              vipLevel: user.vipLevel,
              createdAt: user.createdAt,
              updatedAt: new Date()
            }
          },
          upsert: true
        }
      };
    });
    for (let offset = 0; offset < operations.length; offset += 500) {
      await mongoUsers.bulkWrite(operations.slice(offset, offset + 500), { ordered: true });
    }
    console.info('[DB] Đã nhập ' + operations.length + ' hồ sơ từ PostgreSQL cũ vào MongoDB (không ghi đè ID đã có).');
    return operations.length;
  } catch (error) {
    if (error.code === '42P01') {
      console.warn('[DB] Bỏ qua migration PostgreSQL: chưa có bảng hendy_users.');
      return 0;
    }
    throw error;
  } finally {
    await legacyPool.end();
  }
}

async function migrateD1UsersToMongo() {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_D1_DATABASE_ID || !process.env.CLOUDFLARE_API_TOKEN) return 0;
  const client = CloudflareD1Client.fromEnv();
  client.validateConfig();
  const result = await client.query(
    'SELECT telegram_id, name, username, balance, vip_level, created_at FROM hendy_users'
  );
  const operations = (result.results || []).map(row => {
    const user = normalizeUser(row.telegram_id, {
      name: row.name,
      username: row.username,
      balance: Number(row.balance),
      vipLevel: row.vip_level,
      createdAt: row.created_at
    });
    return {
      updateOne: {
        filter: { _id: user.id },
        update: {
          $setOnInsert: {
            _id: user.id,
            name: user.name,
            username: user.username,
            balance: user.balance,
            vipLevel: user.vipLevel,
            createdAt: user.createdAt,
            updatedAt: new Date()
          }
        },
        upsert: true
      }
    };
  });
  for (let offset = 0; offset < operations.length; offset += 500) {
    await mongoUsers.bulkWrite(operations.slice(offset, offset + 500), { ordered: true });
  }
  console.info('[DB] Đã nhập ' + operations.length + ' hồ sơ từ Cloudflare D1 vào MongoDB (không ghi đè ID đã có).');
  return operations.length;
}

async function loadMongo() {
  const database = await mongoService.connectMongo();
  mongoUsers = database.collection('users');
  await mongoUsers.createIndex({ createdAt: -1 });
  // D1 is the former primary store, so import it before older PostgreSQL/JSON backups.
  await migrateD1UsersToMongo();
  await migratePostgresUsersToMongo();
  await migrateLegacyUsersToMongo();
  const documents = await mongoUsers.find({}).sort({ createdAt: 1 }).toArray();
  const loaded = {};
  for (const document of documents) {
    loaded[String(document._id)] = normalizeUser(document._id, document);
  }
  users = loaded;
  persistedSnapshot = cloneUsers(loaded);
  activeStore = 'mongodb';
  console.info('[DB] MongoDB Atlas sẵn sàng. Đã tải ' + documents.length + ' thành viên.');
}

function persist() {
  const rawSnapshot = JSON.parse(JSON.stringify(users));
  const snapshot = {};
  for (const [id, user] of Object.entries(rawSnapshot)) {
    snapshot[id] = normalizeUser(id, user);
  }
  queue = queue.catch(() => {}).then(async () => {
    if (activeStore === 'd1') await persistD1Snapshot(snapshot);
    else if (activeStore === 'mongodb') await persistMongo(snapshot);
    else if (pool) await persistPostgres(snapshot);
    else await persistJson(snapshot);
  });
  return queue;
}

async function migrateLegacyUsers() {
  const legacyUsers = await readLegacyUsers();
  if (!legacyUsers) return 0;

  const client = await pool.connect();
  let imported = 0;
  try {
    await client.query('BEGIN');
    for (const [id, value] of Object.entries(legacyUsers)) {
      const user = normalizeUser(id, value);
      const result = await client.query(
        'INSERT INTO hendy_users (telegram_id, name, username, balance, vip_level, created_at, updated_at) ' +
        'VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (telegram_id) DO NOTHING',
        [user.id, user.name, user.username, user.balance, user.vipLevel, user.createdAt]
      );
      imported += result.rowCount;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Chỉ đổi tên tệp JSON sau khi transaction đã commit thành công.
  const backupFile = legacyFile + '.migrated-' + Date.now();
  await fs.rename(legacyFile, backupFile);
  console.info('[DB] Đã nhập ' + imported + ' thành viên từ JSON vào PostgreSQL. Bản sao lưu: ' + path.basename(backupFile));
  return imported;
}

function cloneUsers(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function d1UserQuery(user, updateExisting) {
  const sql = updateExisting
    ? 'INSERT INTO hendy_users ' +
      '(telegram_id, name, username, balance, vip_level, created_at, updated_at) ' +
      'VALUES (?, ?, NULLIF(?, \'\'), ?, ?, ?, ?) ' +
      'ON CONFLICT (telegram_id) DO UPDATE SET ' +
      'name = excluded.name, username = excluded.username, balance = excluded.balance, ' +
      'vip_level = excluded.vip_level, updated_at = excluded.updated_at'
    : 'INSERT INTO hendy_users ' +
      '(telegram_id, name, username, balance, vip_level, created_at, updated_at) ' +
      'VALUES (?, ?, NULLIF(?, \'\'), ?, ?, ?, ?) ' +
      'ON CONFLICT (telegram_id) DO NOTHING';
  const updatedAt = new Date().toISOString();
  return {
    sql,
    params: [
      user.id,
      user.name,
      user.username || '',
      String(user.balance),
      String(user.vipLevel),
      user.createdAt,
      updatedAt
    ]
  };
}

async function writeD1Users(records, updateExisting) {
  if (!d1Client) throw new Error('Cloudflare D1 chưa được khởi tạo.');
  const rows = Array.isArray(records) ? records : [];
  for (let offset = 0; offset < rows.length; offset += 50) {
    const queries = rows.slice(offset, offset + 50).map(user => d1UserQuery(user, updateExisting));
    if (queries.length) await d1Client.batch(queries);
  }
}

async function persistD1Snapshot(snapshot) {
  const changed = [];
  for (const [id, user] of Object.entries(snapshot)) {
    if (JSON.stringify(user) !== JSON.stringify(persistedSnapshot[id])) {
      changed.push(user);
    }
  }
  if (!changed.length) return;
  await writeD1Users(changed, true);
  persistedSnapshot = cloneUsers(snapshot);
}

async function migrateLegacyUsersToD1() {
  const legacyUsers = await readLegacyUsers();
  if (!legacyUsers) return 0;
  const normalized = Object.entries(legacyUsers).map(([id, value]) => normalizeUser(id, value));
  await writeD1Users(normalized, false);

  const backupFile = legacyFile + '.migrated-d1-' + Date.now();
  await fs.rename(legacyFile, backupFile);
  console.info('[DB] Đã nhập ' + normalized.length + ' hồ sơ JSON vào Cloudflare D1. Bản sao lưu: ' + path.basename(backupFile));
  return normalized.length;
}

async function migratePostgresUsersToD1() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) return 0;

  const legacyPool = new Pool({
    connectionString,
    ...(String(process.env.PGSSLMODE || '').toLowerCase() === 'require'
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true
  });

  try {
    const result = await legacyPool.query(
      'SELECT telegram_id, name, username, balance, vip_level, created_at ' +
      'FROM hendy_users ORDER BY created_at ASC'
    );
    const records = result.rows.map(row => {
      const balance = Number(row.balance);
      if (!Number.isSafeInteger(balance) || balance < 0) {
        throw new Error('Số dư PostgreSQL của Telegram ID ' + row.telegram_id + ' không hợp lệ.');
      }
      return normalizeUser(row.telegram_id, {
        name: row.name,
        username: row.username,
        balance,
        vipLevel: row.vip_level,
        createdAt: row.created_at
      });
    });
    await writeD1Users(records, false);
    console.info('[DB] Đã đồng bộ ' + records.length + ' hồ sơ PostgreSQL sang Cloudflare D1 (không ghi đè ID đã có).');
    return records.length;
  } catch (error) {
    if (error.code === '42P01') {
      console.warn('[DB] Bỏ qua migration PostgreSQL: chưa có bảng hendy_users.');
      return 0;
    }
    throw error;
  } finally {
    await legacyPool.end();
  }
}

async function loadD1() {
  d1Client = CloudflareD1Client.fromEnv();
  d1Client.validateConfig();
  await d1Client.query(
    'CREATE TABLE IF NOT EXISTS hendy_users (' +
    'telegram_id TEXT PRIMARY KEY, ' +
    'name TEXT NOT NULL, ' +
    'username TEXT, ' +
    'balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0), ' +
    'vip_level INTEGER NOT NULL DEFAULT 0 CHECK (vip_level BETWEEN 0 AND 10), ' +
    'created_at TEXT NOT NULL, ' +
    'updated_at TEXT NOT NULL)'
  );
  await d1Client.query(
    'CREATE INDEX IF NOT EXISTS hendy_users_created_at_idx ON hendy_users (created_at DESC)'
  );

  await migrateLegacyUsersToD1();
  await migratePostgresUsersToD1();

  const result = await d1Client.query(
    'SELECT telegram_id, name, username, balance, vip_level, created_at ' +
    'FROM hendy_users ORDER BY created_at ASC'
  );
  const loaded = {};
  for (const row of result.results || []) {
    const balance = Number(row.balance);
    if (!Number.isSafeInteger(balance) || balance < 0) {
      throw new Error('Số dư của Telegram ID ' + row.telegram_id + ' vượt giới hạn số nguyên an toàn của ứng dụng.');
    }
    loaded[row.telegram_id] = normalizeUser(row.telegram_id, {
      name: row.name,
      username: row.username,
      balance,
      vipLevel: row.vip_level,
      createdAt: row.created_at
    });
  }
  users = loaded;
  persistedSnapshot = cloneUsers(loaded);
  activeStore = 'd1';
  console.info('[DB] Cloudflare D1 sẵn sàng. Đã tải ' + result.results?.length + ' thành viên.');
}

async function loadPostgres() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('DATABASE_URL chưa được cấu hình.');

  pool = new Pool({
    connectionString,
    ...(String(process.env.PGSSLMODE || '').toLowerCase() === 'require'
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
    max: Math.max(1, Math.min(20, Number(process.env.PGPOOL_MAX) || 5)),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true
  });

  pool.on('error', error => {
    console.error('[DB] PostgreSQL pool error:', error.message);
  });

  try {
    await pool.query('SELECT 1');
    await pool.query(
      'CREATE TABLE IF NOT EXISTS hendy_users (' +
      'telegram_id TEXT PRIMARY KEY, ' +
      'name TEXT NOT NULL, ' +
      'username TEXT, ' +
      'balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0), ' +
      'vip_level INTEGER NOT NULL DEFAULT 0 CHECK (vip_level BETWEEN 0 AND 10), ' +
      'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ' +
      'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'
    );
    await pool.query(
      'CREATE INDEX IF NOT EXISTS hendy_users_created_at_idx ON hendy_users (created_at DESC)'
    );

    await migrateLegacyUsers();

    const result = await pool.query(
      'SELECT telegram_id, name, username, balance, vip_level, created_at ' +
      'FROM hendy_users ORDER BY created_at ASC'
    );
    const loaded = {};
    for (const row of result.rows) {
      const balance = Number(row.balance);
      if (!Number.isSafeInteger(balance) || balance < 0) {
        throw new Error('Số dư của Telegram ID ' + row.telegram_id + ' vượt giới hạn số nguyên an toàn của ứng dụng.');
      }
      loaded[row.telegram_id] = normalizeUser(row.telegram_id, {
        name: row.name,
        username: row.username,
        balance,
        vipLevel: row.vip_level,
        createdAt: row.created_at
      });
    }
    users = loaded;
    persistedSnapshot = cloneUsers(loaded);
    activeStore = 'postgres';
    console.info('[DB] PostgreSQL sẵn sàng. Đã tải ' + result.rowCount + ' thành viên.');
  } catch (error) {
    await pool.end().catch(() => {});
    pool = null;
    throw error;
  }
}

async function loadDatabase() {
  if (mongoService.hasConfig()) {
    await loadMongo();
    return;
  }
  if (CloudflareD1Client.hasAnyEnvironmentConfig()) {
    await loadD1();
    return;
  }
  if (process.env.DATABASE_URL) {
    await loadPostgres();
    return;
  }

  // JSON chỉ còn là adapter cho local development. Render production phải dùng PostgreSQL.
  await fs.mkdir(dir, { recursive: true });
  try {
    const value = JSON.parse(await fs.readFile(legacyFile, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Tệp người dùng không đúng định dạng.');
    }
    const loaded = {};
    for (const [id, item] of Object.entries(value)) loaded[id] = normalizeUser(id, item);
    users = loaded;
    persistedSnapshot = cloneUsers(loaded);
    activeStore = 'json';
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await fs.rename(legacyFile, legacyFile + '.corrupt-' + Date.now()).catch(() => {});
      console.error('Dữ liệu người dùng lỗi; đã cách ly tệp lỗi:', error.message);
    }
    users = {};
    persistedSnapshot = {};
    activeStore = 'json';
    await persist();
  }
}

function initUser(chatId, telegramUser = {}) {
  const id = String(chatId);
  const name = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || 'Người dùng';
  let changed = false;

  if (!users[id]) {
    users[id] = {
      id,
      name,
      username: telegramUser.username || null,
      balance: 0,
      vipLevel: 0,
      createdAt: new Date().toISOString()
    };
    changed = true;
  } else {
    if (users[id].name !== name) {
      users[id].name = name;
      changed = true;
    }
    const username = telegramUser.username || users[id].username || null;
    if (users[id].username !== username) {
      users[id].username = username;
      changed = true;
    }
  }

  if (changed) {
    persist().catch(error => console.error('[DB] Không lưu được hồ sơ thành viên:', error.message));
  }
  return users[id];
}

async function closeDatabase() {
  await queue.catch(() => {});
  if (mongoService.isConnected()) await mongoService.closeMongo();
  mongoUsers = null;
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

module.exports = {
  loadDatabase,
  saveDatabase: persist,
  initUser,
  getUser: id => users[String(id)] || null,
  getUsers: () => users,
  closeDatabase,
  isPostgres: () => activeStore === 'postgres' && Boolean(pool),
  isMongo: () => activeStore === 'mongodb' && Boolean(mongoUsers && mongoService.isConnected()),
  isCloudflareD1: () => activeStore === 'd1' && Boolean(d1Client?.isConfigured())
};
