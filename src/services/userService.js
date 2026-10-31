const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = process.env.RAILWAY_ENVIRONMENT ? '/app/data' : path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const BACKUP_FILE = path.join(DATA_DIR, 'database_backup.json');

let users = {};
let userStates = {};
let userCooldowns = {};
let isSaving = false;

const loadDatabase = async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(DB_FILE, 'utf8');
    users = JSON.parse(data);
    console.log(`✅ Đã tải dữ liệu ${Object.keys(users).length} khách hàng từ database.json`);
  } catch (err) {
    console.log("⚠️ Không tìm thấy hoặc database trống, sẽ tạo mới khi có khách.");
    users = {};
  }
};

const saveDatabase = async () => {
  if (isSaving) return;
  isSaving = true;
  try {
    try { await fs.copyFile(DB_FILE, BACKUP_FILE); } catch (e) {} 
    await fs.writeFile(DB_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error("❌ Lỗi lưu file database.json:", err);
  } finally {
    isSaving = false;
  }
};

const initUser = (chatId, user) => {
  const name = user?.first_name || 'Khách';
  if (!users[chatId]) {
    users[chatId] = {
      name, balance: 1501, voucher: 0, wonCodes: [],
      linkedAccounts: { QQ88: [], '78WIN': [], SC88: [], C168: [], CM88: [], F8BET: [] }
    };
    saveDatabase();
  } else {
    users[chatId].name = name;
    if (!users[chatId].linkedAccounts) {
      users[chatId].linkedAccounts = { QQ88: [], '78WIN': [], SC88: [], C168: [], CM88: [], F8BET: [] };
    }
  }
  return users[chatId];
};

module.exports = { 
  loadDatabase, saveDatabase, initUser, 
  getUsers: () => users, 
  getUser: (id) => users[id],
  getStates: () => userStates,
  getCooldowns: () => userCooldowns
};
