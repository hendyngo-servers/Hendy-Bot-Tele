import fs from "node:fs/promises";
import process from "node:process";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error("Cách dùng: node scripts/verify-json-to-d1.mjs /path/to/database.json");
  process.exit(1);
}
if (!accountId || !databaseId || !token) {
  console.error("Cần CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID và CLOUDFLARE_API_TOKEN.");
  process.exit(1);
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const users = source.users || {};
const app = source.appData || {};
const catalog = Array.isArray(app.catalog) ? app.catalog : [];
const deposits = Array.isArray(app.deposits) ? app.deposits : [];
const orders = Array.isArray(app.orders) ? app.orders : [];
const linked = Array.isArray(app.linkedAccounts) ? app.linkedAccounts : [];
const tickets = Array.isArray(app.tickets) ? app.tickets : [];
const giftcodes = Array.isArray(app.giftcodes) ? app.giftcodes : [];
const referrals = Array.isArray(app.referrals) ? app.referrals : [];
const expected = {
  users: Object.keys(users).length,
  packages: catalog.length,
  deposits: deposits.length,
  orders: orders.length,
  linked_accounts: linked.filter(item => item.encryptedPassword).length,
  tickets: tickets.length,
  giftcodes: giftcodes.length,
  giftcode_redemptions: giftcodes.reduce((total, item) => total + (Array.isArray(item.usedBy) ? item.usedBy.length : 0), 0),
  referrals: referrals.filter(item => item.referrerId && item.referredId && String(item.referrerId) !== String(item.referredId)).length,
  app_settings: app.paymentSettings ? 1 : 0
};
expected.total_balance_vnd = Object.values(users).reduce((total, user) => total + Math.max(0, Math.trunc(Number(user.balance || 0))), 0);

const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/d1/database/" + databaseId + "/query";
async function query(sql) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ sql })
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error("D1 query failed: " + JSON.stringify(result.errors || result).slice(0, 1000));
  }
  return result.result?.[0]?.results?.[0] || {};
}

const actual = {};
for (const table of Object.keys(expected).filter(key => key !== "total_balance_vnd")) {
  const sql = table === "app_settings"
    ? "SELECT COUNT(*) AS total FROM app_settings WHERE setting_key='payment'"
    : "SELECT COUNT(*) AS total FROM " + table;
  const row = await query(sql);
  actual[table] = Number(row.total || 0);
}
const balance = await query("SELECT COALESCE(SUM(balance_vnd),0) AS total FROM users");
actual.total_balance_vnd = Number(balance.total || 0);

let mismatch = false;
console.log("BẢNG ĐỐI CHIẾU JSON → D1");
for (const [key, wanted] of Object.entries(expected)) {
  const got = actual[key];
  const ok = Number(wanted) === Number(got);
  console.log((ok ? "OK  " : "FAIL") + " " + key + ": JSON=" + wanted + " | D1=" + got);
  if (!ok) mismatch = true;
}
if (mismatch) {
  console.error("ĐỐI CHIẾU THẤT BẠI. Không chuyển webhook hoặc tắt dịch vụ nguồn.");
  process.exit(2);
}
console.log("ĐỐI CHIẾU THÀNH CÔNG. Vẫn cần kiểm thử đăng nhập, giải mã tài khoản liên kết và các giao dịch thử.");
