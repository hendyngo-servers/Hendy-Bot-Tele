const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const qrStorageService = require('./qrStorageService');
const mongoService = require('./mongoService');


const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const file = path.join(dir, 'app-data.json');

const defaultPaymentSettings = () => ({
  bankBin: process.env.BANK_BIN || '',
  bankName: process.env.BANK_NAME || '',
  bankAccount: process.env.BANK_ACCOUNT || '',
  bankAccountName: process.env.BANK_ACCOUNT_NAME || '',
  qrImageUrl: '',
  qrImagePath: '',
  instructions: 'Chuyển khoản đúng số tiền và nội dung để quản trị viên đối soát.',
  minDeposit: Math.max(10000, Number(process.env.MIN_DEPOSIT_VND) || 10000),
  referralCommissionPercent: 0,
  botUsername: String(process.env.BOT_USERNAME || '').replace(/^@/, ''),
  groupChatUrl: 'https://t.me/Hendy_Support_Group',
  newsChannelUrl: '',
  supportUsername: String(process.env.SUPPORT_USERNAME || '').replace(/^@/, '')
});

let state = {
  linkedAccounts: [],
  deposits: [],
  tickets: [],
  catalog: [],
  orders: [],
  giftcodes: [],
  referrals: [],
  paymentSettings: defaultPaymentSettings()
};
let queue = Promise.resolve();
let mongoActive = false;
let mongoCollections = null;
function normalizeState(value = {}) {
  const defaults = {
    linkedAccounts: [],
    deposits: [],
    tickets: [],
    catalog: [],
    orders: [],
    giftcodes: [],
    referrals: [],
    paymentSettings: defaultPaymentSettings()
  };
  const next = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key === 'paymentSettings') continue;
    if (Array.isArray(value[key])) next[key] = value[key];
  }
  next.paymentSettings = {
    ...defaults.paymentSettings,
    ...(value.paymentSettings && typeof value.paymentSettings === 'object'
      ? value.paymentSettings
      : {})
  };
  // Đơn đang xử lý khi tiến trình bị dừng được mở lại để Admin xử lý lại.
  next.deposits = next.deposits.map(item => item.status === 'processing' ? { ...item, status: 'pending' } : item);
  next.orders = next.orders.map(item => item.status === 'processing' ? { ...item, status: 'pending' } : item);
  return next;
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function recordId(item) {
  const id = String(item?.id || '');
  if (!id) throw new Error('Bản ghi thiếu id.');
  return id;
}

const MONGO_COLLECTIONS = [
  'linkedAccounts',
  'deposits',
  'tickets',
  'catalog',
  'orders',
  'giftcodes',
  'referrals'
];

async function persistMongoState(snapshot) {
  if (!mongoCollections) throw new Error('MongoDB collections chưa được khởi tạo.');
  for (const name of MONGO_COLLECTIONS) {
    const collection = mongoCollections[name];
    const items = snapshot[name] || [];
    const operations = items.map(item => ({
      replaceOne: {
        filter: { _id: recordId(item) },
        replacement: { ...item, _id: recordId(item) },
        upsert: true
      }
    }));
    for (let offset = 0; offset < operations.length; offset += 500) {
      await collection.bulkWrite(operations.slice(offset, offset + 500), { ordered: true });
    }
    const ids = items.map(recordId);
    if (ids.length) await collection.deleteMany({ _id: { $nin: ids } });
    else await collection.deleteMany({});
  }
  await mongoCollections.settings.replaceOne(
    { _id: 'payment' },
    { _id: 'payment', ...snapshot.paymentSettings, updatedAt: new Date() },
    { upsert: true }
  );
}

async function loadMongoState() {
  const database = await mongoService.connectMongo();
  mongoCollections = Object.fromEntries(
    [...MONGO_COLLECTIONS, 'settings'].map(name => [name, database.collection(name)])
  );
  await Promise.all([
    mongoCollections.linkedAccounts.createIndex({ userId: 1, createdAt: -1 }),
    mongoCollections.deposits.createIndex({ userId: 1, createdAt: -1 }),
    mongoCollections.tickets.createIndex({ userId: 1, createdAt: -1 }),
    mongoCollections.catalog.createIndex({ category: 1, active: 1 }),
    mongoCollections.orders.createIndex({ userId: 1, createdAt: -1 }),
    mongoCollections.giftcodes.createIndex({ code: 1 }, { unique: true, sparse: true }),
    mongoCollections.referrals.createIndex({ referredId: 1 }, { unique: true })
  ]);

  const raw = normalizeState();
  for (const name of MONGO_COLLECTIONS) {
    const documents = await mongoCollections[name].find({}).toArray();
    raw[name] = documents.map(({ _id, ...item }) => item);
  }
  const remoteSettings = await mongoCollections.settings.findOne({ _id: 'payment' });
  if (remoteSettings) {
    const { _id, updatedAt, ...settings } = remoteSettings;
    raw.paymentSettings = { ...defaultPaymentSettings(), ...settings };
  }

  // Chỉ nhập dữ liệu JSON cũ vào ID chưa có; không ghi đè dữ liệu MongoDB.
  let legacyData = null;
  try {
    legacyData = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!legacyData || typeof legacyData !== 'object' || Array.isArray(legacyData)) {
      throw new Error('Tệp app-data.json không có định dạng object.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await fs.rename(file, file + '.corrupt-' + Date.now()).catch(() => {});
      console.error('[MongoDB] app-data.json lỗi; đã cách ly tệp:', error.message);
    }
  }

  if (legacyData) {
    const legacy = normalizeState(legacyData);
    for (const name of MONGO_COLLECTIONS) {
      const known = new Set(raw[name].map(recordId));
      for (const item of legacy[name]) {
        const id = recordId(item);
        if (!known.has(id)) {
          raw[name].push(item);
          known.add(id);
        }
      }
    }
    if (!remoteSettings) raw.paymentSettings = legacy.paymentSettings;
  }

  state = normalizeState(raw);
  mongoActive = true;
  await persistMongoState(state);
  if (legacyData) {
    const backup = file + '.migrated-mongodb-' + Date.now();
    await fs.rename(file, backup);
    console.info('[MongoDB] Đã nhập app-data.json. Bản sao lưu: ' + path.basename(backup));
  }
  console.info('[MongoDB] Đã tải ' +
    MONGO_COLLECTIONS.reduce((total, name) => total + state[name].length, 0) +
    ' bản ghi nghiệp vụ từ MongoDB Atlas.');
}

function persist() {
  const snapshot = cloneState(state);
  queue = queue.catch(() => {}).then(async () => {
    if (mongoActive) {
      state = snapshot;
      await persistMongoState(snapshot);
      return;
    }
    await fs.mkdir(dir, { recursive: true });
    const tmp = file + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    });
    await fs.rename(tmp, file);
  });
  return queue;
}

async function init() {
  mongoActive = false;
  mongoCollections = null;
  if (mongoService.hasConfig()) {
    await loadMongoState();
    return;
  }

  await fs.mkdir(dir, { recursive: true });
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    state = normalizeState(data);
    await persist();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await fs.rename(file, file + '.corrupt-' + Date.now()).catch(() => {});
      console.error('Dữ liệu Mini App lỗi JSON; đã cách ly tệp lỗi:', error.message);
    }
    state = normalizeState();
    await persist();
  }
}

const publicAccount = item => ({
  id: item.id,
  brand: item.brand,
  username: item.username,
  miniCode: item.miniCode,
  createdAt: item.createdAt
});

function listLinkedAccounts(userId) {
  return state.linkedAccounts
    .filter(item => item.userId === String(userId))
    .map(publicAccount);
}

async function addLinkedAccount(userId, input) {
  const item = {
    id: crypto.randomUUID(),
    userId: String(userId),
    brand: input.brand,
    username: input.username,
    miniCode: input.miniCode || input.username,
    encryptedPassword: input.encryptedPassword,
    createdAt: new Date().toISOString()
  };
  state.linkedAccounts.push(item);
  await persist();
  return publicAccount(item);
}

async function deleteLinkedAccount(userId, id) {
  const before = state.linkedAccounts.length;
  state.linkedAccounts = state.linkedAccounts.filter(item =>
    !(item.userId === String(userId) && item.id === String(id))
  );
  if (before === state.linkedAccounts.length) return false;
  await persist();
  return true;
}

function getPaymentSettings() {
  const settings = state.paymentSettings;
  return {
    bankBin: settings.bankBin || '',
    bankName: settings.bankName || '',
    bankAccount: settings.bankAccount || '',
    bankAccountName: settings.bankAccountName || '',
    qrImageUrl: settings.qrImageUrl || '',
    qrImagePath: settings.qrImagePath || '',
    instructions: settings.instructions || '',
    minDeposit: Math.max(10000, Number(settings.minDeposit) || 10000),
    referralCommissionPercent: Number(settings.referralCommissionPercent || 0),
    botUsername: String(settings.botUsername || '').replace(/^@/, ''),
    groupChatUrl: settings.groupChatUrl || '',
    newsChannelUrl: settings.newsChannelUrl || '',
    supportUsername: String(settings.supportUsername || '').replace(/^@/, '')
  };
}

async function updatePaymentSettings(input) {
  state.paymentSettings = {
    ...state.paymentSettings,
    ...input,
    minDeposit: Math.max(10000, Number(input.minDeposit) || 10000)
  };
  await persist();
  return getPaymentSettings();
}

function buildQrUrl(settings, amount, reference) {
  if (settings.qrImageUrl) {
    try {
      const url = new URL(settings.qrImageUrl);
      url.searchParams.set('amount', String(amount));
      url.searchParams.set('addInfo', reference);
      return url.toString();
    } catch {
      return null;
    }
  }
  if (!settings.bankBin || !settings.bankAccount) return null;
  return 'https://img.vietqr.io/image/' +
    encodeURIComponent(settings.bankBin) + '-' +
    encodeURIComponent(settings.bankAccount) +
    '-compact2.png?amount=' + amount +
    '&addInfo=' + encodeURIComponent(reference) +
    '&accountName=' + encodeURIComponent(settings.bankAccountName || '');
}

async function createDeposit(userId, amount) {
  const settings = getPaymentSettings();
  if (!Number.isSafeInteger(amount) || amount < settings.minDeposit || amount > 100000000) {
    throw new Error('Số tiền nạp không nằm trong giới hạn cho phép.');
  }
  const reference = 'HND' + Date.now().toString(36).toUpperCase() +
    crypto.randomBytes(3).toString('hex').toUpperCase();
  const item = {
    id: crypto.randomUUID(),
    reference,
    userId: String(userId),
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
    processedAt: null,
    processedBy: null
  };
  state.deposits.push(item);
  await persist();
  return {
    id: item.id,
    reference,
    userId: item.userId,
    amount,
    status: item.status,
    createdAt: item.createdAt,
    qrUrl: settings.qrImagePath
      ? qrStorageService.getReadUrl(settings.qrImagePath)
      : buildQrUrl(settings, amount, reference),
    payment: {
      bankName: settings.bankName,
      bankAccount: settings.bankAccount,
      bankAccountName: settings.bankAccountName,
      instructions: settings.instructions
    }
  };
}

function publicDeposit(item) {
  return {
    id: item.id,
    reference: item.reference,
    amount: item.amount,
    status: item.status,
    createdAt: item.createdAt,
    processedAt: item.processedAt || null
  };
}

function listDeposits(userId) {
  return state.deposits
    .filter(item => item.userId === String(userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicDeposit);
}

function listAllDeposits(limit = 100) {
  return state.deposits
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(item => ({
      ...publicDeposit(item),
      userId: item.userId,
      processedBy: item.processedBy || null
    }));
}

function getDeposit(id) {
  return state.deposits.find(item => item.id === String(id)) || null;
}

async function processDeposit(id, status, adminId, beforeCommit = async () => {}) {
  const item = getDeposit(id);
  if (!item) return { error: 'not_found' };
  if (item.status !== 'pending') return { error: 'already_processed', deposit: publicDeposit(item) };
  if (!['paid', 'rejected'].includes(status)) return { error: 'invalid_status' };

  // Đánh dấu xử lý đồng bộ trước lần await đầu tiên để chặn thao tác duyệt trùng.
  item.status = 'processing';
  await persist();
  try {
    await beforeCommit({ userId: item.userId, amount: item.amount });
    item.status = status;
    item.processedAt = new Date().toISOString();
    item.processedBy = String(adminId);
    await persist();
    return { deposit: publicDeposit(item), userId: item.userId, amount: item.amount };
  } catch (error) {
    item.status = 'pending';
    await persist().catch(() => {});
    throw error;
  }
}

function listActiveCatalog(category) {
  return state.catalog
    .filter(item => item.active !== false && (!category || item.category === category))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'))
    .map(publicCatalogItem);
}

function publicCatalogItem(item) {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    description: item.description || '',
    price: Number(item.price || 0),
    durationDays: Number(item.durationDays || 0),
    stock: item.stock === null || item.stock === undefined ? null : Number(item.stock),
    vipLevel: Number(item.vipLevel || 0),
    active: item.active !== false
  };
}

function listAdminCatalog() {
  return state.catalog.map(publicCatalogItem);
}

async function saveCatalogItem(input, id = null) {
  const existing = id ? state.catalog.find(item => item.id === id) : null;
  const item = {
    id: existing?.id || crypto.randomUUID(),
    category: input.category,
    name: input.name,
    description: input.description || '',
    price: Number(input.price),
    durationDays: Number(input.durationDays || 0),
    stock: input.stock === null || input.stock === undefined || input.stock === ''
      ? null
      : Number(input.stock),
    vipLevel: Number(input.vipLevel || 0),
    active: input.active !== false,
    updatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString()
  };
  if (existing) Object.assign(existing, item);
  else state.catalog.push(item);
  await persist();
  return publicCatalogItem(item);
}

async function deleteCatalogItem(id) {
  const before = state.catalog.length;
  state.catalog = state.catalog.filter(item => item.id !== String(id));
  if (before === state.catalog.length) return false;
  await persist();
  return true;
}

function listOrders(userId, limit = 50) {
  return state.orders
    .filter(item => !userId || item.userId === String(userId))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(item => userId
      ? {
          id: item.id,
          itemId: item.itemId,
          category: item.category,
          itemName: item.itemName,
          amount: item.amount,
          vipLevel: item.vipLevel || 0,
          durationDays: item.durationDays || 0,
          status: item.status,
          createdAt: item.createdAt,
          processedAt: item.processedAt || null,
          activatedAt: item.activatedAt || null,
          expiresAt: item.expiresAt || null
        }
      : { ...item });
}

async function createOrder(userId, itemId) {
  const product = state.catalog.find(item => item.id === String(itemId) && item.active !== false);
  if (!product) return { error: 'not_found' };
  if (product.stock !== null && product.stock !== undefined && Number(product.stock) <= 0) {
    return { error: 'out_of_stock' };
  }
  const order = {
    id: crypto.randomUUID(),
    userId: String(userId),
    itemId: product.id,
    category: product.category,
    itemName: product.name,
    amount: Number(product.price),
    vipLevel: Number(product.vipLevel || 0),
    durationDays: Number(product.durationDays || 0),
    status: 'pending',
    createdAt: new Date().toISOString(),
    processedAt: null,
    processedBy: null,
    activatedAt: null,
    expiresAt: null
  };
  state.orders.push(order);
  await persist();
  return { ...order };
}

function getOrder(id) {
  return state.orders.find(item => item.id === String(id)) || null;
}

async function processOrder(id, status, adminId, beforeCommit = async () => {}) {
  const order = getOrder(id);
  if (!order) return { error: 'not_found' };
  if (order.status !== 'pending') return { error: 'already_processed', order: { ...order } };
  if (!['approved', 'rejected'].includes(status)) return { error: 'invalid_status' };

  const product = state.catalog.find(item => item.id === order.itemId);
  if (status === 'approved') {
    if (!product || product.active === false) return { error: 'item_unavailable' };
    if (product.stock !== null && product.stock !== undefined && Number(product.stock) <= 0) {
      return { error: 'out_of_stock' };
    }
  }

  order.status = 'processing';
  await persist();
  try {
    await beforeCommit({ order: { ...order }, product });
    if (status === 'approved' && product.stock !== null && product.stock !== undefined) {
      product.stock = Number(product.stock) - 1;
    }
    order.status = status;
    order.processedAt = new Date().toISOString();
    order.processedBy = String(adminId);
    if (status === 'approved' && Number(order.durationDays || 0) > 0) {
      const activatedAt = new Date();
      order.activatedAt = activatedAt.toISOString();
      order.expiresAt = new Date(
        activatedAt.getTime() + Number(order.durationDays) * 24 * 60 * 60 * 1000
      ).toISOString();
    }
    await persist();
    return { order: { ...order } };
  } catch (error) {
    order.status = 'pending';
    await persist().catch(() => {});
    throw error;
  }
}

async function createTicket(userId, message) {
  const item = {
    id: crypto.randomUUID(),
    userId: String(userId),
    message,
    status: 'open',
    createdAt: new Date().toISOString(),
    processedAt: null,
    reply: ''
  };
  state.tickets.push(item);
  await persist();
  return { id: item.id, status: item.status, createdAt: item.createdAt };
}

function listTickets(userId, limit = 50) {
  return state.tickets
    .filter(item => !userId || item.userId === String(userId))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(item => ({ ...item }));
}

async function updateTicket(id, status, reply = '') {
  const item = state.tickets.find(ticket => ticket.id === String(id));
  if (!item) return false;
  if (!['open', 'answered', 'closed'].includes(status)) return false;
  item.status = status;
  item.reply = String(reply).slice(0, 2000);
  item.processedAt = new Date().toISOString();
  await persist();
  return { ...item };
}

async function createGiftcode(input) {
  const code = String(input.code || '').trim().toUpperCase();
  const item = {
    id: crypto.randomUUID(),
    code,
    rewardType: input.rewardType,
    rewardValue: Number(input.rewardValue),
    maxUses: Math.max(1, Number(input.maxUses) || 1),
    uses: 0,
    expiresAt: input.expiresAt || null,
    active: input.active !== false,
    usedBy: [],
    createdAt: new Date().toISOString()
  };
  if (state.giftcodes.some(existing => existing.code === code)) {
    return { error: 'duplicate' };
  }
  state.giftcodes.push(item);
  await persist();
  return publicGiftcode(item);
}

function publicGiftcode(item) {
  return {
    id: item.id,
    code: item.code,
    rewardType: item.rewardType,
    rewardValue: item.rewardValue,
    maxUses: item.maxUses,
    uses: item.uses,
    expiresAt: item.expiresAt,
    active: item.active,
    createdAt: item.createdAt
  };
}

function listGiftcodes() {
  return state.giftcodes
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicGiftcode);
}

async function setGiftcodeActive(id, active) {
  const item = state.giftcodes.find(code => code.id === String(id));
  if (!item) return false;
  item.active = Boolean(active);
  await persist();
  return publicGiftcode(item);
}

async function redeemGiftcode(userId, code) {
  const item = state.giftcodes.find(gift => gift.code === String(code).trim().toUpperCase());
  if (!item || !item.active) return { error: 'invalid' };
  if (item.expiresAt && Date.now() > Date.parse(item.expiresAt)) return { error: 'expired' };
  if (item.uses >= item.maxUses) return { error: 'exhausted' };
  if (item.usedBy.includes(String(userId))) return { error: 'used' };
  if (!['balance', 'vip'].includes(item.rewardType) || !Number.isSafeInteger(Number(item.rewardValue)) || item.rewardValue <= 0) {
    return { error: 'invalid' };
  }
  item.uses += 1;
  item.usedBy.push(String(userId));
  await persist();
  return {
    rewardType: item.rewardType,
    rewardValue: item.rewardValue,
    code: item.code
  };
}

async function registerReferral(referrerId, referredId) {
  const referrer = String(referrerId || '');
  const referred = String(referredId || '');
  if (!referrer || !referred || referrer === referred) return false;
  if (state.referrals.some(item => item.referredId === referred)) return false;
  const item = {
    id: crypto.randomUUID(),
    referrerId: referrer,
    referredId: referred,
    createdAt: new Date().toISOString(),
    commissionEarned: 0
  };
  state.referrals.push(item);
  await persist();
  return true;
}

function getReferralStats(userId) {
  const items = state.referrals.filter(item => item.referrerId === String(userId));
  return {
    invited: items.length,
    commission: items.reduce((sum, item) => sum + Number(item.commissionEarned || 0), 0),
    referrals: items.slice(-30).reverse().map(item => ({
      referredId: item.referredId,
      createdAt: item.createdAt
    }))
  };
}

async function addReferralCommission(referredId, amount, users) {
  const referral = state.referrals.find(item => item.referredId === String(referredId));
  const percent = Number(state.paymentSettings.referralCommissionPercent || 0);
  if (!referral || percent <= 0) return 0;
  const commission = Math.floor(Number(amount) * Math.min(percent, 20) / 100);
  if (commission <= 0) return 0;
  const referrer = users[referral.referrerId];
  if (!referrer) return 0;
  referrer.balance = Number(referrer.balance || 0) + commission;
  referral.commissionEarned += commission;
  referral.lastCommissionAt = new Date().toISOString();
  await persist();
  return commission;
}

function getAdminOverview(users = {}) {
  const userEntries = Object.entries(users);
  const accountCounts = new Map();
  for (const account of state.linkedAccounts) {
    accountCounts.set(account.userId, (accountCounts.get(account.userId) || 0) + 1);
  }
  const recentUsers = userEntries
    .sort((a, b) => String(b[1].createdAt || '').localeCompare(String(a[1].createdAt || '')))
    .slice(0, 50)
    .map(([id, user]) => ({
      id,
      name: String(user.name || 'Người dùng').slice(0, 100),
      username: user.username || null,
      balance: Number(user.balance || 0),
      vipLevel: Number(user.vipLevel || 0),
      linkedAccounts: accountCounts.get(id) || 0,
      createdAt: user.createdAt || null
    }));
  return {
    totals: {
      users: userEntries.length,
      linkedAccounts: state.linkedAccounts.length,
      pendingDeposits: state.deposits.filter(item => item.status === 'pending').length,
      pendingOrders: state.orders.filter(item => item.status === 'pending').length,
      openTickets: state.tickets.filter(item => item.status === 'open').length
    },
    users: recentUsers,
    recentAccounts: state.linkedAccounts
      .slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 20).map(item => ({ ...publicAccount(item), ownerId: item.userId }))
  };
}

function getActivity(userId, limit = 50) {
  const id = String(userId);
  const rows = [];

  for (const item of state.linkedAccounts.filter(entry => entry.userId === id)) {
    rows.push({
      id: 'link-' + item.id,
      type: 'linked_account',
      title: 'Đã liên kết ' + item.brand,
      detail: item.username,
      status: 'completed',
      createdAt: item.createdAt
    });
  }
  for (const item of state.deposits.filter(entry => entry.userId === id)) {
    rows.push({
      id: 'deposit-' + item.id,
      type: 'deposit',
      title: 'Yêu cầu nạp ' + Number(item.amount).toLocaleString('vi-VN') + ' VNĐ',
      detail: item.reference,
      status: item.status,
      createdAt: item.createdAt,
      processedAt: item.processedAt || null
    });
  }
  for (const item of state.orders.filter(entry => entry.userId === id)) {
    rows.push({
      id: 'order-' + item.id,
      type: 'order',
      title: item.itemName,
      detail: Number(item.amount).toLocaleString('vi-VN') + ' VNĐ',
      status: item.status,
      createdAt: item.createdAt,
      processedAt: item.processedAt || null,
      expiresAt: item.expiresAt || null
    });
  }
  for (const item of state.tickets.filter(entry => entry.userId === id)) {
    rows.push({
      id: 'ticket-' + item.id,
      type: 'support',
      title: 'Yêu cầu hỗ trợ',
      detail: item.message,
      status: item.status,
      createdAt: item.createdAt,
      reply: item.reply || ''
    });
  }

  return rows
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, Math.min(100, Math.max(1, Number(limit) || 50)));
}

function getOverview(userId, user) {
  const id = String(userId);
  return {
    profile: {
      id,
      name: user.name,
      username: user.username || null,
      balance: Number(user.balance || 0),
      vipLevel: Number(user.vipLevel || 0),
      createdAt: user.createdAt || null
    },
    linkedAccounts: listLinkedAccounts(id),
    deposits: listDeposits(id).slice(0, 5),
    counts: {
      linkedAccounts: state.linkedAccounts.filter(item => item.userId === id).length,
      pendingDeposits: state.deposits.filter(item => item.userId === id && item.status === 'pending').length,
      openTickets: state.tickets.filter(item => item.userId === id && item.status === 'open').length,
      orders: state.orders.filter(item => item.userId === id).length
    }
  };
}

module.exports = {
  init,
  persist,
  listLinkedAccounts,
  addLinkedAccount,
  deleteLinkedAccount,
  getPaymentSettings,
  updatePaymentSettings,
  createDeposit,
  listDeposits,
  listAllDeposits,
  getDeposit,
  processDeposit,
  listActiveCatalog,
  listAdminCatalog,
  saveCatalogItem,
  deleteCatalogItem,
  listOrders,
  createOrder,
  getOrder,
  processOrder,
  createTicket,
  listTickets,
  updateTicket,
  createGiftcode,
  listGiftcodes,
  setGiftcodeActive,
  redeemGiftcode,
  registerReferral,
  getReferralStats,
  addReferralCommission,
  getOverview,
  getAdminOverview,
  getActivity
};
