const fs = require('node:fs/promises');
const path = require('node:path');
const mongoService = require('./mongoService');

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const legacyFile = path.join(dir, 'users.json');

let users = {};
let mongoUsers = null;
let activeStore = 'json';
let queue = Promise.resolve();

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    Boolean(process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
}

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

function cloneUsers(value) {
  return JSON.parse(JSON.stringify(value || {}));
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

async function persistMongo(snapshot) {
  if (!mongoUsers || !mongoService.isConnected()) {
    throw new Error('MongoDB Atlas chưa được kết nối.');
  }
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

async function loadMongo() {
  const database = await mongoService.connectMongo();
  mongoUsers = database.collection('users');
  await mongoUsers.createIndex({ createdAt: -1 });
  await migrateLegacyUsersToMongo();

  const documents = await mongoUsers.find({}).sort({ createdAt: 1 }).toArray();
  const loaded = {};
  for (const document of documents) {
    loaded[String(document._id)] = normalizeUser(document._id, document);
  }
  users = loaded;
  activeStore = 'mongodb';
  console.info('[DB] MongoDB Atlas sẵn sàng. Đã tải ' + documents.length + ' thành viên.');
}

function persist() {
  const rawSnapshot = cloneUsers(users);
  const snapshot = {};
  for (const [id, user] of Object.entries(rawSnapshot)) {
    snapshot[id] = normalizeUser(id, user);
  }
  queue = queue.catch(() => {}).then(async () => {
    if (activeStore === 'mongodb') await persistMongo(snapshot);
    else await persistJson(snapshot);
  });
  return queue;
}

async function loadLocalJson() {
  await fs.mkdir(dir, { recursive: true });
  try {
    const value = JSON.parse(await fs.readFile(legacyFile, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Tệp người dùng không đúng định dạng.');
    }
    const loaded = {};
    for (const [id, item] of Object.entries(value)) loaded[id] = normalizeUser(id, item);
    users = loaded;
    activeStore = 'json';
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await fs.rename(legacyFile, legacyFile + '.corrupt-' + Date.now()).catch(() => {});
      console.error('Dữ liệu người dùng lỗi; đã cách ly tệp lỗi:', error.message);
    }
    users = {};
    activeStore = 'json';
    await persist();
  }
}

async function loadDatabase() {
  if (mongoService.hasConfig()) {
    await loadMongo();
    return;
  }
  if (isProductionRuntime()) {
    throw new Error('MONGODB_URI là bắt buộc trong production. Không cho phép chạy dữ liệu JSON tạm trên Render.');
  }
  await loadLocalJson();
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
}

module.exports = {
  loadDatabase,
  saveDatabase: persist,
  initUser,
  getUser: id => users[String(id)] || null,
  getUsers: () => users,
  closeDatabase,
  isMongo: () => activeStore === 'mongodb' && Boolean(mongoUsers && mongoService.isConnected()),
  isLocalJson: () => activeStore === 'json'
};
