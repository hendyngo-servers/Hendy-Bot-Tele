// Local in-memory development mock backend simulating Cloudflare Workers + D1
let mockUser = {
  id: "88888888",
  name: "Thành viên Hendy",
  balance: 1500000,
  voucher: 250,
  created_at: new Date(Date.now() - 30 * 86400000).toISOString()
};

let mockLinks = {
  "QQ88": [{ tk: "hendy_qq_pro" }],
  "78WIN": [{ tk: "win78_vip_88" }],
  "SC88": [],
  "C168": [],
  "CM88": [],
  "F8BET": [{ tk: "f8_gamer_99" }]
};

let mockCatalog = [
  {
    id: "cat-1",
    module: "app_tool",
    slug: "tool-auto-tele-30d",
    title: "Tool Tự Động Telegram Pro (30 Ngày)",
    description: "Công cụ tự động hóa bản quyền chạy trên VPS/PC, hỗ trợ multi-session và proxy.",
    unit_price: 350000,
    duration_days: 30,
    stock: 25,
    sort_order: 10,
    is_active: 1
  },
  {
    id: "cat-2",
    module: "app_tool",
    slug: "tool-bot-vip-life",
    title: "Gói Tool VIP Vĩnh Viễn",
    description: "Bộ script cao cấp cập nhật trọn đời, hỗ trợ API riêng.",
    unit_price: 1200000,
    duration_days: 365,
    stock: 10,
    sort_order: 20,
    is_active: 1
  },
  {
    id: "cat-3",
    module: "buy_code",
    slug: "code-screen-react",
    title: "Source Code Mini App React/Vite",
    description: "Mã nguồn đầy đủ Telegram Mini App + giao diện người dùng tối ưu mobile.",
    unit_price: 450000,
    duration_days: null,
    stock: 99,
    sort_order: 10,
    is_active: 1
  },
  {
    id: "cat-4",
    module: "buy_code",
    slug: "code-tele-bot-cloudflare",
    title: "Source Code Worker Telegram Bot + D1",
    description: "Kiến trúc Serverless không cần VPS, chạy hoàn toàn trên Cloudflare miễn phí.",
    unit_price: 650000,
    duration_days: null,
    stock: 50,
    sort_order: 20,
    is_active: 1
  },
  {
    id: "cat-5",
    module: "otp_proxy",
    slug: "proxy-ipv4-residential",
    title: "Proxy Dân Cư Tĩnh IPv4 (30 Ngày)",
    description: "Proxy sạch chuyên dụng cho bot Telegram và công cụ tự động.",
    unit_price: 80000,
    duration_days: 30,
    stock: 100,
    sort_order: 10,
    is_active: 1
  },
  {
    id: "cat-6",
    module: "vip",
    slug: "vip-custom-bot-cluster",
    title: "Triển Khai Cụm Bot Doanh Nghiệp Riêng",
    description: "Thiết kế riêng cho hệ thống phân phối lớn, tích hợp webhook bảo mật cao.",
    unit_price: null,
    duration_days: 90,
    stock: null,
    sort_order: 10,
    is_active: 1
  }
];

let mockOrders = [
  {
    id: "ord-1",
    orderNumber: "HD-982101",
    userId: "88888888",
    customerName: "Thành viên Hendy",
    module: "app_tool",
    title: "Thuê Tool Tự Động Telegram Pro (30 Ngày)",
    description: "Cần hỗ trợ cấu hình trên Windows 11.",
    quantity: 1,
    amount: 350000,
    status: "processing",
    paymentStatus: "paid",
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    quote: null,
    events: [
      { id: "ev-1", actor_type: "user", actor_label: "Khách hàng", to_status: "pending", note: "Tạo đơn hàng", created_at: new Date(Date.now() - 3600000 * 4).toISOString() },
      { id: "ev-2", actor_type: "admin", actor_label: "Admin", from_status: "pending", to_status: "confirmed", note: "Đã xác nhận đơn", created_at: new Date(Date.now() - 3600000 * 3).toISOString() },
      { id: "ev-3", actor_type: "user", actor_label: "Khách hàng", from_status: "confirmed", to_status: "processing", note: "Thanh toán thành công từ ví", created_at: new Date(Date.now() - 3600000 * 2).toISOString() }
    ]
  },
  {
    id: "ord-2",
    orderNumber: "HD-982102",
    userId: "88888888",
    customerName: "Thành viên Hendy",
    module: "mini_game_live",
    title: "Yêu cầu Mini Game Live - Đồng bộ tài khoản QQ88",
    description: "Mã tài khoản hendy_qq_pro, sảnh thể thao live.",
    quantity: 1,
    amount: 0,
    status: "pending",
    paymentStatus: "unpaid",
    createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    quote: null,
    events: [
      { id: "ev-4", actor_type: "user", actor_label: "Khách hàng", to_status: "pending", note: "Khởi tạo yêu cầu dịch vụ", created_at: new Date(Date.now() - 3600000 * 1).toISOString() }
    ]
  }
];

let mockDeposits = [
  {
    id: "dep-1",
    reference: "NAP-8888-921",
    userId: "88888888",
    userName: "Thành viên Hendy",
    amount: 500000,
    status: "pending",
    adminNote: "",
    createdAt: new Date(Date.now() - 1800000).toISOString()
  },
  {
    id: "dep-2",
    reference: "NAP-8888-510",
    userId: "88888888",
    userName: "Thành viên Hendy",
    amount: 1000000,
    status: "approved",
    adminNote: "Đã nhận tiền tài khoản MBBank.",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  }
];

let mockLedger = [
  { id: "tx-1", type: "deposit", amount: 1000000, balanceAfter: 1000000, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: "tx-2", type: "order_payment", amount: -350000, balanceAfter: 650000, createdAt: new Date(Date.now() - 3600000 * 2).toISOString() },
  { id: "tx-3", type: "referral_commission", amount: 850000, balanceAfter: 1500000, createdAt: new Date(Date.now() - 3600000 * 1).toISOString() }
];

let mockTickets = [
  {
    id: "tic-1",
    ticket_number: "TK-2401",
    user_id: "88888888",
    customer_name: "Thành viên Hendy",
    subject: "Hướng dẫn cài đặt Tool trên VPS Ubuntu",
    status: "in_progress",
    last_message: "Admin đang kiểm tra thông số script cho bạn.",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    messages: [
      { id: "msg-1", sender_type: "user", message: "Chào CSKH, mình vừa thuê gói Tool 30 ngày, muốn xin hướng dẫn chạy trên Ubuntu 22.04.", created_at: new Date(Date.now() - 3600000 * 5).toISOString() },
      { id: "msg-2", sender_type: "admin", message: "Chào bạn! Bộ cài đặt đã có script auto-install curl. Bạn chỉ cần chạy: curl -sSL https://get.hendybot.local | bash", created_at: new Date(Date.now() - 3600000 * 3).toISOString() }
    ]
  }
];

let mockGiftcodes = [
  {
    id: "gift-uuid-1",
    code: "HENDY-WELCOME-2026",
    rewardVoucher: 200,
    maxRedemptions: 50,
    actualRedemptions: 12,
    expiresAt: null,
    isActive: true
  }
];

let mockReleases = [
  {
    id: "rel-1",
    platform: "Android",
    version: "2.1.0",
    file_name: "HendyBot_v2.1.0.apk",
    release_notes: "Bản cập nhật tối ưu hóa Telegram Mini App và hỗ trợ giao diện bóng bẩy.",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: "rel-2",
    platform: "Windows",
    version: "2.0.4",
    file_name: "HendyTool_Setup_v2.0.4.exe",
    release_notes: "Bản sửa lỗi kết nối WebSocket và cập nhật proxy xoay.",
    created_at: new Date(Date.now() - 86400000 * 10).toISOString()
  }
];

let mockCommissions = [
  {
    id: "comm-1",
    referrerId: "88888888",
    referrerName: "Thành viên Hendy",
    referredName: "Nguyễn Văn Tuấn",
    amount: 150000,
    status: "pending",
    adminNote: "",
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString()
  }
];

export function handleDevApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  const sendJson = (data, status = 200) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.end(JSON.stringify(data));
  };

  const getBody = () => {
    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try { resolve(body ? JSON.parse(body) : {}); }
        catch { resolve({}); }
      });
    });
  };

  // Health
  if (pathname === "/" || pathname === "/healthz" || pathname === "/api/v1/health") {
    return sendJson({ ok: true, service: "hendy-bot-dev-gateway", platform: "cloudflare-workers-local-d1", timestamp: new Date().toISOString() });
  }

  // Public config
  if (pathname === "/api/v1/public-config") {
    return sendJson({
      groupChatUrl: "https://t.me/hendy_community",
      newsChannelUrl: "https://t.me/hendy_news",
      supportUrl: "https://t.me/hendy_support",
      supportUsername: "hendy_support"
    });
  }

  // Releases
  if (pathname === "/api/v1/releases") {
    return sendJson({ releases: mockReleases });
  }

  // Home
  if (pathname === "/api/v1/home") {
    const pendingOrders = mockOrders.filter(o => o.status === "pending").length;
    return sendJson({
      user: {
        id: mockUser.id,
        name: mockUser.name,
        balance: mockUser.balance,
        voucher: mockUser.voucher,
        createdAt: mockUser.created_at
      },
      membership: {
        tier: "Vàng (Gold VIP)",
        code: "gold",
        points: 4850,
        status: "active"
      },
      orderSummary: {
        total: mockOrders.length,
        pending: pendingOrders,
        processing: mockOrders.filter(o => o.status === "processing").length,
        completed: mockOrders.filter(o => o.status === "completed").length
      },
      serverTime: new Date().toISOString()
    });
  }

  // Me
  if (pathname === "/api/v1/me") {
    return sendJson({ user: mockUser });
  }

  // Catalog
  if (pathname === "/api/v1/catalog") {
    const mod = url.searchParams.get("module") || "all";
    const items = mod === "all" ? mockCatalog.filter(c => c.is_active) : mockCatalog.filter(c => c.is_active && c.module === mod);
    return sendJson({ items });
  }

  // Wallet
  if (pathname === "/api/v1/wallet") {
    return sendJson({
      balance: mockUser.balance,
      voucher: mockUser.voucher,
      payment: {
        configured: true,
        bankName: "MBBank (Ngân hàng Quân Đội)",
        bankBin: "970422",
        accountNumber: "8888889999",
        accountName: "HENDY SYSTEM CO",
        instruction: "Chuyển khoản đúng mã tham chiếu. Hệ thống xác nhận và cộng tiền sau ít phút."
      },
      deposits: mockDeposits,
      transactions: mockLedger
    });
  }

  // Create deposit
  if (pathname === "/api/v1/deposits" && method === "POST") {
    return getBody().then((body) => {
      const amount = Number(body.amountVnd || 0);
      const ref = `NAP-${mockUser.id.slice(-4)}-${Math.floor(100 + Math.random() * 900)}`;
      const newDep = {
        id: `dep-${Date.now()}`,
        reference: ref,
        userId: mockUser.id,
        userName: mockUser.name,
        amount,
        status: "pending",
        adminNote: "",
        createdAt: new Date().toISOString()
      };
      mockDeposits.unshift(newDep);
      return sendJson({
        success: true,
        request: newDep,
        transfer: {
          amount,
          reference: ref,
          qrUrl: `https://api.vietqr.io/image/970422-8888889999-print.png?amount=${amount}&addInfo=${ref}`
        }
      }, 201);
    });
  }

  // Orders
  if (pathname === "/api/v1/orders") {
    if (method === "GET") {
      return sendJson({ orders: mockOrders });
    }
    if (method === "POST") {
      return getBody().then((body) => {
        const catalogItem = mockCatalog.find(c => c.id === body.catalogItemId);
        const amount = catalogItem && catalogItem.unit_price !== null ? catalogItem.unit_price * (body.quantity || 1) : 0;
        const newOrder = {
          id: `ord-${Date.now()}`,
          orderNumber: `HD-${Math.floor(100000 + Math.random() * 900000)}`,
          userId: mockUser.id,
          customerName: mockUser.name,
          module: body.module || "app_tool",
          title: body.title || "Yêu cầu dịch vụ",
          description: body.description || "",
          quantity: Number(body.quantity || 1),
          amount,
          status: "pending",
          paymentStatus: "unpaid",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          quote: null,
          events: [
            { id: `ev-${Date.now()}`, actor_type: "user", actor_label: "Khách hàng", to_status: "pending", note: "Khởi tạo đơn hàng từ Mini App", created_at: new Date().toISOString() }
          ]
        };
        mockOrders.unshift(newOrder);
        return sendJson({ order: newOrder }, 201);
      });
    }
  }

  // Order Pay
  const payMatch = pathname.match(/^\/api\/v1\/orders\/([^/]+)\/pay$/);
  if (payMatch && method === "POST") {
    const order = mockOrders.find(o => o.id === payMatch[1]);
    if (!order) return sendJson({ error: "Không tìm thấy đơn hàng." }, 404);
    if (mockUser.balance < order.amount) {
      return sendJson({ error: "Số dư ví không đủ. Vui lòng nạp thêm tiền." }, 400);
    }
    mockUser.balance -= order.amount;
    order.paymentStatus = "paid";
    order.status = "processing";
    order.events.push({
      id: `ev-${Date.now()}`,
      actor_type: "user",
      actor_label: "Khách hàng",
      from_status: "confirmed",
      to_status: "processing",
      note: `Thanh toán ${order.amount.toLocaleString()} VND qua ví`,
      created_at: new Date().toISOString()
    });
    mockLedger.unshift({
      id: `tx-${Date.now()}`,
      type: "order_payment",
      amount: -order.amount,
      balanceAfter: mockUser.balance,
      createdAt: new Date().toISOString()
    });
    return sendJson({ success: true, balance: mockUser.balance });
  }

  // Quote Respond
  const quoteRespMatch = pathname.match(/^\/api\/v1\/orders\/([^/]+)\/quotes\/([^/]+)\/respond$/);
  if (quoteRespMatch && method === "POST") {
    return getBody().then((body) => {
      const order = mockOrders.find(o => o.id === quoteRespMatch[1]);
      if (order && order.quote) {
        order.quote.status = body.decision;
        if (body.decision === "accepted") {
          order.status = "confirmed";
          order.amount = order.quote.amount;
        } else {
          order.status = "pending";
        }
      }
      return sendJson({ success: true, order });
    });
  }

  // Links
  if (pathname === "/api/v1/links") {
    if (method === "GET") return sendJson({ links: mockLinks });
    if (method === "POST") {
      return getBody().then((body) => {
        if (!mockLinks[body.brand]) mockLinks[body.brand] = [];
        mockLinks[body.brand].push({ tk: body.accountLabel });
        return sendJson({ links: mockLinks });
      });
    }
  }

  const deleteLinkMatch = pathname.match(/^\/api\/v1\/links\/([^/]+)\/(\d+)$/);
  if (deleteLinkMatch && method === "DELETE") {
    const brand = decodeURIComponent(deleteLinkMatch[1]);
    const idx = parseInt(deleteLinkMatch[2], 10);
    if (mockLinks[brand] && mockLinks[brand][idx]) {
      mockLinks[brand].splice(idx, 1);
    }
    return sendJson({ links: mockLinks });
  }

  // VIP
  if (pathname === "/api/v1/vip") {
    return sendJson({
      points: 4850,
      pointsPer10000Vnd: 10,
      currentTier: { code: "gold", name: "Hạng Vàng", minPoints: 4000, benefits: ["Giảm 10% phí thuê tool", "Ưu tiên hàng đợi ghép đôi"] },
      tiers: [
        { code: "basic", name: "Cơ bản", minPoints: 0, benefits: ["Truy cập danh mục chung"] },
        { code: "silver", name: "Hạng Bạc", minPoints: 2000, benefits: ["Giảm 5% đơn mua code"] },
        { code: "gold", name: "Hạng Vàng", minPoints: 4000, benefits: ["Giảm 10% phí thuê tool", "Ưu tiên hàng đợi ghép đôi"] },
        { code: "diamond", name: "Kim Cương", minPoints: 10000, benefits: ["Kênh CSKH riêng", "Kho VIP đặc quyền"] }
      ]
    });
  }

  // Referral
  if (pathname === "/api/v1/referral") {
    return sendJson({
      code: "REF88HENDY",
      invited: 7,
      inviteUrl: "https://t.me/HendyBot_Bot?start=ref_REF88HENDY",
      commissionNote: "Hoa hồng ghi nhận khi đơn giới thiệu hoàn tất.",
      commissionAvailable: true,
      commissionRateBps: 500,
      commissions: [
        { status: "approved", total: 3, amount: 850000 },
        { status: "pending", total: 1, amount: 150000 }
      ],
      referredBy: { id: "100001", name: "Quản trị viên Hendy" }
    });
  }

  if (pathname === "/api/v1/referral/claim" && method === "POST") {
    return sendJson({ success: true, message: "Đã ghi nhận mã giới thiệu." });
  }

  // Giftcodes
  if (pathname === "/api/v1/giftcodes/redeem" && method === "POST") {
    return getBody().then((body) => {
      const code = (body.code || "").toUpperCase();
      const found = mockGiftcodes.find(g => g.code === code && g.isActive);
      if (!found) return sendJson({ error: "Giftcode không tồn tại hoặc đã hết hạn." }, 400);
      mockUser.voucher += found.rewardVoucher;
      return sendJson({ success: true, rewardVoucher: found.rewardVoucher });
    });
  }

  // Support tickets
  if (pathname === "/api/v1/support/tickets") {
    if (method === "GET") return sendJson({ tickets: mockTickets });
    if (method === "POST") {
      return getBody().then((body) => {
        const newTicket = {
          id: `tic-${Date.now()}`,
          ticket_number: `TK-${Math.floor(2000 + Math.random() * 8000)}`,
          user_id: mockUser.id,
          customer_name: mockUser.name,
          subject: body.subject || "Hỗ trợ khách hàng",
          status: "open",
          last_message: body.message || "",
          created_at: new Date().toISOString(),
          messages: [
            { id: `msg-${Date.now()}`, sender_type: "user", message: body.message || "", created_at: new Date().toISOString() }
          ]
        };
        mockTickets.unshift(newTicket);
        return sendJson({ ticket: { ticket: newTicket } }, 201);
      });
    }
  }

  const ticketMatch = pathname.match(/^\/api\/v1\/support\/tickets\/([^/]+)$/);
  if (ticketMatch && method === "GET") {
    const t = mockTickets.find(item => item.id === ticketMatch[1]);
    if (!t) return sendJson({ error: "Không tìm thấy ticket." }, 404);
    return sendJson({ ticket: t, messages: t.messages });
  }

  const ticketMsgMatch = pathname.match(/^\/api\/v1\/support\/tickets\/([^/]+)\/messages$/);
  if (ticketMsgMatch && method === "POST") {
    return getBody().then((body) => {
      const t = mockTickets.find(item => item.id === ticketMsgMatch[1]);
      if (!t) return sendJson({ error: "Không tìm thấy ticket." }, 404);
      const newMsg = {
        id: `msg-${Date.now()}`,
        sender_type: "user",
        message: body.message,
        created_at: new Date().toISOString()
      };
      t.messages.push(newMsg);
      t.last_message = body.message;
      return sendJson({ ticket: t, messages: t.messages });
    });
  }

  // === ADMIN ROUTES ===
  if (pathname === "/api/v1/admin/stats") {
    const pending = mockOrders.filter(o => o.status === "pending").length;
    const confirmed = mockOrders.filter(o => o.status === "confirmed").length;
    const processing = mockOrders.filter(o => o.status === "processing").length;
    const completed = mockOrders.filter(o => o.status === "completed").length;
    const cancelled = mockOrders.filter(o => o.status === "cancelled").length;
    return sendJson({
      stats: {
        users: 148,
        releases: mockReleases.length,
        orderStats: {
          total: mockOrders.length,
          pending,
          confirmed,
          processing,
          completed,
          cancelled
        }
      }
    });
  }

  if (pathname === "/api/v1/admin/orders") {
    const status = url.searchParams.get("status") || "all";
    const mod = url.searchParams.get("module") || "all";
    const q = (url.searchParams.get("q") || "").toLowerCase();
    let filtered = [...mockOrders];
    if (status !== "all") filtered = filtered.filter(o => o.status === status);
    if (mod !== "all") filtered = filtered.filter(o => o.module === mod);
    if (q) filtered = filtered.filter(o => o.orderNumber.toLowerCase().includes(q) || o.title.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q));

    const pending = mockOrders.filter(o => o.status === "pending").length;
    return sendJson({
      orders: filtered,
      total: filtered.length,
      stats: {
        total: mockOrders.length,
        pending,
        confirmed: mockOrders.filter(o => o.status === "confirmed").length,
        processing: mockOrders.filter(o => o.status === "processing").length,
        completed: mockOrders.filter(o => o.status === "completed").length,
        cancelled: mockOrders.filter(o => o.status === "cancelled").length
      }
    });
  }

  const adminOrderMatch = pathname.match(/^\/api\/v1\/admin\/orders\/([^/]+)$/);
  if (adminOrderMatch && method === "GET") {
    const order = mockOrders.find(o => o.id === adminOrderMatch[1]);
    if (!order) return sendJson({ error: "Không tìm thấy đơn." }, 404);
    return sendJson({ order, events: order.events });
  }

  const adminOrderStatus = pathname.match(/^\/api\/v1\/admin\/orders\/([^/]+)\/status$/);
  if (adminOrderStatus && method === "POST") {
    return getBody().then((body) => {
      const order = mockOrders.find(o => o.id === adminOrderStatus[1]);
      if (!order) return sendJson({ error: "Không tìm thấy đơn." }, 404);
      order.status = body.status;
      order.events.push({
        id: `ev-${Date.now()}`,
        actor_type: "admin",
        actor_label: "Admin",
        from_status: body.expectedStatus,
        to_status: body.status,
        note: body.note || "",
        created_at: new Date().toISOString()
      });
      return sendJson({ order, events: order.events });
    });
  }

  const adminOrderQuote = pathname.match(/^\/api\/v1\/admin\/orders\/([^/]+)\/quote$/);
  if (adminOrderQuote && method === "POST") {
    return getBody().then((body) => {
      const order = mockOrders.find(o => o.id === adminOrderQuote[1]);
      if (!order) return sendJson({ error: "Không tìm thấy đơn." }, 404);
      order.quote = {
        id: `quote-${Date.now()}`,
        amount: Number(body.amount),
        note: body.note || "",
        status: "sent"
      };
      order.events.push({
        id: `ev-${Date.now()}`,
        actor_type: "admin",
        actor_label: "Admin",
        to_status: order.status,
        note: `Gửi báo giá: ${Number(body.amount).toLocaleString()} VND`,
        created_at: new Date().toISOString()
      });
      return sendJson({ order, events: order.events });
    });
  }

  if (pathname === "/api/v1/admin/deposits") {
    const status = url.searchParams.get("status") || "pending";
    const list = status === "all" ? mockDeposits : mockDeposits.filter(d => d.status === status);
    return sendJson({ deposits: list });
  }

  const reviewDepMatch = pathname.match(/^\/api\/v1\/admin\/deposits\/([^/]+)\/review$/);
  if (reviewDepMatch && method === "POST") {
    return getBody().then((body) => {
      const dep = mockDeposits.find(d => d.id === reviewDepMatch[1]);
      if (!dep) return sendJson({ error: "Không tìm thấy yêu cầu nạp." }, 404);
      dep.status = body.status;
      dep.adminNote = body.note || (body.status === "approved" ? "Admin đã duyệt" : "Admin từ chối");
      if (body.status === "approved") {
        mockUser.balance += dep.amount;
        mockLedger.unshift({
          id: `tx-${Date.now()}`,
          type: "deposit",
          amount: dep.amount,
          balanceAfter: mockUser.balance,
          createdAt: new Date().toISOString()
        });
      }
      return sendJson({ success: true, deposit: dep });
    });
  }

  if (pathname === "/api/v1/admin/catalog") {
    if (method === "GET") return sendJson({ items: mockCatalog });
    if (method === "POST") {
      return getBody().then((body) => {
        const newItem = {
          id: `cat-${Date.now()}`,
          module: body.module,
          slug: body.slug,
          title: body.title,
          description: body.description,
          unit_price: body.unitPrice !== undefined ? body.unitPrice : null,
          duration_days: body.durationDays !== undefined ? body.durationDays : null,
          stock: body.stock !== undefined ? body.stock : null,
          sort_order: Number(body.sortOrder || 100),
          is_active: 1
        };
        mockCatalog.push(newItem);
        return sendJson({ item: newItem }, 201);
      });
    }
  }

  const catItemMatch = pathname.match(/^\/api\/v1\/admin\/catalog\/([^/]+)$/);
  if (catItemMatch && method === "PUT") {
    return getBody().then((body) => {
      const item = mockCatalog.find(c => c.id === catItemMatch[1]);
      if (!item) return sendJson({ error: "Không tìm thấy sản phẩm." }, 404);
      Object.assign(item, {
        module: body.module,
        slug: body.slug,
        title: body.title,
        description: body.description,
        unit_price: body.unitPrice !== undefined ? body.unitPrice : item.unit_price,
        duration_days: body.durationDays !== undefined ? body.durationDays : item.duration_days,
        stock: body.stock !== undefined ? body.stock : item.stock,
        sort_order: Number(body.sortOrder || item.sort_order)
      });
      return sendJson({ item });
    });
  }

  const catStatusMatch = pathname.match(/^\/api\/v1\/admin\/catalog\/([^/]+)\/(activate|deactivate)$/);
  if (catStatusMatch && method === "POST") {
    const item = mockCatalog.find(c => c.id === catStatusMatch[1]);
    if (item) item.is_active = catStatusMatch[2] === "activate" ? 1 : 0;
    return sendJson({ success: true });
  }

  if (pathname === "/api/v1/admin/giftcodes") {
    if (method === "GET") return sendJson({ giftcodes: mockGiftcodes });
    if (method === "POST") {
      return getBody().then((body) => {
        const generated = `HENDY-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const newCode = {
          id: `gift-${Date.now()}`,
          code: generated,
          rewardVoucher: Number(body.rewardVoucher || 100),
          maxRedemptions: Number(body.maxRedemptions || 1),
          actualRedemptions: 0,
          expiresAt: body.expiresAt || null,
          isActive: true
        };
        mockGiftcodes.unshift(newCode);
        return sendJson(newCode, 201);
      });
    }
  }

  const giftStatusMatch = pathname.match(/^\/api\/v1\/admin\/giftcodes\/([^/]+)\/(activate|deactivate)$/);
  if (giftStatusMatch && method === "POST") {
    const code = mockGiftcodes.find(g => g.id === giftStatusMatch[1]);
    if (code) code.isActive = giftStatusMatch[2] === "activate";
    return sendJson({ success: true });
  }

  if (pathname === "/api/v1/admin/support/tickets") {
    return sendJson({ tickets: mockTickets });
  }

  const adminTicketDetail = pathname.match(/^\/api\/v1\/admin\/support\/tickets\/([^/]+)$/);
  if (adminTicketDetail && method === "GET") {
    const t = mockTickets.find(item => item.id === adminTicketDetail[1]);
    if (!t) return sendJson({ error: "Không tìm thấy ticket." }, 404);
    return sendJson({ ticket: t, messages: t.messages });
  }

  const adminTicketMsg = pathname.match(/^\/api\/v1\/admin\/support\/tickets\/([^/]+)\/messages$/);
  if (adminTicketMsg && method === "POST") {
    return getBody().then((body) => {
      const t = mockTickets.find(item => item.id === adminTicketMsg[1]);
      if (!t) return sendJson({ error: "Không tìm thấy ticket." }, 404);
      const newMsg = {
        id: `msg-${Date.now()}`,
        sender_type: "admin",
        message: body.message,
        created_at: new Date().toISOString()
      };
      t.messages.push(newMsg);
      t.last_message = body.message;
      return sendJson({ ticket: t, messages: t.messages });
    });
  }

  const adminTicketStatus = pathname.match(/^\/api\/v1\/admin\/support\/tickets\/([^/]+)\/status$/);
  if (adminTicketStatus && method === "POST") {
    return getBody().then((body) => {
      const t = mockTickets.find(item => item.id === adminTicketStatus[1]);
      if (t) t.status = body.status;
      return sendJson({ success: true, status: body.status });
    });
  }

  if (pathname === "/api/v1/admin/referrals/commissions") {
    return sendJson({ commissions: mockCommissions });
  }

  const settleComm = pathname.match(/^\/api\/v1\/admin\/referrals\/commissions\/([^/]+)\/settle$/);
  if (settleComm && method === "POST") {
    return getBody().then((body) => {
      const comm = mockCommissions.find(c => c.id === settleComm[1]);
      if (comm) {
        comm.status = body.action === "pay" ? "paid" : body.action === "approve" ? "approved" : "voided";
        comm.adminNote = body.note || "";
      }
      return sendJson({ success: true, commission: comm });
    });
  }

  if (pathname === "/api/v1/admin/webhook/setup" && method === "POST") {
    return sendJson({ success: true, message: "Đã đăng ký webhook Telegram thành công trên Worker." });
  }

  return sendJson({ error: "Endpoint not found on dev gateway: " + pathname }, 404);
}
