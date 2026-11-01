const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const databaseFile = path.join(dataDir, 'database.json');
const SECTIONS = new Set(['users', 'appData']);

let databaseState = null;
let initialized = false;
let initializing = null;
let writeQueue = Promise.resolve();

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function readJson(filePath, label) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (!isPlainObject(value)) throw new Error(label + ' phải là JSON object.');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Không thể đọc ' + label + ': ' + error.message);
  }
}

async function writeAtomic(snapshot) {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temporaryFile = databaseFile + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporaryFile, JSON.stringify(snapshot, null, 2) + '\n', {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    await fs.rename(temporaryFile, databaseFile);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {});
    throw new Error('Không thể ghi database.json: ' + error.message);
  }
}

async function initialize() {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });

  let stored = await readJson(databaseFile, 'database.json');
  const wasCreated = !stored;
  if (!stored) stored = {};

  if (stored.schemaVersion !== undefined && stored.schemaVersion !== 1) {
    throw new Error('Phiên bản database.json không được hỗ trợ: ' + stored.schemaVersion);
  }
  if (stored.users !== undefined && !isPlainObject(stored.users)) {
    throw new Error('database.json: mục users không đúng định dạng object.');
  }
  if (stored.appData !== undefined && stored.appData !== null && !isPlainObject(stored.appData)) {
    throw new Error('database.json: mục appData không đúng định dạng object.');
  }

  const next = {
    schemaVersion: 1,
    users: isPlainObject(stored.users) ? stored.users : {},
    appData: isPlainObject(stored.appData) ? stored.appData : null,
    updatedAt: stored.updatedAt || new Date().toISOString()
  };
  const migratedFiles = [];

  if (stored.users === undefined) {
    const legacyUsers = await readJson(path.join(dataDir, 'users.json'), 'users.json cũ');
    if (legacyUsers) {
      next.users = legacyUsers;
      migratedFiles.push(path.join(dataDir, 'users.json'));
    }
  }
  if (stored.appData === undefined || stored.appData === null) {
    const legacyAppData = await readJson(path.join(dataDir, 'app-data.json'), 'app-data.json cũ');
    if (legacyAppData) {
      next.appData = legacyAppData;
      migratedFiles.push(path.join(dataDir, 'app-data.json'));
    }
  }

  databaseState = next;
  if (wasCreated || migratedFiles.length || stored.schemaVersion !== 1 ||
      stored.users === undefined || stored.appData === undefined) {
    await writeAtomic(databaseState);
  }

  // Chỉ đổi tên dữ liệu cũ sau khi database.json đã được ghi thành công.
  for (const legacyFile of migratedFiles) {
    const backup = legacyFile + '.migrated-to-database-' + Date.now();
    await fs.rename(legacyFile, backup).catch(error => {
      console.warn('[DB] Không thể đổi tên tệp cũ ' + path.basename(legacyFile) + ': ' + error.message);
    });
  }

  initialized = true;
  console.info('[DB] Đã mở database.json tại ' + databaseFile);
  return clone(databaseState);
}

async function init() {
  if (initialized) return clone(databaseState);
  if (initializing) return initializing;
  initializing = initialize();
  try {
    return await initializing;
  } finally {
    initializing = null;
  }
}

function getSection(name) {
  if (!initialized || !SECTIONS.has(name)) {
    throw new Error('JSON database chưa sẵn sàng hoặc section không hợp lệ.');
  }
  return clone(databaseState[name]);
}

async function writeSection(name, value) {
  if (!SECTIONS.has(name)) throw new Error('Section JSON database không hợp lệ.');
  await init();
  const copiedValue = clone(value);
  if (!isPlainObject(copiedValue)) {
    throw new Error('Dữ liệu section ' + name + ' phải là object.');
  }

  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const next = {
      ...databaseState,
      [name]: copiedValue,
      updatedAt: new Date().toISOString()
    };
    await writeAtomic(next);
    databaseState = next;
  });
  return writeQueue;
}

async function flush() {
  await writeQueue;
}

async function reloadForTests() {
  await flush().catch(() => {});
  databaseState = null;
  initialized = false;
  initializing = null;
  writeQueue = Promise.resolve();
  return init();
}

async function resetForTests() {
  await flush().catch(() => {});
  await fs.rm(databaseFile, { force: true });
  databaseState = null;
  initialized = false;
  initializing = null;
  writeQueue = Promise.resolve();
}

module.exports = {
  init,
  getSection,
  writeSection,
  flush,
  getDatabaseFilePath: () => databaseFile,
  reloadForTests,
  resetForTests
};
