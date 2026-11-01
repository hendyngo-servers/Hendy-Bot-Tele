import { parseTelegramId, randomId, safeText } from "../utils/helpers.js";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function idempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) fail("Thiếu hoặc sai Idempotency-Key.");
  return key;
}
function present(row) {
  if (!row) return null;
  return {
    id: row.id, reference: row.reference, amount: Number(row.amount),
    status: row.status, adminNote: row.admin_note || "",
    createdAt: row.created_at, reviewedAt: row.reviewed_at || null
  };
}

export async function getWalletOverview(env, userId) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const [user, rows, ledgerRows] = await Promise.all([
    env.DB.prepare("SELECT balance,voucher FROM users WHERE id = ?").bind(id).first(),
    env.DB.prepare("SELECT * FROM deposit_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all(),
    env.DB.prepare("SELECT id,source_type,source_id,amount,balance_after,created_at FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC,rowid DESC LIMIT 50").bind(id).all()
  ]);
  if (!user) fail("Không tìm thấy người dùng.", 404);
  return {
    balance: Number(user.balance || 0), voucher: Number(user.voucher || 0),
    deposits: (rows.results || []).map(present),
    transactions: (ledgerRows.results || []).map(row => ({
      id: row.id,
      type: row.source_type,
      sourceId: row.source_id,
      amount: Number(row.amount),
      balanceAfter: Number(row.balance_after),
      createdAt: row.created_at
    })),
    payment: {
      bankName: String(env.BANK_NAME || ""), bankBin: String(env.BANK_BIN || ""),
      accountNumber: String(env.BANK_ACCOUNT || ""), accountName: String(env.BANK_ACCOUNT_NAME || ""),
      configured: Boolean(env.BANK_ACCOUNT && env.BANK_ACCOUNT_NAME && (env.BANK_BIN || env.BANK_NAME)),
      minimumAmount: 10000, maximumAmount: 100000000,
      instruction: "Tạo yêu cầu trước, chuyển khoản đúng số tiền và nội dung tham chiếu. Chỉ được cộng số dư sau khi quản trị viên đối soát giao dịch."
    }
  };
}

export async function createDepositRequest(env, userId, input, keyValue) {
  const id = parseTelegramId(userId);
  if (!id) fail("Telegram user ID không hợp lệ.");
  const key = idempotencyKey(keyValue);
  const amount = Number(input?.amountVnd);
  if (!Number.isSafeInteger(amount) || amount < 10000 || amount > 100000000) {
    fail("Số tiền nạp phải từ 10.000 đến 100.000.000 VNĐ.");
  }
  const existing = await env.DB.prepare(
    "SELECT * FROM deposit_requests WHERE user_id = ? AND idempotency_key = ?"
  ).bind(id, key).first();
  if (existing) {
    if (Number(existing.amount) !== amount) fail("Idempotency-Key đã được dùng cho yêu cầu nạp khác.", 409);
    return {
      request: present(existing),
      transfer: makeTransferDetails(env, Number(existing.amount), existing.reference),
      duplicate: true
    };
  }
  const requestId = randomId();
  const reference = "HD" + Date.now().toString(36).toUpperCase() + crypto.randomUUID().slice(0, 6).toUpperCase();
  await env.DB.prepare(
    "INSERT INTO deposit_requests(id,reference,user_id,amount,idempotency_key) VALUES(?,?,?,?,?) ON CONFLICT(user_id,idempotency_key) DO NOTHING"
  ).bind(requestId, reference, id, amount, key).run();
  const saved = await env.DB.prepare(
    "SELECT * FROM deposit_requests WHERE user_id = ? AND idempotency_key = ?"
  ).bind(id, key).first();
  if (!saved) fail("Không thể tạo yêu cầu nạp tiền.");
  if (Number(saved.amount) !== amount) fail("Idempotency-Key đã được dùng cho yêu cầu nạp khác.", 409);
  return {
    request: present(saved),
    transfer: makeTransferDetails(env, Number(saved.amount), saved.reference),
    duplicate: saved.id !== requestId
  };
}

export async function listAdminDeposits(env, status = "pending") {
  const selected = String(status || "pending");
  if (selected !== "all" && !["pending", "approved", "rejected"].includes(selected)) fail("Trạng thái nạp tiền không hợp lệ.");
  const result = selected === "all"
    ? await env.DB.prepare("SELECT d.*,u.name AS user_name FROM deposit_requests d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 200").all()
    : await env.DB.prepare("SELECT d.*,u.name AS user_name FROM deposit_requests d LEFT JOIN users u ON u.id=d.user_id WHERE d.status=? ORDER BY d.created_at DESC LIMIT 200").bind(selected).all();
  return (result.results || []).map(row => ({ ...present(row), userId: row.user_id, userName: row.user_name || "Thành viên" }));
}

export async function reviewDepositRequest(env, requestId, admin, input) {
  if (!/^[0-9a-f-]{36}$/i.test(String(requestId || ""))) fail("Mã yêu cầu nạp không hợp lệ.");
  const status = String(input?.status || "");
  if (!["approved", "rejected"].includes(status)) fail("Trạng thái xử lý không hợp lệ.");
  const note = safeText(input?.note || "", 500);
  const actor = safeText(admin?.id || "admin", 80);
  const ledgerId = randomId();
  const ledgerKey = "deposit:" + requestId;
  // D1 batch is transactional: only a pending request can credit balance and append one ledger row.
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE deposit_requests SET status=?,admin_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(status, note, actor, requestId),
    env.DB.prepare("UPDATE users SET balance=balance+(SELECT amount FROM deposit_requests WHERE id=? AND status='approved') WHERE id=(SELECT user_id FROM deposit_requests WHERE id=? AND status='approved') AND changes()=1").bind(requestId, requestId),
    env.DB.prepare("INSERT INTO wallet_ledger(id,user_id,source_type,source_id,amount,balance_after,idempotency_key) SELECT ?,d.user_id,'deposit',d.id,d.amount,u.balance,? FROM deposit_requests d JOIN users u ON u.id=d.user_id WHERE d.id=? AND d.status='approved' AND changes()=1 ON CONFLICT(user_id,idempotency_key) DO NOTHING").bind(ledgerId, ledgerKey, requestId)
  ]);
  const saved = await env.DB.prepare("SELECT * FROM deposit_requests WHERE id=?").bind(requestId).first();
  if (!saved) fail("Không tìm thấy yêu cầu nạp tiền.", 404);
  if (saved.status !== status) {
    if (saved.status === "approved" || saved.status === "rejected") fail("Yêu cầu đã được quản trị viên xử lý trước đó.", 409);
    fail("Không thể cập nhật trạng thái yêu cầu.");
  }
  return { request: present(saved), duplicate: Number(results?.[0]?.meta?.changes || 0) === 0 };
}


function makeTransferDetails(env, amount, reference) {
  const bankBin = String(env.BANK_BIN || "").trim();
  const accountNumber = String(env.BANK_ACCOUNT || "").trim();
  const configured = Boolean(accountNumber && env.BANK_ACCOUNT_NAME && (bankBin || env.BANK_NAME));
  const qrUrl = configured && bankBin
    ? "https://img.vietqr.io/image/" + encodeURIComponent(bankBin) + "-" +
      encodeURIComponent(accountNumber) + "-compact2.png?amount=" + amount +
      "&addInfo=" + encodeURIComponent(reference) +
      "&accountName=" + encodeURIComponent(String(env.BANK_ACCOUNT_NAME || ""))
    : null;
  return {
    configured,
    bankName: String(env.BANK_NAME || ""),
    bankBin,
    accountNumber,
    accountName: String(env.BANK_ACCOUNT_NAME || ""),
    amount,
    reference,
    qrUrl
  };
}
