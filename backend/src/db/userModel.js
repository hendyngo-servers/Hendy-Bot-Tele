import { parseTelegramId, safeText } from "../utils/helpers.js";

export const SUPPORTED_BRANDS = ["QQ88", "78WIN", "SC88", "C168", "CM88", "F8BET"];

export function sanitizeLinkedAccounts(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};
  for (const brand of SUPPORTED_BRANDS) {
    const rows = Array.isArray(source[brand]) ? source[brand] : [];
    output[brand] = rows.map((row) => {
      const label = safeText(row?.tk ?? row?.username ?? "", 40);
      return label ? { tk: label, miniCode: safeText(row?.miniCode || label, 40) } : null;
    }).filter(Boolean).slice(0, 50);
  }
  return output;
}

export async function getUser(env, id) {
  const safeId = parseTelegramId(id);
  if (!safeId) return null;
  const user = await env.DB.prepare("SELECT id, name, balance, voucher, linked_accounts, created_at FROM users WHERE id = ?").bind(safeId).first();
  if (!user) return null;
  let parsed = {};
  try { parsed = JSON.parse(user.linked_accounts || "{}"); } catch { parsed = {}; }
  const safeAccounts = sanitizeLinkedAccounts(parsed);
  const serialized = JSON.stringify(safeAccounts);
  if (serialized !== JSON.stringify(parsed)) {
    await env.DB.prepare("UPDATE users SET linked_accounts = ? WHERE id = ?").bind(serialized, safeId).run();
  }
  user.linked_accounts = safeAccounts;
  return user;
}

export async function upsertUser(env, id, name) {
  const safeId = parseTelegramId(id);
  if (!safeId) throw new Error("Telegram user ID không hợp lệ.");
  const safeName = safeText(name || "Khách", 80);
  const defaults = JSON.stringify(sanitizeLinkedAccounts({}));
  await env.DB.prepare(
    "INSERT INTO users (id, name, balance, voucher, linked_accounts) VALUES (?, ?, 0, 0, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name"
  ).bind(safeId, safeName, defaults).run();
  return getUser(env, safeId);
}

export async function updateLinkedAccounts(env, id, linkedAccounts) {
  const safeId = parseTelegramId(id);
  if (!safeId) throw new Error("Telegram user ID không hợp lệ.");
  const safeAccounts = sanitizeLinkedAccounts(linkedAccounts);
  await env.DB.prepare("UPDATE users SET linked_accounts = ? WHERE id = ?")
    .bind(JSON.stringify(safeAccounts), safeId).run();
  return safeAccounts;
}

export async function addLinkedAccount(env, id, brand, accountLabel) {
  if (!SUPPORTED_BRANDS.includes(brand)) throw new Error("Nền tảng không được hỗ trợ.");
  const label = safeText(accountLabel, 40);
  if (!label || !/^[\p{L}\p{N}._-]+$/u.test(label)) throw new Error("Mã tài khoản không hợp lệ.");
  const user = await getUser(env, id);
  if (!user) throw new Error("Không tìm thấy người dùng.");
  const rows = user.linked_accounts[brand] || [];
  if (rows.some((item) => item.tk.toLowerCase() === label.toLowerCase())) throw new Error("Mã tài khoản này đã được liên kết.");
  if (rows.length >= 50) throw new Error("Đã đạt giới hạn liên kết cho nền tảng này.");
  rows.push({ tk: label, miniCode: label });
  const next = { ...user.linked_accounts, [brand]: rows };
  await updateLinkedAccounts(env, id, next);
  return next;
}

export async function deleteLinkedAccount(env, id, brand, index) {
  if (!SUPPORTED_BRANDS.includes(brand)) throw new Error("Nền tảng không được hỗ trợ.");
  const user = await getUser(env, id);
  if (!user) throw new Error("Không tìm thấy người dùng.");
  const rows = [...(user.linked_accounts[brand] || [])];
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw new Error("Liên kết không tồn tại.");
  rows.splice(index, 1);
  const next = { ...user.linked_accounts, [brand]: rows };
  await updateLinkedAccounts(env, id, next);
  return next;
}