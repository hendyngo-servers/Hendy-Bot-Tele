import { getState, updateState } from "./store.js";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export function releaseDownloadUrl(id) {
  if (API_BASE) return `${API_BASE}/api/v1/releases/${encodeURIComponent(id)}/download`;
  return `#download-${id}`;
}

// User API Client
export async function api(path, options = {}, initData = "") {
  // If actual external backend is configured, send HTTP request
  if (API_BASE) {
    try {
      const headers = new Headers(options.headers || {});
      if (initData) headers.set("Authorization", "tma " + initData);
      if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
      const response = await fetch(API_BASE + path, { ...options, headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Yêu cầu API thất bại (" + response.status + ").");
      return payload;
    } catch (err) {
      console.warn("External API call failed, falling back to local store:", err.message);
    }
  }

  // Local simulated backend
  await new Promise(resolve => setTimeout(resolve, 80));
  return handleMockUserApi(path, options, initData);
}

// Admin API Client
export async function adminApi(path, token, options = {}) {
  // If actual external backend is configured, send HTTP request
  if (API_BASE) {
    try {
      const headers = new Headers(options.headers || {});
      if (token) headers.set("Authorization", "Bearer " + token);
      if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
      const response = await fetch(API_BASE + path, { ...options, headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "API error " + response.status);
      return result;
    } catch (err) {
      console.warn("External Admin API call failed, falling back to local store:", err.message);
    }
  }

  // Local simulated backend
  await new Promise(resolve => setTimeout(resolve, 80));
  return handleMockAdminApi(path, token, options);
}

function handleMockUserApi(path, options, initData) {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? (typeof options.body === "string" ? JSON.parse(options.body) : options.body) : {};
  const state = getState();
  const userId = state.currentUserId;
  const user = state.users[userId];

  if (!user) throw new Error("Người dùng không tồn tại.");

  if (path === "/api/v1/home") {
    const userOrders = state.orders.filter(o => o.userId === userId);
    const pendingCount = userOrders.filter(o => o.status === "pending").length;
    return {
      user: {
        id: user.id,
        name: user.name,
        balance: user.balance,
        voucher: user.voucher,
        createdAt: user.createdAt
      },
      membership: {
        tier: user.vip_tier === "basic" ? "Cơ bản" : user.vip_tier === "silver" ? "Bạc" : user.vip_tier === "gold" ? "Vàng" : "Kim cương"
      },
      orderSummary: {
        total: userOrders.length,
        pending: pendingCount
      }
    };
  }

  if (path.startsWith("/api/v1/orders?")) {
    const userOrders = state.orders.filter(o => o.userId === userId);
    return { orders: userOrders };
  }

  if (path === "/api/v1/orders" && method === "POST") {
    let price = 0;
    if (body.catalogItemId) {
      const item = state.catalogItems.find(c => c.id === body.catalogItemId);
      if (item && item.unit_price !== null) {
        price = Number(item.unit_price) * (Number(body.quantity) || 1);
      }
    }
    const newOrder = {
      id: "ord-" + Date.now(),
      orderNumber: "HD-" + Math.floor(10000 + Math.random() * 90000),
      userId,
      customerName: user.name,
      module: body.module,
      title: body.title,
      description: body.description || "",
      quantity: Number(body.quantity) || 1,
      amount: price,
      currency: "VND",
      status: "pending",
      paymentStatus: "unpaid",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      quote: null
    };

    updateState(s => {
      s.orders.unshift(newOrder);
      s.orderEvents.unshift({
        id: "ev-" + Date.now(),
        order_id: newOrder.id,
        actor_type: "user",
        actor_label: "Khách hàng",
        from_status: null,
        to_status: "pending",
        note: "Tạo đơn hàng mới",
        created_at: new Date().toISOString()
      });
    });

    return { order: newOrder };
  }

  const quoteMatch = path.match(/^\/api\/v1\/orders\/([^/]+)\/quotes\/([^/]+)\/respond$/);
  if (quoteMatch && method === "POST") {
    const orderId = quoteMatch[1];
    const decision = body.decision; // accepted or rejected
    let updated;
    updateState(s => {
      const order = s.orders.find(o => o.id === orderId);
      if (order && order.quote) {
        order.quote.status = decision;
        if (decision === "accepted") {
          order.status = "confirmed";
          order.amount = order.quote.amount;
        } else {
          order.status = "pending";
        }
        order.updatedAt = new Date().toISOString();
        s.orderEvents.unshift({
          id: "ev-" + Date.now(),
          order_id: order.id,
          actor_type: "user",
          actor_label: "Khách hàng",
          from_status: "pending",
          to_status: order.status,
          note: decision === "accepted" ? "Khách hàng đã chấp nhận báo giá" : "Khách hàng đã từ chối báo giá",
          created_at: new Date().toISOString()
        });
        updated = order;
      }
    });
    return { order: updated };
  }

  const payMatch = path.match(/^\/api\/v1\/orders\/([^/]+)\/pay$/);
  if (payMatch && method === "POST") {
    const orderId = payMatch[1];
    let newBalance = user.balance;
    updateState(s => {
      const curUser = s.users[userId];
      const order = s.orders.find(o => o.id === orderId);
      if (!order) throw new Error("Đơn hàng không tồn tại.");
      if (curUser.balance < order.amount) {
        throw new Error("Số dư không đủ để thanh toán. Vui lòng nạp thêm tiền.");
      }
      curUser.balance -= order.amount;
      order.paymentStatus = "paid";
      order.updatedAt = new Date().toISOString();
      newBalance = curUser.balance;

      s.walletLedger.unshift({
        id: "led-" + Date.now(),
        user_id: userId,
        source_type: "order_payment",
        source_id: order.id,
        amount: -order.amount,
        balanceAfter: newBalance,
        type: "order_payment",
        createdAt: new Date().toISOString()
      });

      s.orderEvents.unshift({
        id: "ev-" + Date.now(),
        order_id: order.id,
        actor_type: "user",
        actor_label: "Khách hàng",
        from_status: order.status,
        to_status: order.status,
        note: `Đã thanh toán ${new Intl.NumberFormat("vi-VN").format(order.amount)} ₫ từ số dư ví`,
        created_at: new Date().toISOString()
      });
    });
    return { success: true, balance: newBalance };
  }

  if (path === "/api/v1/links" && method === "GET") {
    return { links: user.linked_accounts || {} };
  }

  if (path === "/api/v1/links" && method === "POST") {
    const { brand, accountLabel } = body;
    updateState(s => {
      const u = s.users[userId];
      if (!u.linked_accounts) u.linked_accounts = {};
      if (!u.linked_accounts[brand]) u.linked_accounts[brand] = [];
      u.linked_accounts[brand].push({ tk: accountLabel, miniCode: brand + "-" + Math.floor(1000 + Math.random() * 9000) });
    });
    return { links: state.users[userId].linked_accounts };
  }

  const linkDeleteMatch = path.match(/^\/api\/v1\/links\/([^/]+)\/(\d+)$/);
  if (linkDeleteMatch && method === "DELETE") {
    const brand = decodeURIComponent(linkDeleteMatch[1]);
    const index = parseInt(linkDeleteMatch[2], 10);
    updateState(s => {
      const u = s.users[userId];
      if (u.linked_accounts && u.linked_accounts[brand]) {
        u.linked_accounts[brand].splice(index, 1);
      }
    });
    return { links: state.users[userId].linked_accounts };
  }

  if (path === "/api/v1/releases") {
    return { releases: state.appReleases };
  }

  if (path === "/api/v1/public-config") {
    return state.publicConfig;
  }

  if (path.startsWith("/api/v1/catalog")) {
    const url = new URL("http://localhost" + path);
    const mod = url.searchParams.get("module");
    const items = state.catalogItems.filter(c => Number(c.is_active) === 1 && (!mod || c.module === mod));
    return { items };
  }

  if (path === "/api/v1/wallet") {
    const deposits = state.depositRequests.filter(d => d.userId === userId);
    const transactions = state.walletLedger.filter(l => l.user_id === userId);
    return {
      balance: user.balance,
      voucher: user.voucher,
      payment: {
        configured: true,
        bankName: state.publicConfig.bankName,
        bankBin: state.publicConfig.bankBin,
        accountNumber: state.publicConfig.accountNumber,
        accountName: state.publicConfig.accountName,
        instruction: state.publicConfig.instruction
      },
      deposits,
      transactions
    };
  }

  if (path === "/api/v1/deposits" && method === "POST") {
    const amount = Number(body.amountVnd);
    if (!amount || amount < 10000 || amount > 100000000) {
      throw new Error("Số tiền phải từ 10.000 ₫ đến 100.000.000 ₫.");
    }
    const reference = "NAP" + Math.floor(100000 + Math.random() * 900000);
    const newDeposit = {
      id: "dep-" + Date.now(),
      reference,
      userId,
      userName: user.name,
      amount,
      status: "pending",
      adminNote: "",
      reviewedBy: null,
      createdAt: new Date().toISOString()
    };
    updateState(s => {
      s.depositRequests.unshift(newDeposit);
    });
    const qrUrl = `https://img.vietqr.io/image/${state.publicConfig.bankBin}-${state.publicConfig.accountNumber}-compact2.png?amount=${amount}&addInfo=${reference}&accountName=${encodeURIComponent(state.publicConfig.accountName)}`;
    return {
      request: newDeposit,
      transfer: {
        amount,
        reference,
        qrUrl
      }
    };
  }

  if (path === "/api/v1/support/tickets" && method === "GET") {
    const tickets = state.supportTickets
      .filter(t => t.ticket.user_id === userId)
      .map(t => t.ticket);
    return { tickets };
  }

  const ticketMatch = path.match(/^\/api\/v1\/support\/tickets\/([^/]+)$/);
  if (ticketMatch && method === "GET") {
    const ticketId = ticketMatch[1];
    const found = state.supportTickets.find(t => t.ticket.id === ticketId);
    if (!found) throw new Error("Ticket không tồn tại.");
    return found;
  }

  if (path === "/api/v1/support/tickets" && method === "POST") {
    const newTicketId = "tick-" + Date.now();
    const ticketNumber = "TICK-" + Math.floor(1000 + Math.random() * 9000);
    const newTicket = {
      ticket: {
        id: newTicketId,
        ticket_number: ticketNumber,
        user_id: userId,
        customer_name: user.name,
        category: body.category || "general",
        subject: body.subject,
        status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message: body.message
      },
      messages: [
        {
          id: "msg-" + Date.now(),
          ticket_id: newTicketId,
          sender_type: "user",
          sender_id: userId,
          message: body.message,
          created_at: new Date().toISOString()
        }
      ]
    };
    updateState(s => {
      s.supportTickets.unshift(newTicket);
    });
    return { ticket: newTicket };
  }

  const ticketMsgMatch = path.match(/^\/api\/v1\/support\/tickets\/([^/]+)\/messages$/);
  if (ticketMsgMatch && method === "POST") {
    const ticketId = ticketMsgMatch[1];
    let updated;
    updateState(s => {
      const found = s.supportTickets.find(t => t.ticket.id === ticketId);
      if (!found) throw new Error("Ticket không tồn tại.");
      const newMsg = {
        id: "msg-" + Date.now(),
        ticket_id: ticketId,
        sender_type: "user",
        sender_id: userId,
        message: body.message,
        created_at: new Date().toISOString()
      };
      found.messages.push(newMsg);
      found.ticket.updated_at = new Date().toISOString();
      found.ticket.last_message = body.message;
      found.ticket.status = "open";
      updated = found;
    });
    return updated;
  }

  if (path === "/api/v1/referral") {
    const commissions = state.referralCommissions.filter(c => c.referrerUserId === userId);
    return {
      code: user.referral_code || "HENDY88",
      invited: 2,
      inviteUrl: "https://t.me/hendy_bot?startapp=ref_" + (user.referral_code || "HENDY88"),
      commissionNote: "Nhận 10% hoa hồng trên đơn hàng dịch vụ đã hoàn tất của thành viên được bạn mời.",
      commissionAvailable: true,
      commissionRateBps: 1000,
      commissions: [
        { status: "pending", total: commissions.filter(c => c.status === "pending").length, amount: commissions.filter(c => c.status === "pending").reduce((a, b) => a + b.amount, 0) },
        { status: "approved", total: commissions.filter(c => c.status === "approved").length, amount: commissions.filter(c => c.status === "approved").reduce((a, b) => a + b.amount, 0) },
        { status: "paid", total: commissions.filter(c => c.status === "paid").length, amount: commissions.filter(c => c.status === "paid").reduce((a, b) => a + b.amount, 0) }
      ],
      referredBy: user.referred_by ? { id: "998877", name: "Người bảo trợ" } : null
    };
  }

  if (path === "/api/v1/referral/claim" && method === "POST") {
    const code = body.code?.trim().toUpperCase();
    if (code === user.referral_code) throw new Error("Không thể tự nhập mã của chính mình.");
    updateState(s => {
      s.users[userId].referred_by = code;
    });
    return { success: true };
  }

  if (path === "/api/v1/giftcodes/redeem" && method === "POST") {
    const code = body.code?.trim().toUpperCase();
    let reward = 0;
    updateState(s => {
      const gc = s.giftcodes.find(g => g.code.toUpperCase() === code && g.isActive);
      if (!gc) throw new Error("Mã Giftcode không hợp lệ hoặc đã hết hiệu lực.");
      if (gc.actualRedemptions >= gc.maxRedemptions) throw new Error("Mã Giftcode đã đạt giới hạn lượt đổi.");
      if (gc.redeemedBy && gc.redeemedBy.includes(userId)) throw new Error("Bạn đã đổi Giftcode này rồi.");
      
      gc.actualRedemptions += 1;
      gc.redeemedCount += 1;
      if (!gc.redeemedBy) gc.redeemedBy = [];
      gc.redeemedBy.push(userId);
      reward = gc.rewardVoucher;
      s.users[userId].voucher += reward;
    });
    return { rewardVoucher: reward };
  }

  if (path === "/api/v1/vip") {
    return {
      points: user.vip_points,
      pointsPer10000Vnd: 10,
      currentTier: state.vipTiers.find(t => t.code === user.vip_tier) || state.vipTiers[0],
      tiers: state.vipTiers
    };
  }

  return {};
}

function handleMockAdminApi(path, token, options) {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? (typeof options.body === "string" ? JSON.parse(options.body) : options.body) : {};
  const state = getState();

  if (path === "/api/v1/admin/stats") {
    const totalOrders = state.orders.length;
    const pending = state.orders.filter(o => o.status === "pending").length;
    const processing = state.orders.filter(o => o.status === "processing").length;
    return {
      stats: {
        users: Object.keys(state.users).length,
        totalOrders,
        pending,
        processing,
        releases: state.appReleases.length
      }
    };
  }

  if (path === "/api/v1/releases") {
    return { releases: state.appReleases };
  }

  if (path.startsWith("/api/v1/admin/orders?")) {
    const url = new URL("http://localhost" + path);
    const status = url.searchParams.get("status") || "all";
    const mod = url.searchParams.get("module") || "all";
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();

    let filtered = [...state.orders];
    if (status !== "all") filtered = filtered.filter(o => o.status === status);
    if (mod !== "all") filtered = filtered.filter(o => o.module === mod);
    if (q) {
      filtered = filtered.filter(o =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.title.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.userId.toLowerCase().includes(q)
      );
    }

    const stats = {
      total: state.orders.length,
      pending: state.orders.filter(o => o.status === "pending").length,
      confirmed: state.orders.filter(o => o.status === "confirmed").length,
      processing: state.orders.filter(o => o.status === "processing").length,
      completed: state.orders.filter(o => o.status === "completed").length,
      cancelled: state.orders.filter(o => o.status === "cancelled").length
    };

    return { orders: filtered, total: filtered.length, stats };
  }

  const orderDetailMatch = path.match(/^\/api\/v1\/admin\/orders\/([^/?]+)$/);
  if (orderDetailMatch && method === "GET") {
    const orderId = orderDetailMatch[1];
    const order = state.orders.find(o => o.id === orderId);
    if (!order) throw new Error("Đơn hàng không tồn tại.");
    const events = state.orderEvents.filter(e => e.order_id === orderId);
    return { order, events };
  }

  const orderQuoteMatch = path.match(/^\/api\/v1\/admin\/orders\/([^/]+)\/quote$/);
  if (orderQuoteMatch && method === "POST") {
    const orderId = orderQuoteMatch[1];
    let updated;
    updateState(s => {
      const order = s.orders.find(o => o.id === orderId);
      if (!order) throw new Error("Đơn hàng không tồn tại.");
      order.quote = {
        id: "quote-" + Date.now(),
        orderId,
        revision: (order.quote?.revision || 0) + 1,
        amount: Number(body.amount),
        note: body.note || "",
        status: "sent"
      };
      order.updatedAt = new Date().toISOString();
      s.orderEvents.unshift({
        id: "ev-" + Date.now(),
        order_id: orderId,
        actor_type: "admin",
        actor_label: "Admin / CSKH",
        from_status: order.status,
        to_status: order.status,
        note: `Đã gửi báo giá ${new Intl.NumberFormat("vi-VN").format(body.amount)} ₫. Ghi chú: ${body.note || "Không"}`,
        created_at: new Date().toISOString()
      });
      updated = { order, events: s.orderEvents.filter(e => e.order_id === orderId) };
    });
    return updated;
  }

  const orderStatusMatch = path.match(/^\/api\/v1\/admin\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch && method === "POST") {
    const orderId = orderStatusMatch[1];
    let updated;
    updateState(s => {
      const order = s.orders.find(o => o.id === orderId);
      if (!order) throw new Error("Đơn hàng không tồn tại.");
      const prevStatus = order.status;
      order.status = body.status;
      order.updatedAt = new Date().toISOString();
      s.orderEvents.unshift({
        id: "ev-" + Date.now(),
        order_id: orderId,
        actor_type: "admin",
        actor_label: "Admin / CSKH",
        from_status: prevStatus,
        to_status: body.status,
        note: body.note || "Quản trị viên chuyển trạng thái",
        created_at: new Date().toISOString()
      });
      updated = { order, events: s.orderEvents.filter(e => e.order_id === orderId) };
    });
    return updated;
  }

  if (path.startsWith("/api/v1/admin/deposits?")) {
    const url = new URL("http://localhost" + path);
    const status = url.searchParams.get("status") || "pending";
    let deposits = [...state.depositRequests];
    if (status !== "all") deposits = deposits.filter(d => d.status === status);
    return { deposits };
  }

  const depositReviewMatch = path.match(/^\/api\/v1\/admin\/deposits\/([^/]+)\/review$/);
  if (depositReviewMatch && method === "POST") {
    const depId = depositReviewMatch[1];
    updateState(s => {
      const dep = s.depositRequests.find(d => d.id === depId);
      if (!dep) throw new Error("Yêu cầu nạp không tồn tại.");
      dep.status = body.status;
      dep.adminNote = body.note || "";
      dep.reviewedBy = "Admin";
      if (body.status === "approved") {
        const u = s.users[dep.userId];
        if (u) {
          u.balance += dep.amount;
          s.walletLedger.unshift({
            id: "led-" + Date.now(),
            user_id: dep.userId,
            source_type: "deposit",
            source_id: dep.id,
            amount: dep.amount,
            balanceAfter: u.balance,
            type: "deposit",
            createdAt: new Date().toISOString()
          });
        }
      }
    });
    return { success: true };
  }

  if (path === "/api/v1/admin/catalog" && method === "GET") {
    return { items: state.catalogItems };
  }

  if (path === "/api/v1/admin/catalog" && method === "POST") {
    const newItem = {
      id: "cat-" + Date.now(),
      module: body.module,
      slug: body.slug,
      title: body.title,
      description: body.description || "",
      unit_price: body.unitPrice,
      duration_days: body.durationDays,
      stock: body.stock,
      sort_order: body.sortOrder || 100,
      is_active: 1
    };
    updateState(s => s.catalogItems.unshift(newItem));
    return newItem;
  }

  const catalogItemMatch = path.match(/^\/api\/v1\/admin\/catalog\/([^/]+)$/);
  if (catalogItemMatch && method === "PUT") {
    const id = catalogItemMatch[1];
    updateState(s => {
      const idx = s.catalogItems.findIndex(c => c.id === id);
      if (idx !== -1) {
        s.catalogItems[idx] = {
          ...s.catalogItems[idx],
          module: body.module,
          slug: body.slug,
          title: body.title,
          description: body.description || "",
          unit_price: body.unitPrice,
          duration_days: body.durationDays,
          stock: body.stock,
          sort_order: body.sortOrder || 100
        };
      }
    });
    return { success: true };
  }

  const catalogToggleMatch = path.match(/^\/api\/v1\/admin\/catalog\/([^/]+)\/(activate|deactivate)$/);
  if (catalogToggleMatch && method === "POST") {
    const id = catalogToggleMatch[1];
    const is_active = catalogToggleMatch[2] === "activate" ? 1 : 0;
    updateState(s => {
      const item = s.catalogItems.find(c => c.id === id);
      if (item) item.is_active = is_active;
    });
    return { success: true };
  }

  if (path === "/api/v1/admin/giftcodes" && method === "GET") {
    return { giftcodes: state.giftcodes };
  }

  if (path === "/api/v1/admin/giftcodes" && method === "POST") {
    const generated = "HENDY-" + Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const newGc = {
      id: "gc-" + Date.now(),
      code: generated,
      rewardVoucher: Number(body.rewardVoucher),
      maxRedemptions: Number(body.maxRedemptions),
      actualRedemptions: 0,
      redeemedCount: 0,
      expiresAt: body.expiresAt || null,
      isActive: true,
      createdAt: new Date().toISOString(),
      redeemedBy: []
    };
    updateState(s => s.giftcodes.unshift(newGc));
    return newGc;
  }

  const gcToggleMatch = path.match(/^\/api\/v1\/admin\/giftcodes\/([^/]+)\/(activate|deactivate)$/);
  if (gcToggleMatch && method === "POST") {
    const id = gcToggleMatch[1];
    const isActive = gcToggleMatch[2] === "activate";
    updateState(s => {
      const item = s.giftcodes.find(g => g.id === id);
      if (item) item.isActive = isActive;
    });
    return { success: true };
  }

  if (path.startsWith("/api/v1/admin/support/tickets?")) {
    const url = new URL("http://localhost" + path);
    const status = url.searchParams.get("status") || "all";
    let tickets = state.supportTickets.map(t => t.ticket);
    if (status !== "all") tickets = tickets.filter(t => t.status === status);
    return { tickets };
  }

  const adminTicketMatch = path.match(/^\/api\/v1\/admin\/support\/tickets\/([^/?]+)$/);
  if (adminTicketMatch && method === "GET") {
    const id = adminTicketMatch[1];
    const found = state.supportTickets.find(t => t.ticket.id === id);
    if (!found) throw new Error("Ticket không tồn tại.");
    return found;
  }

  const adminTicketMsgMatch = path.match(/^\/api\/v1\/admin\/support\/tickets\/([^/]+)\/messages$/);
  if (adminTicketMsgMatch && method === "POST") {
    const id = adminTicketMsgMatch[1];
    let updated;
    updateState(s => {
      const found = s.supportTickets.find(t => t.ticket.id === id);
      if (!found) throw new Error("Ticket không tồn tại.");
      found.messages.push({
        id: "msg-" + Date.now(),
        ticket_id: id,
        sender_type: "admin",
        sender_id: "api-admin",
        message: body.message,
        created_at: new Date().toISOString()
      });
      found.ticket.updated_at = new Date().toISOString();
      found.ticket.last_message = "CSKH: " + body.message;
      found.ticket.status = "awaiting_user";
      updated = found;
    });
    return updated;
  }

  const adminTicketStatusMatch = path.match(/^\/api\/v1\/admin\/support\/tickets\/([^/]+)\/status$/);
  if (adminTicketStatusMatch && method === "POST") {
    const id = adminTicketStatusMatch[1];
    updateState(s => {
      const found = s.supportTickets.find(t => t.ticket.id === id);
      if (found) found.ticket.status = body.status;
    });
    return { status: body.status };
  }

  if (path.startsWith("/api/v1/admin/referrals/commissions")) {
    return { commissions: state.referralCommissions };
  }

  const commissionSettleMatch = path.match(/^\/api\/v1\/admin\/referrals\/commissions\/([^/]+)\/settle$/);
  if (commissionSettleMatch && method === "POST") {
    const id = commissionSettleMatch[1];
    const action = body.action; // approve, pay, void
    updateState(s => {
      const comm = s.referralCommissions.find(c => c.id === id);
      if (!comm) throw new Error("Khoản hoa hồng không tồn tại.");
      if (action === "approve") {
        comm.status = "approved";
        comm.reviewedBy = "Admin";
      } else if (action === "pay") {
        comm.status = "paid";
        comm.paidBy = "Admin";
        const u = s.users[comm.referrerUserId];
        if (u) {
          u.balance += comm.amount;
          s.walletLedger.unshift({
            id: "led-" + Date.now(),
            user_id: comm.referrerUserId,
            source_type: "referral_commission",
            source_id: comm.id,
            amount: comm.amount,
            balanceAfter: u.balance,
            type: "referral_commission",
            createdAt: new Date().toISOString()
          });
        }
      } else if (action === "void") {
        comm.status = "void";
      }
      if (body.note) comm.adminNote = body.note;
    });
    return { success: true };
  }

  if (path === "/api/v1/admin/releases" && method === "POST") {
    const newRelease = {
      id: "rel-" + Date.now(),
      platform: "Android",
      version: "2.1.0",
      file_name: "HendyBot_Release.apk",
      file_size: 15000000,
      release_notes: "Bản phát hành cập nhật mới từ Bảng quản trị.",
      released_at: new Date().toISOString()
    };
    updateState(s => s.appReleases.unshift(newRelease));
    return newRelease;
  }

  if (path === "/api/v1/admin/webhook/setup") {
    return { success: true, message: "Đã đăng ký webhook Telegram thành công." };
  }

  return {};
}
