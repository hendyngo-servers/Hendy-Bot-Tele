import crypto from "crypto";

const users = new Map();
const ledger = [];
const deposits = new Map();

// Initialize default seed user
const DEFAULT_USER_ID = "99887766";
users.set(DEFAULT_USER_ID, {
  id: DEFAULT_USER_ID,
  telegramId: DEFAULT_USER_ID,
  name: "Hội viên Hendy",
  username: "hendy_vip",
  role: "admin",
  balance: 1500000,
  voucherBalance: 200000,
  points: 450,
  tier: "VIP Kim Cương",
  status: "active",
  createdAt: "2026-10-01T00:00:00.000Z"
});

export async function getUser(userId = DEFAULT_USER_ID) {
  let user = users.get(String(userId));
  if (!user) {
    user = {
      id: String(userId),
      telegramId: String(userId),
      name: `User ${userId}`,
      username: `user_${userId}`,
      role: "member",
      balance: 500000,
      voucherBalance: 50000,
      points: 50,
      tier: "Thành viên Đồng",
      status: "active",
      createdAt: new Date().toISOString()
    };
    users.set(String(userId), user);
  }
  return { ...user };
}

export async function getWallet(userId = DEFAULT_USER_ID) {
  const user = await getUser(userId);
  const userLedger = ledger.filter((l) => l.userId === user.id).slice(0, 50);
  return {
    userId: user.id,
    balance: user.balance,
    voucher: user.voucherBalance,
    points: user.points,
    tier: user.tier,
    ledger: userLedger
  };
}

export async function addBalance(userId, amount, note, type = "deposit") {
  const user = users.get(String(userId)) || (await getUser(userId));
  user.balance += Number(amount);
  users.set(user.id, user);

  ledger.unshift({
    id: `tx-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
    userId: user.id,
    type,
    amount: Number(amount),
    balanceAfter: user.balance,
    note,
    createdAt: new Date().toISOString()
  });

  return user.balance;
}

export async function deductBalance(userId, amount, note, type = "order_payment") {
  const user = users.get(String(userId)) || (await getUser(userId));
  const numAmount = Number(amount);
  if (user.balance < numAmount) {
    throw new Error(
      `Số dư ví không đủ (hiện có ${Number(user.balance || 0).toLocaleString("vi-VN")} đ, cần ${numAmount.toLocaleString("vi-VN")} đ).`
    );
  }
  user.balance -= numAmount;
  users.set(user.id, user);

  ledger.unshift({
    id: `tx-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
    userId: user.id,
    type,
    amount: -numAmount,
    balanceAfter: user.balance,
    note,
    createdAt: new Date().toISOString()
  });

  return user.balance;
}

export async function createDepositRequest(userId, amountVnd) {
  const user = await getUser(userId);
  const depositId = `DEP-${Date.now().toString().slice(-6)}`;
  const transferContent = `HENDY ${user.id} ${depositId}`;
  
  const bankId = process.env.VIETQR_BANK_ID || "MB";
  const accountNo = process.env.VIETQR_ACCOUNT_NO || "0988776655";
  const accountName = encodeURIComponent(process.env.VIETQR_ACCOUNT_NAME || "HENDY STUDIO CO");
  const encodedContent = encodeURIComponent(transferContent);
  const vietQrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amountVnd}&addInfo=${encodedContent}&accountName=${accountName}`;

  const depositRecord = {
    id: depositId,
    userId: user.id,
    userName: user.name,
    amount: Number(amountVnd),
    transferContent,
    status: "pending", // 'pending' | 'approved' | 'rejected'
    bankInfo: { bankId, accountNo, accountName: decodeURIComponent(accountName) },
    vietQrUrl,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerId: null
  };

  deposits.set(depositId, depositRecord);

  return {
    deposit: depositRecord,
    vietQrUrl
  };
}

export async function getDepositsList(filter = "all") {
  const all = Array.from(deposits.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filter === "pending") return all.filter((d) => d.status === "pending");
  if (filter === "approved") return all.filter((d) => d.status === "approved");
  return all;
}

export async function reviewDeposit(depositId, decision, reviewerId = "admin") {
  const dep = deposits.get(depositId);
  if (!dep) {
    throw new Error(`Deposit ${depositId} not found`);
  }
  if (dep.status !== "pending") {
    throw new Error(`Deposit ${depositId} is already ${dep.status}`);
  }

  dep.status = decision === "approved" ? "approved" : "rejected";
  dep.reviewedAt = new Date().toISOString();
  dep.reviewerId = reviewerId;

  if (dep.status === "approved") {
    await addBalance(dep.userId, dep.amount, `Duyệt nạp tiền VietQR #${dep.id}`, "vietqr_deposit");
  }

  deposits.set(depositId, dep);
  return dep;
}

export async function getVipTiers(userId = DEFAULT_USER_ID) {
  const user = await getUser(userId);
  return {
    points: user.points,
    currentTier: {
      name: user.tier,
      cashbackRate: "5%",
      badge: "VIP Kim Cương",
      color: "#ec4899"
    },
    nextTier: {
      name: "VIP Huyền Thoại",
      requiredPoints: 1000,
      pointsRemaining: Math.max(0, 1000 - user.points)
    },
    benefits: [
      "Miễn phí 100% chi phí chuyển giao Cloudflare Pages",
      "Ưu đãi giảm giá 15% tất cả sản phẩm R2",
      "Kênh hỗ trợ riêng biệt 24/7 với phản hồi < 5 phút",
      "Tặng Giftcode độc quyền định kỳ mỗi tháng"
    ]
  };
}
