import React, { useState, useEffect, useRef } from "react";

const INITIAL_BOT_MESSAGE = {
  id: "msg-0",
  sender: "bot",
  time: "09:41",
  text: `🤖 HENDY BOT TELEGRAM (Render × Cloudflare Edition)
Xin chào Thành viên Hendy!
🆔 Telegram ID: 88888888
💰 Số dư ví (Cloudflare D1): 1.500.000 VNĐ
⚡ Động cơ Bot: Render Worker (Long Polling)
☁️ Dữ liệu & Lưu trữ: Cloudflare D1 + R2 + Pages
━━━━━━━━━━━━━━━━━━
Chọn chức năng dịch vụ từ menu bên dưới.
🛡️ Bạn có quyền quản trị. Dùng /admin để mở bảng điều khiển.`,
  hasButtons: true
};

export default function BotSimulator({ onOpenMiniApp, onOpenAdmin }) {
  const [messages, setMessages] = useState([INITIAL_BOT_MESSAGE]);
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState("polling"); // "polling" or "webhook"
  const [logs, setLogs] = useState([
    { id: "log-1", time: "09:40:55", type: "info", text: "Render Bot Service initialized on Singapore node." },
    { id: "log-2", time: "09:41:00", type: "success", text: "Connected to Cloudflare D1 Database (hendy_bot_db)." },
    { id: "log-3", time: "09:41:02", type: "success", text: "Long Polling active (getUpdates offset=10492, timeout=30s)." }
  ]);
  const [pollingCount, setPollingCount] = useState(148);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Simulate periodic polling ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setPollingCount(prev => prev + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const addLog = (text, type = "info") => {
    const time = new Date().toLocaleTimeString("vi-VN");
    setLogs(prev => [...prev.slice(-30), { id: `log-${Date.now()}-${Math.random()}`, time, type, text }]);
  };

  const handleSend = (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: "user",
      time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      text
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    addLog(`Received message from user 88888888: "${text}"`, "info");

    const cmd = text.toLowerCase().split(/\s+/)[0];

    setTimeout(() => {
      let botResponse = "";
      let hasButtons = false;

      if (cmd === "/start") {
        addLog("Executing /start: querying user from Cloudflare D1...", "success");
        botResponse = `🤖 HENDY BOT TELEGRAM (Render × Cloudflare Edition)
Xin chào Thành viên Hendy!
🆔 Telegram ID: 88888888
💰 Số dư ví (Cloudflare D1): 1.500.000 VNĐ
⚡ Động cơ Bot: Render (${mode.toUpperCase()})
☁️ Dữ liệu & Lưu trữ: Cloudflare D1 + R2 + Pages
━━━━━━━━━━━━━━━━━━
Chọn chức năng bạn cần bên dưới:`;
        hasButtons = true;
      } else if (cmd === "/admin") {
        addLog("Executing /admin: verified Telegram ID in ADMIN_IDS whitelist.", "success");
        botResponse = `🛡️ TRUNG TÂM QUẢN TRỊ HENDY
Quyền quản trị đã được xác minh. Bấm nút bên dưới để mở Bảng điều khiển Quản trị trên Cloudflare Pages.`;
      } else if (cmd === "/help") {
        botResponse = `📖 HƯỚNG DẪN SỬ DỤNG HENDY BOT
• /start - Mở menu 14 chức năng chính
• /admin - Mở Bảng quản trị Cloudflare Pages
• /id - Xem Telegram ID của bạn
• /wallet - Xem số dư ví và nạp tiền
Mọi giao dịch thanh toán được bảo vệ bởi Cloudflare D1 Ledger.`;
      } else if (cmd === "/id") {
        botResponse = `🆔 Telegram ID của bạn: 88888888\nTên: Thành viên Hendy`;
      } else if (cmd === "/wallet") {
        botResponse = `💳 VÍ ĐIỆN TỬ HENDY (Cloudflare D1)\nSố dư khả dụng: 1.500.000 VNĐ\nĐiểm thưởng voucher: 250 điểm\nNgân hàng nạp: MBBank · STK: 8888889999\n\nBạn có thể mở Mini App để nạp hoặc quản lý sổ cái.`;
      } else {
        botResponse = `Lệnh không nhận dạng được: "${text}". Nhập /start để mở menu chính hoặc /help để xem hướng dẫn.`;
      }

      setMessages(prev => [...prev, {
        id: `bot-${Date.now()}`,
        sender: "bot",
        time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        text: botResponse,
        hasButtons,
        isAdminButton: cmd === "/admin"
      }]);
    }, 450);
  };

  const handleButtonClick = (btn) => {
    addLog(`User clicked button: [${btn.title}] -> Loading Cloudflare Pages Mini App (${btn.module})`, "success");
    if (btn.action === "admin") {
      onOpenAdmin();
    } else {
      onOpenMiniApp(btn.module);
    }
  };

  const KEYBOARD_ROWS = [
    [
      { title: "🚀 MINIGAME LIVE", module: "mini_game_live", tone: "danger" },
      { title: "🧰 THUÊ TOOL (NEW)", module: "app_tool", tone: "primary" }
    ],
    [
      { title: "🛍️ MUA LÌ XÌ · CODE MÀN · CODE TELE", module: "buy_code", tone: "success" }
    ],
    [
      { title: "💳 NẠP TIỀN", module: "wallet", tone: "danger" },
      { title: "🛡️ OTP & PROXY", module: "otp_proxy", tone: "primary" }
    ],
    [
      { title: "🏆 KHO VIP · CÔNG CỤ ĐẶC QUYỀN", module: "vip_tools", tone: "success" }
    ],
    [
      { title: "💎 TRUNG TÂM KHÁCH HÀNG", module: "support", tone: "primary" }
    ],
    [
      { title: "💞 HỆ THỐNG GHÉP ĐÔI", module: "pairing", tone: "danger" }
    ],
    [
      { title: "🤝 GIỚI THIỆU REF", module: "referral", tone: "success" },
      { title: "👑 TRUNG TÂM VIP", module: "vip", tone: "success" }
    ],
    [
      { title: "👥 NHÓM CHAT", module: "group_chat", tone: "neutral" },
      { title: "📢 KÊNH THÔNG BÁO", module: "news_channel", tone: "neutral" }
    ],
    [
      { title: "🎟️ NHẬP GIFTCODE", module: "giftcode", tone: "danger" },
      { title: "🎧 LIÊN HỆ CSKH", module: "contact_support", tone: "success" }
    ]
  ];

  return (
    <div className="bot-sim-container">
      {/* Control bar */}
      <div className="sim-control-bar">
        <div className="sim-status-chip">
          <span className="pulse-dot"></span>
          <span>Render Service: <strong>Online</strong></span>
        </div>

        <div className="sim-mode-toggle">
          <span style={{ fontSize: 11, color: "#8da3be" }}>Chế độ hoạt động Render:</span>
          <button
            type="button"
            className={`mode-btn ${mode === "polling" ? "active" : ""}`}
            onClick={() => {
              setMode("polling");
              addLog("Switched Render Bot engine to Long Polling (getUpdates daemon).", "info");
            }}
          >
            🔄 Long Polling
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === "webhook" ? "active" : ""}`}
            onClick={() => {
              setMode("webhook");
              addLog("Switched Render Bot engine to Webhook Server mode (/telegram/webhook).", "info");
            }}
          >
            ⚡ Webhook Server
          </button>
        </div>

        <div className="sim-metrics">
          <span>Polling Cycles: <strong>{pollingCount}</strong></span>
          <span>D1 Ping: <strong>14ms</strong></span>
        </div>
      </div>

      <div className="sim-layout">
        {/* Telegram Chat Simulation */}
        <div className="telegram-chat-card">
          <div className="chat-header">
            <div className="chat-bot-avatar">H</div>
            <div className="chat-bot-info">
              <strong>Hendy Bot (Cloudflare + Render)</strong>
              <span>bot · 24/7 continuous worker</span>
            </div>
            <div className="chat-header-actions">
              <span className="telegram-badge">Telegram Desktop</span>
            </div>
          </div>

          <div className="chat-messages-area">
            {messages.map(msg => (
              <div key={msg.id} className={`chat-bubble-wrap ${msg.sender}`}>
                <div className={`chat-bubble ${msg.sender}`}>
                  <div className="bubble-text">{msg.text}</div>
                  <span className="bubble-time">{msg.time}</span>
                </div>

                {msg.isAdminButton && (
                  <div className="inline-keyboard-panel" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="sim-keyboard-btn"
                      style={{ background: "#1b3a43", borderColor: "#73e1cb" }}
                      onClick={() => onOpenAdmin()}
                    >
                      🔐 MỞ BẢNG QUẢN TRỊ (CLOUDFLARE PAGES) ↗
                    </button>
                  </div>
                )}

                {msg.hasButtons && (
                  <div className="inline-keyboard-panel">
                    <div className="keyboard-caption">Bàn phím Inline Telegram (Mở Cloudflare Pages Mini App):</div>
                    {KEYBOARD_ROWS.map((row, rIdx) => (
                      <div key={rIdx} className="keyboard-row">
                        {row.map(btn => (
                          <button
                            key={btn.title}
                            type="button"
                            className={`sim-keyboard-btn btn-tone-${btn.tone}`}
                            onClick={() => handleButtonClick(btn)}
                          >
                            {btn.title}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-bar" onSubmit={handleSend}>
            <div className="quick-command-chips">
              <button type="button" onClick={() => { setInputText("/start"); }}>/start</button>
              <button type="button" onClick={() => { setInputText("/wallet"); }}>/wallet</button>
              <button type="button" onClick={() => { setInputText("/admin"); }}>/admin</button>
              <button type="button" onClick={() => { setInputText("/help"); }}>/help</button>
              <button type="button" onClick={() => { setInputText("/id"); }}>/id</button>
            </div>
            <div className="input-group">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Nhắn tin hoặc gửi lệnh bot (VD: /start, /wallet, /admin)..."
              />
              <button type="submit" disabled={!inputText.trim()}>Gửi ➔</button>
            </div>
          </form>
        </div>

        {/* Live Event Stream / Worker Logs */}
        <div className="sim-logs-card">
          <div className="logs-header">
            <h3>🖥️ Render Worker Real-Time Logs</h3>
            <span className="logs-count">{logs.length} sự kiện</span>
          </div>
          <div className="logs-scroll-area">
            {logs.map(log => (
              <div key={log.id} className={`log-line log-${log.type}`}>
                <span className="log-time">[{log.time}]</span>
                <span className="log-text">{log.text}</span>
              </div>
            ))}
          </div>
          <div className="logs-footer">
            <span style={{ fontSize: 10, color: "#6e839e" }}>
              💡 Render tự động xử lý Long Polling và đồng bộ trực tiếp với Cloudflare D1.
            </span>
            <button
              type="button"
              className="text-button"
              style={{ fontSize: 10, color: "#74e5d0", textDecoration: "underline" }}
              onClick={() => setLogs([
                { id: `log-${Date.now()}`, time: new Date().toLocaleTimeString("vi-VN"), type: "info", text: "Logs cleared." }
              ])}
            >
              Xóa log
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
