const jsonDatabase = require('./jsonDatabase');

let users = {};
let activeStore = 'json';
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

function cloneUsers(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function persist() {
  const rawSnapshot = cloneUsers(users);
  const snapshot = {};
  for (const [id, user] of Object.entries(rawSnapshot)) {
    snapshot[id] = normalizeUser(id, user);
  }
  queue = queue.catch(() => {}).then(() => jsonDatabase.writeSection('users', snapshot));
  return queue;
}

async function loadDatabase() {
  await jsonDatabase.init();
  const savedUsers = jsonDatabase.getSection('users') || {};
  const loaded = {};
  for (const [id, user] of Object.entries(savedUsers)) {
    loaded[id] = normalizeUser(id, user);
  }
  users = loaded;
  activeStore = 'json';
  await persist();
  console.info('[DB] JSON database sẵn sàng. Đã tải ' + Object.keys(users).length + ' thành viên.');
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
  await jsonDatabase.flush();
}

module.exports = {
  loadDatabase,
  saveDatabase: persist,
  initUser,
  getUser: id => users[String(id)] || null,
  getUsers: () => users,
  closeDatabase,
  isJson: () => activeStore === 'json',
  isMongo: () => false,
  isLocalJson: () => activeStore === 'json'
};
