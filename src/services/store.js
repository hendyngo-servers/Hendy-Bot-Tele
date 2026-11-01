// In-browser reactive store simulating Cloudflare D1, R2, and Worker backend
// Persists in localStorage for a continuous, robust preview experience.

const STORAGE_KEY = "hendy_bot_db_v2";

const DEFAULT_STATE = {
  users: {
    "6882049102": {
      id: "6882049102",
      name: "Hendy Member",
      balance: 500000,
      voucher: 1500,
      vip_tier: "basic",
      vip_points: 350,
      referral_code: "HENDY88",
      referred_by: null,
      linked_accounts: {
        "QQ88": [{ tk: "hendy_vip_01", miniCode: "QQ-9912" }],
        "78WIN": [{ tk: "hendy_win78", miniCode: "78-4421" }]
      },
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
    }
  },
  currentUserId: "6882049102",
  adminToken: "admin123",
  publicConfig: {
    groupChatUrl: "https://t.me/hendy_community",
    newsChannelUrl: "https://t.me/hendy_news",
    supportUrl: "https://t.me/hendy_support",
    supportUsername: "hendy_support",
    bankName: "MB Bank (Ngân hàng Quân đội)",
    bankBin: "970422",
    accountNumber: "108873919102",
    accountName: "NGUYEN HENDY",
    instruction: "Chuyển khoản chính xác số tiền và nội dung tham chiếu để hệ thống tự động nhận diện."
  },
  catalogItems: [
    {
      id: "cat-1",
      module: "app_tool",
      slug: "tool-auto-predict-7d",
      title: "Tool Auto Predict 7 Ngày",
      description: "Hỗ trợ phân tích tín hiệu thời gian thực cho mini game live.",
      unit_price: 120000,
      currency: "VND",
      duration_days: 7,
      stock: 45,
      is_active: 1,
      sort_order: 10
    },
    {
      id: "cat-2",
      module: "app_tool",
      slug: "tool-pro-vip-30d",
      title: "Tool Pro VIP Full Sảnh 30 Ngày",
      description: "Gói công cụ cao cấp đa sảnh: QQ88, 78WIN, SC88.",
      unit_price: 350000,
      currency: "VND",
      duration_days: 30,
      stock: 20,
      is_active: 1,
      sort_order: 20
    },
    {
      id: "cat-3",
      module: "buy_code",
      slug: "code-tele-auto-bot",
      title: "Source Code Bot Telegram Tự Động",
      description: "Mã nguồn bot Telegram quản lý tự động, webhook Cloudflare.",
      unit_price: 150000,
      currency: "VND",
      duration_days: null,
      stock: 99,
      is_active: 1,
      sort_order: 10
    },
    {
      id: "cat-4",
      module: "buy_code",
      slug: "code-man-hinh-live",
      title: "Code Hiển Thị Màn Hình Live Stream",
      description: "Mã overlay hiển thị kết quả live đẹp mắt chuẩn OBS.",
      unit_price: 90000,
      currency: "VND",
      duration_days: null,
      stock: 50,
      is_active: 1,
      sort_order: 20
    },
    {
      id: "cat-5",
      module: "otp_proxy",
      slug: "proxy-ipv4-vietnam-30d",
      title: "Proxy SOCKS5 / HTTP IPv4 VN 30 Ngày",
      description: "Proxy dân cư Việt Nam tốc độ cao, băng thông không giới hạn.",
      unit_price: 80000,
      currency: "VND",
      duration_days: 30,
      stock: 100,
      is_active: 1,
      sort_order: 10
    },
    {
      id: "cat-6",
      module: "vip",
      slug: "vip-hub-unlimited-access",
      title: "VIP Hub - Toàn Quyền Dịch Vụ Hendy",
      description: "Đặc quyền sử dụng tất cả tool và ưu tiên hỗ trợ 24/7.",
      unit_price: 600000,
      currency: "VND",
      duration_days: 60,
      stock: 10,
      is_active: 1,
      sort_order: 10
    }
  ],
  orders: [
    {
      id: "ord-1",
      orderNumber: "HD-89214",
      userId: "6882049102",
      customerName: "Hendy Member",
      module: "mini_game_live",
      title: "Yêu cầu kết nối tài khoản QQ88",
      description: "Cần hỗ trợ đồng bộ dữ liệu phiên live chiều nay.",
      quantity: 1,
      amount: 150000,
      currency: "VND",
      status: "confirmed",
      paymentStatus: "unpaid",
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      quote: {
        id: "quote-1",
        orderId: "ord-1",
        revision: 1,
        amount: 150000,
        note: "Chi phí hỗ trợ kỹ thuật cài đặt trong 24h.",
        status: "accepted"
      }
    },
    {
      id: "ord-2",
      orderNumber: "HD-89215",
      userId: "6882049102",
      customerName: "Hendy Member",
      module: "app_tool",
      title: "Tool Auto Predict 7 Ngày",
      description: "Kích hoạt bản quyền cho máy Windows.",
      quantity: 1,
      amount: 120000,
      currency: "VND",
      status: "pending",
      paymentStatus: "unpaid",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      quote: null
    }
  ],
  orderEvents: [
    {
      id: "ev-1",
      order_id: "ord-1",
      actor_type: "user",
      actor_label: "Khách hàng",
      from_status: null,
      to_status: "pending",
      note: "Tạo đơn hàng mới",
      created_at: new Date(Date.now() - 3600000 * 5).toISOString()
    },
    {
      id: "ev-2",
      order_id: "ord-1",
      actor_type: "admin",
      actor_label: "Admin / CSKH",
      from_status: "pending",
      to_status: "confirmed",
      note: "Đã gửi báo giá 150.000 ₫ và khách hàng chấp nhận",
      created_at: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      id: "ev-3",
      order_id: "ord-2",
      actor_type: "user",
      actor_label: "Khách hàng",
      from_status: null,
      to_status: "pending",
      note: "Tạo đơn hàng mới",
      created_at: new Date(Date.now() - 3600000).toISOString()
    }
  ],
  walletTransactions: [
    {
      id: "tx-init",
      user_id: "6882049102",
      order_id: null,
      provider: "manual_bank",
      provider_reference: "NAP-INIT",
      amount: 500000,
      currency: "VND",
      status: "paid",
      createdAt: new Date(Date.now() - 86400000).toISOString()
    }
  ],
  walletLedger: [
    {
      id: "led-1",
      user_id: "6882049102",
      source_type: "deposit",
      source_id: "dep-init",
      amount: 500000,
      balanceAfter: 500000,
      type: "deposit",
      createdAt: new Date(Date.now() - 86400000).toISOString()
    }
  ],
  depositRequests: [
    {
      id: "dep-1",
      reference: "NAP489102",
      userId: "6882049102",
      userName: "Hendy Member",
      amount: 200000,
      status: "pending",
      adminNote: "",
      reviewedBy: null,
      createdAt: new Date(Date.now() - 1800000).toISOString()
    }
  ],
  giftcodes: [
    {
      id: "gc-1",
      code: "HENDY-WELCOME-50K",
      rewardVoucher: 50000,
      maxRedemptions: 100,
      actualRedemptions: 12,
      redeemedCount: 12,
      expiresAt: null,
      isActive: true,
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      redeemedBy: []
    },
    {
      id: "gc-2",
      code: "VIP-MEMBER-100K",
      rewardVoucher: 100000,
      maxRedemptions: 50,
      actualRedemptions: 5,
      redeemedCount: 5,
      expiresAt: null,
      isActive: true,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      redeemedBy: []
    }
  ],
  supportTickets: [
    {
      ticket: {
        id: "tick-1",
        ticket_number: "TICK-9012",
        user_id: "6882049102",
        customer_name: "Hendy Member",
        category: "general",
        subject: "Hỏi về cách cài đặt Tool trên điện thoại Android",
        status: "in_progress",
        created_at: new Date(Date.now() - 7200000).toISOString(),
        updated_at: new Date(Date.now() - 1200000).toISOString(),
        last_message: "CSKH Hendy: Bạn tải file APK trong mục Bản phát hành nhé!"
      },
      messages: [
        {
          id: "msg-1",
          ticket_id: "tick-1",
          sender_type: "user",
          sender_id: "6882049102",
          message: "Chào admin, mình mới đăng ký dịch vụ, cho mình xin file apk cài trên android nhé.",
          created_at: new Date(Date.now() - 7200000).toISOString()
        },
        {
          id: "msg-2",
          ticket_id: "tick-1",
          sender_type: "admin",
          sender_id: "api-admin",
          message: "Chào bạn, bạn có thể vào tab Trang chủ -> mục Ứng dụng & công cụ phát hành để tải bản APK mới nhất v2.0.0 nhé!",
          created_at: new Date(Date.now() - 1200000).toISOString()
        }
      ]
    }
  ],
  referralCommissions: [
    {
      id: "ref-1",
      referrerUserId: "6882049102",
      referrerName: "Hendy Member",
      referredUserId: "991827411",
      referredName: "Minh Quân",
      orderNumber: "HD-88102",
      amount: 35000,
      status: "pending",
      adminNote: "Đơn hàng đã hoàn tất",
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
    }
  ],
  appReleases: [
    {
      id: "rel-1",
      platform: "Android",
      version: "2.0.0",
      file_name: "HendyBot_v2.0.0.apk",
      file_size: 14500000,
      release_notes: "Bản cập nhật giao diện mới, tối ưu hóa kết nối Telegram Mini App.",
      released_at: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: "rel-2",
      platform: "Windows",
      version: "1.9.4",
      file_name: "HendyClient_x64.exe",
      file_size: 48900000,
      release_notes: "Bản chạy trực tiếp trên PC không cần cài đặt môi trường phụ.",
      released_at: new Date(Date.now() - 86400000 * 7).toISOString()
    }
  ],
  vipTiers: [
    { code: "basic", name: "Cơ bản", minPoints: 0, benefits: ["Quản lý tài khoản và đơn hàng"] },
    { code: "silver", name: "Bạc", minPoints: 1000, benefits: ["Ưu tiên hỗ trợ kỹ thuật", "Giảm 3% thuê tool"] },
    { code: "gold", name: "Vàng", minPoints: 5000, benefits: ["Ưu tiên xử lý yêu cầu", "Ưu đãi theo chương trình 8%", "Kênh VIP riêng"] },
    { code: "platinum", name: "Kim cương", minPoints: 15000, benefits: ["Hỗ trợ ưu tiên cao 24/7", "Đặc quyền toàn bộ kho tool", "Quản lý tài khoản riêng"] }
  ]
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Storage save failed", err);
  }
}

export function resetState() {
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState();
  return state;
}

export function getState() {
  return state;
}

export function updateState(mutator) {
  mutator(state);
  saveState();
  return state;
}
