import fs from "node:fs/promises";
import process from "node:process";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const sourcePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

if (!sourcePath) {
  console.error("Cách dùng: node scripts/import-json-to-d1.mjs /path/to/database.json [--dry-run] [--force]");
  process.exit(1);
}
if (!dryRun && (!accountId || !databaseId || !token)) {
  console.error("Cần CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID và CLOUDFLARE_API_TOKEN.");
  process.exit(1);
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const users = source.users || {};
const app = source.appData || {};
const now = new Date().toISOString();
const records = [];
const add = (table, columns, rows) => {
  if (rows.length) records.push({ table, columns, rows });
};
const safeDate = value => {
  const date = new Date(value || now);
  return Number.isNaN(date.getTime()) ? now : date.toISOString();
};

add("users", ["telegram_id","username","display_name","role","balance_vnd","vip_level","created_at"], Object.entries(users).map(([id,user]) => [
  String(id), user.username || null, String(user.name || "Người dùng"), "user",
  Math.max(0, Math.trunc(Number(user.balance || 0))), Math.max(0, Math.min(10, Math.trunc(Number(user.vipLevel || user.vip_level || 0)))),
  safeDate(user.createdAt || user.created_at)
]));

const catalog = Array.isArray(app.catalog) ? app.catalog : [];
add("packages", ["id","slug","name","description","category","price_vnd","duration_days","stock","vip_level","status","created_at"], catalog.map(item => {
  const id = String(item.id || crypto.randomUUID());
  const name = String(item.name || "Sản phẩm");
  return [id, String(item.slug || (name.toLowerCase().replace(/[^a-z0-9]+/g,"-") + "-" + id.slice(0,8))),
    name, String(item.description || ""), String(item.category || "other"),
    Math.max(0,Math.trunc(Number(item.price || 0))), Math.max(0,Math.trunc(Number(item.durationDays || 0))),
    item.stock === null || item.stock === undefined || item.stock === "" ? null : Math.max(0,Math.trunc(Number(item.stock))),
    Math.max(0,Math.min(10,Math.trunc(Number(item.vipLevel || 0)))), item.active === false ? "hidden" : "active", safeDate(item.createdAt)];
}));

const deposits = Array.isArray(app.deposits) ? app.deposits : [];
add("deposits", ["id","telegram_id","amount_vnd","reference","status","review_id","reviewed_by","created_at","reviewed_at"], deposits.map(item => {
  const status = item.status === "paid" || item.status === "approved" ? "approved" : item.status === "rejected" ? "rejected" : "pending";
  return [String(item.id || crypto.randomUUID()),String(item.userId),Math.max(1,Math.trunc(Number(item.amount || 1))),
    String(item.reference || ("MIG-" + String(item.id || crypto.randomUUID()))),status,status === "approved" ? crypto.randomUUID() : null,
    item.processedBy || null,safeDate(item.createdAt),item.processedAt ? safeDate(item.processedAt) : null];
}));

const orders = Array.isArray(app.orders) ? app.orders : [];
add("orders", ["id","telegram_id","package_id","item_name","category","amount_vnd","vip_level","duration_days","status","processed_by","processed_at","activated_at","expires_at","created_at"], orders.map(item => {
  const status = ["approved","rejected","cancelled"].includes(item.status) ? item.status : "pending";
  return [String(item.id || crypto.randomUUID()),String(item.userId),null,String(item.itemName || "Đơn hàng"),String(item.category || ""),
    Math.max(0,Math.trunc(Number(item.amount || 0))),Math.max(0,Math.min(10,Math.trunc(Number(item.vipLevel || 0)))),
    Math.max(0,Math.trunc(Number(item.durationDays || 0))),status,item.processedBy || null,
    item.processedAt ? safeDate(item.processedAt) : null,item.activatedAt ? safeDate(item.activatedAt) : null,
    item.expiresAt ? safeDate(item.expiresAt) : null,safeDate(item.createdAt)];
}));

const linked = Array.isArray(app.linkedAccounts) ? app.linkedAccounts : [];
add("linked_accounts", ["id","telegram_id","provider","account_name","username","mini_code","secret_ciphertext","created_at"], linked.filter(item => item.encryptedPassword).map(item => [
  String(item.id || crypto.randomUUID()),String(item.userId),String(item.brand || "other"),String(item.username || item.brand || "account"),
  String(item.username || ""),String(item.miniCode || ""),JSON.stringify(item.encryptedPassword),safeDate(item.createdAt)
]));

const tickets = Array.isArray(app.tickets) ? app.tickets : [];
add("tickets", ["id","telegram_id","message","status","reply","created_at","updated_at"], tickets.map(item => [
  String(item.id || crypto.randomUUID()),String(item.userId),String(item.message || "Yêu cầu hỗ trợ"),
  ["open","answered","closed"].includes(item.status) ? item.status : "open",String(item.reply || ""),safeDate(item.createdAt),safeDate(item.processedAt || item.createdAt)
]));

const giftcodes = Array.isArray(app.giftcodes) ? app.giftcodes : [];
add("giftcodes", ["id","code","reward_type","reward_value","max_uses","uses","expires_at","active","used_by_json","created_at"], giftcodes.map(item => [
  String(item.id || crypto.randomUUID()),String(item.code || "").toUpperCase(),String(item.rewardType || "balance"),
  Math.max(1,Math.trunc(Number(item.rewardValue || 1))),Math.max(1,Math.trunc(Number(item.maxUses || 1))),
  Math.max(0,Math.trunc(Number(item.uses || 0))),item.expiresAt ? safeDate(item.expiresAt) : null,item.active === false ? 0 : 1,
  JSON.stringify(Array.isArray(item.usedBy) ? item.usedBy : []),safeDate(item.createdAt)
]));

const referrals = Array.isArray(app.referrals) ? app.referrals : [];
add("referrals", ["id","referrer_id","referred_id","commission_vnd","status","created_at"], referrals.filter(item => item.referrerId && item.userId && String(item.referrerId) !== String(item.userId)).map(item => [
  String(item.id || crypto.randomUUID()),String(item.referrerId),String(item.userId),Math.max(0,Math.trunc(Number(item.commission || 0))),
  String(item.status || "pending"),safeDate(item.createdAt)
]));

if (app.paymentSettings) records.push({
  table:"app_settings",columns:["setting_key","value_json","updated_by"],
  rows:[["payment",JSON.stringify(app.paymentSettings),"migration"]]
});

const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/d1/database/" + databaseId + "/query";
async function query(sql, params = []) {
  if (dryRun) return;
  const response = await fetch(endpoint,{
    method:"POST",
    headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify({sql,params})
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error("D1 query failed: "+JSON.stringify(result.errors || result).slice(0,1000));
  return result;
}

if (!force && !dryRun) {
  const response = await query("SELECT COUNT(*) AS total FROM users");
  const count = Number(response.result?.[0]?.results?.[0]?.total || 0);
  if (count > 0) {
    console.error("D1 đã có " + count + " thành viên. Dừng để tránh ghi đè; sao lưu và dùng --force chỉ khi đã xác nhận.");
    process.exit(2);
  }
}

let total = 0;
for (const batch of records) {
  const width = batch.columns.length;
  const chunkSize = Math.max(1,Math.floor(90/width));
  for (let index=0;index<batch.rows.length;index+=chunkSize) {
    const rows = batch.rows.slice(index,index+chunkSize);
    const placeholders = rows.map(()=>"("+batch.columns.map(() => "?").join(",")+")").join(",");
    const params = rows.flat();
    const sql = "INSERT OR REPLACE INTO " + batch.table + " (" + batch.columns.join(",") + ") VALUES " + placeholders;
    await query(sql,params);
    total += rows.length;
  }
  console.log(batch.table + ": " + batch.rows.length);
}
console.log((dryRun ? "DRY RUN" : "Đã nhập") + " " + total + " bản ghi từ " + sourcePath + ".");
