import crypto from "crypto";
import { getUser, addBalance, deductBalance } from "./userService.js";

// In-Memory Cloudflare D1 Emulation Tables
const catalog = new Map();
const orders = new Map();
const tickets = new Map();
const giftcodes = new Map();

// Seed initial production-grade App Store Catalog
const SEED_PRODUCTS = [
  {
    id: "app-1",
    title: "Telegram Bot Automator Pro",
    slug: "telegram-bot-automator-pro",
    category: "tools",
    module: "app_tool",
    icon: "⚡",
    developer: "Hendy Studio",
    rating: 4.9,
    reviewsCount: 342,
    downloads: "12K+",
    version: "2.4.1",
    tagline: "Công cụ tự động hóa Telegram chuyên nghiệp đa luồng, hỗ trợ xoay proxy và quản lý session.",
    description: "Bộ công cụ hoàn chỉnh dành cho quản trị viên và doanh nghiệp. Tự động hóa tiếp thị, trả lời tự động, đồng bộ dữ liệu với Cloudflare D1, chạy ổn định trên mọi nền tảng Windows/Linux.",
    screenshots: [
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=80"
    ],
    price: 350000,
    unit_price: 350000,
    r2Bucket: "hendy-bot-assets",
    r2ObjectKey: "packages/v2.4.1/telegram-bot-automator-pro.zip",
    pagesDeployUrl: "https://automator-pro.pages.dev",
    sort_order: 10,
    is_active: 1,
    featured: true,
    created_at: "2026-10-30T11:35:15.439Z"
  },
  {
    id: "app-2",
    title: "Mini Game Live Streaming Hub",
    slug: "mini-game-live-streaming-hub",
    category: "gaming",
    module: "mini_game_live",
    icon: "🎮",
    developer: "Hendy Gaming",
    rating: 4.8,
    reviewsCount: 512,
    downloads: "25K+",
    version: "3.0.0",
    tagline: "Hệ thống kết nối và quản trị mini game trực tuyến, đồng bộ hóa kết quả và giải đấu.",
    description: "Tích hợp sẵn các sảnh thể thao và trò chơi live phổ biến (QQ88, 78WIN, SC88). Hỗ trợ ghép đôi thời gian thực và quản lý tài khoản liên kết an toàn.",
    screenshots: [
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80"
    ],
    price: 0,
    unit_price: 0,
    r2Bucket: "hendy-bot-assets",
    r2ObjectKey: "packages/v3.0.0/mini-game-live-hub.zip",
    pagesDeployUrl: "https://minigame-hub.pages.dev",
    sort_order: 20,
    is_active: 1,
    featured: true,
    created_at: "2026-10-27T11:35:15.439Z"
  },
  {
    id: "app-3",
    title: "Source Code Cloudflare Worker Bot",
    slug: "source-code-cloudflare-worker-bot",
    category: "source_code",
    module: "buy_code",
    icon: "💻",
    developer: "Hendy Cloud Labs",
    rating: 5.0,
    reviewsCount: 189,
    downloads: "5K+",
    version: "2.1.0",
    tagline: "Mã nguồn đầy đủ kiến trúc Serverless Cloudflare (Worker + D1 + R2 + Pages).",
    description: "Bộ mã nguồn chuẩn doanh nghiệp không cần máy chủ VPS. Tiết kiệm 100% chi phí vận hành hàng tháng, chịu tải hàng triệu request mỗi ngày.",
    screenshots: [
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80"
    ],
    price: 650000,
    unit_price: 650000,
    r2Bucket: "hendy-bot-assets",
    r2ObjectKey: "sources/worker-bot-fullstack-v2.1.tar.gz",
    pagesDeployUrl: "https://cloudflare-worker-docs.pages.dev",
    sort_order: 30,
    is_active: 1,
    featured: false,
    created_at: "2026-10-25T11:35:15.439Z"
  },
  {
    id: "app-4",
    title: "Proxy Dân Cư Tĩnh IPv4 Cao Cấp",
    slug: "proxy-ipv4-residential-clean",
    category: "proxy",
    module: "otp_proxy",
    icon: "🛡️",
    developer: "Hendy Network",
    rating: 4.7,
    reviewsCount: 220,
    downloads: "8K+",
    version: "1.0",
    tagline: "Dải IP dân cư sạch độc quyền, băng thông không giới hạn, độ trễ cực thấp.",
    description: "Chuyên dụng cho các tác vụ Telegram Bot, chống chặn IP, tốc độ cao với SLA 99.9%.",
    screenshots: [],
    price: 80000,
    unit_price: 80000,
    r2Bucket: "hendy-bot-assets",
    r2ObjectKey: "proxies/residential-pool-config.json",
    pagesDeployUrl: "https://proxy-manager.pages.dev",
    sort_order: 40,
    is_active: 1,
    featured: false,
    created_at: "2026-10-22T11:35:15.439Z"
  },
  {
    id: "app-5",
    title: "Gói Dịch Vụ Cụm Bot VIP Doanh Nghiệp",
    slug: "vip-enterprise-bot-cluster",
    category: "vip_accounts",
    module: "vip_tools",
    icon: "👑",
    developer: "Hendy Enterprise",
    rating: 5.0,
    reviewsCount: 45,
    downloads: "500+",
    version: "4.0",
    tagline: "Giải pháp kiến trúc tùy chỉnh cho hệ thống phân phối lớn với hỗ trợ kỹ thuật 24/7.",
    description: "Bao gồm domain riêng, hạ tầng Render chuyên dụng và Cloudflare Enterprise WAF. Báo giá tùy theo quy mô và yêu cầu cụ thể.",
    screenshots: [],
    price: 1200000,
    unit_price: 1200000,
    r2Bucket: "hendy-bot-assets",
    r2ObjectKey: "enterprise/cluster-manifest-v4.yaml",
    pagesDeployUrl: "https://enterprise-vip.pages.dev",
    sort_order: 50,
    is_active: 1,
    featured: true,
    created_at: "2026-11-01T11:35:15.439Z"
  }
];

// Seed Catalog Map
SEED_PRODUCTS.forEach((p) => catalog.set(p.id, { ...p }));

// Seed sample orders
const SEED_ORDERS = [
  {
    id: "ORD-90214",
    userId: "99887766",
    userName: "Hội viên Hendy",
    title: "Đặt mua: Telegram Bot Automator Pro",
    module: "tools",
    amount: 350000,
    quoted_amount: 350000,
    status: "completed",
    paymentStatus: "paid",
    details: { productId: "app-1", version: "2.4.1" },
    created_at: "2026-10-31T09:12:00.000Z"
  },
  {
    id: "ORD-90215",
    userId: "99887766",
    userName: "Hội viên Hendy",
    title: "Cài Đặt: Mini Game Live Streaming Hub",
    module: "gaming",
    amount: 0,
    quoted_amount: 0,
    status: "completed",
    paymentStatus: "paid",
    details: { productId: "app-2", version: "3.0.0" },
    created_at: "2026-10-31T14:20:00.000Z"
  }
];
SEED_ORDERS.forEach((o) => orders.set(o.id, { ...o }));

// Seed sample giftcodes
const SEED_GIFTCODES = [
  {
    code: "HENDY-VIP-100K",
    amount: 100000,
    maxUses: 50,
    usedCount: 12,
    status: "active",
    createdBy: "admin",
    created_at: "2026-10-25T00:00:00.000Z"
  },
  {
    code: "CLOUDFLARE-PROMO-50K",
    amount: 50000,
    maxUses: 100,
    usedCount: 45,
    status: "active",
    createdBy: "admin",
    created_at: "2026-10-28T00:00:00.000Z"
  }
];
SEED_GIFTCODES.forEach((g) => giftcodes.set(g.code, { ...g }));

// Seed sample support tickets
const SEED_TICKETS = [
  {
    id: "TCK-8812",
    userId: "99887766",
    userName: "Hội viên Hendy",
    subject: "Hỗ trợ kết nối webhook Telegram với Cloudflare Pages",
    category: "technical",
    status: "open",
    messages: [
      {
        sender: "user",
        text: "Xin chào kỹ thuật, tôi cần hướng dẫn cấu hình webhook cho cụm bot trên Render.",
        created_at: "2026-10-31T10:00:00.000Z"
      },
      {
        sender: "support",
        text: "Chào bạn! Bộ phận kỹ thuật đã nhận yêu cầu. Bạn chỉ cần gắn URL https://api.telegram.org/bot<TOKEN>/setWebhook vào Render là xong.",
        created_at: "2026-10-31T10:15:00.000Z"
      }
    ],
    created_at: "2026-10-31T10:00:00.000Z"
  }
];
SEED_TICKETS.forEach((t) => tickets.set(t.id, { ...t }));

// === CATALOG APIS ===
export async function getCatalogItems(category = "all", search = "") {
  let list = Array.from(catalog.values()).filter((p) => p.is_active);
  if (category && category !== "all") {
    list = list.filter((p) => p.category === category || p.module === category);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.tagline?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
}

export async function packageAndDeployProduct(payload) {
  const id = `app-${Date.now().toString().slice(-5)}`;
  const priceNum = Number(payload.price || 0);
  const newProduct = {
    id,
    title: payload.title,
    slug: payload.title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-"),
    category: payload.category || "tools",
    module: payload.category || "tools",
    icon: payload.icon || "📦",
    developer: payload.developer || "Hendy Cloud Studio",
    rating: 5.0,
    reviewsCount: 1,
    downloads: "10+",
    version: payload.version || "1.0.0",
    tagline: payload.tagline || "",
    description: payload.description || "",
    screenshots: payload.screenshots || [],
    price: priceNum,
    unit_price: priceNum,
    r2Bucket: payload.r2Bucket || "hendy-bot-assets",
    r2ObjectKey: payload.r2ObjectKey || `packages/${payload.version}/${id}.zip`,
    pagesDeployUrl: payload.pagesDeployUrl || "https://hendy-web-user.pages.dev",
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    sort_order: 1,
    is_active: 1,
    featured: Boolean(payload.featured),
    created_at: new Date().toISOString()
  };

  catalog.set(id, newProduct);
  return newProduct;
}

// === ORDERS APIS ===
export async function createOrder(userId, data) {
  const user = await getUser(userId);
  const id = `ORD-${Date.now().toString().slice(-5)}`;
  const amount = Number(data.amountVnd || data.amount || 0);

  const order = {
    id,
    userId: user.id,
    userName: user.name,
    title: data.title || "Đơn hàng Telegram Bot",
    module: data.module || "tools",
    amount,
    quoted_amount: amount,
    status: amount === 0 ? "completed" : "pending",
    paymentStatus: amount === 0 ? "paid" : "unpaid",
    details: data.details || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  orders.set(id, order);
  return order;
}

export async function getOrders(userId = null) {
  const all = Array.from(orders.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  if (userId) return all.filter((o) => o.userId === String(userId));
  return all;
}

export async function payOrder(orderId, userId) {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Đơn hàng ${orderId} không tồn tại.`);
  if (order.paymentStatus === "paid") return { success: true, order, alreadyPaid: true };

  await deductBalance(userId, order.amount, `Thanh toán đơn hàng #${order.id}`);
  order.paymentStatus = "paid";
  order.status = "processing";
  order.updated_at = new Date().toISOString();
  orders.set(orderId, order);

  return {
    success: true,
    order,
    accessKey: `HENDY-R2-${crypto.randomBytes(4).toString("hex").toUpperCase()}`
  };
}

export async function updateOrderStatus(orderId, status) {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Đơn hàng ${orderId} không tồn tại.`);
  order.status = status;
  order.updated_at = new Date().toISOString();
  orders.set(orderId, order);
  return order;
}

// === GIFTCODE VAULT ===
export async function issueGiftCode(data) {
  const prefix = (data.codePrefix || "HENDY").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const code = `${prefix}-${suffix}`;
  const amount = Number(data.amountVnd || data.amount || 50000);

  const giftcode = {
    code,
    amount,
    maxUses: Number(data.maxUses || 10),
    usedCount: 0,
    status: "active",
    createdBy: data.adminId || "admin",
    created_at: new Date().toISOString()
  };

  giftcodes.set(code, giftcode);
  return giftcode;
}

export async function redeemGiftCode(userId, code) {
  const cleanCode = (code || "").trim().toUpperCase();
  const gc = giftcodes.get(cleanCode);
  if (!gc) {
    throw new Error("Mã Giftcode không tồn tại.");
  }
  if (gc.status !== "active" || gc.usedCount >= gc.maxUses) {
    throw new Error("Mã Giftcode đã hết lượt sử dụng hoặc không còn hiệu lực.");
  }

  gc.usedCount += 1;
  if (gc.usedCount >= gc.maxUses) {
    gc.status = "depleted";
  }
  giftcodes.set(cleanCode, gc);

  await addBalance(userId, gc.amount, `Đổi Giftcode: ${gc.code}`, "giftcode_redeem");

  return {
    success: true,
    amount: gc.amount,
    code: gc.code
  };
}

export async function getGiftCodesList() {
  return Array.from(giftcodes.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// === SUPPORT TICKETS ===
export async function getTickets(userId = null) {
  const all = Array.from(tickets.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  if (userId) return all.filter((t) => t.userId === String(userId));
  return all;
}

export async function createTicket(userId, data) {
  const user = await getUser(userId);
  const id = `TCK-${Date.now().toString().slice(-4)}`;
  const ticket = {
    id,
    userId: user.id,
    userName: user.name,
    subject: data.subject || "Yêu cầu hỗ trợ kỹ thuật",
    category: data.category || "order",
    status: "open",
    messages: [
      {
        sender: "user",
        text: data.message || "Tôi cần hỗ trợ.",
        created_at: new Date().toISOString()
      }
    ],
    created_at: new Date().toISOString()
  };
  tickets.set(id, ticket);
  return ticket;
}

export async function replyTicket(ticketId, text, sender = "support") {
  const ticket = tickets.get(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} không tồn tại.`);
  ticket.messages.push({
    sender,
    text,
    created_at: new Date().toISOString()
  });
  ticket.updated_at = new Date().toISOString();
  tickets.set(ticketId, ticket);
  return ticket;
}

// === ADMIN STATS ===
export async function getAdminStats() {
  const allOrders = Array.from(orders.values());
  const allGiftcodes = Array.from(giftcodes.values());
  const allTickets = Array.from(tickets.values());
  const totalRevenue = allOrders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + (o.amount || 0), 0);

  return {
    totalRevenue,
    totalOrders: allOrders.length,
    activeProducts: catalog.size,
    pendingTickets: allTickets.filter((t) => t.status === "open").length,
    activeGiftcodes: allGiftcodes.filter((g) => g.status === "active").length,
    r2Storage: "24.5 GB (182 Objects)",
    d1Queries: "14,290 req/day",
    pagesBuilds: "42 successful deploys"
  };
}
