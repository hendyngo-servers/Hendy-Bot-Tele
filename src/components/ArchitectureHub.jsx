import React, { useState } from "react";

export default function ArchitectureHub({ onOpenUserApp, onOpenAdminApp, onOpenBotSim }) {
  const [copied, setCopied] = useState(false);

  const RENDER_YAML = `services:
  - type: web
    name: hendy-telegram-bot
    runtime: node
    plan: free
    region: singapore
    buildCommand: npm install
    startCommand: node services/render-bot/index.js
    healthCheckPath: /healthz
    envVars:
      - key: BOT_MODE
        value: polling # 'polling' for continuous daemon or 'webhook' for high-throughput server
      - key: BOT_TOKEN
        sync: false
      - key: WEBHOOK_SECRET_TOKEN
        generateValue: true
      - key: ADMIN_IDS
        sync: false
      - key: CLOUDFLARE_API_BASE_URL
        value: https://hendy-bot-backend.workers.dev
      - key: CLOUDFLARE_D1_DATABASE_ID
        sync: false
      - key: CLOUDFLARE_R2_BUCKET
        value: hendy-bot-assets
      - key: WEBAPP_URL
        value: https://hendy-web-user.pages.dev
      - key: ADMIN_WEBAPP_URL
        value: https://hendy-web-admin.pages.dev`;

  const copyYaml = () => {
    navigator.clipboard?.writeText(RENDER_YAML).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="system-hub">
      {/* Hero Banner */}
      <div className="hub-hero">
        <span className="eyebrow" style={{ color: "#68e5d0", fontSize: "10px", fontWeight: "900", letterSpacing: "2px" }}>
          HYBRID CLOUD ARCHITECTURE
        </span>
        <h1>Render Bot × Cloudflare Ecosystem</h1>
        <p>
          Kiến trúc kết hợp tối ưu: <strong>Render</strong> chịu trách nhiệm chạy logic Bot liên tục 24/7 (Long Polling hoặc xử lý Webhook nặng),
          trong khi <strong>Cloudflare</strong> đảm nhiệm cơ sở dữ liệu D1 siêu tốc, lưu trữ tệp R2 và lưu trữ hai giao diện ứng dụng
          trên Cloudflare Pages (Mini App cho thành viên và Bảng quản trị Admin).
        </p>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="download-link"
            style={{ border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={onOpenBotSim}
          >
            🤖 Mở Giả Lập Telegram Bot
          </button>
          <button
            type="button"
            className="download-link"
            style={{ background: "#203a4c", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={onOpenUserApp}
          >
            📱 Xem Mini App (Pages)
          </button>
          <button
            type="button"
            className="download-link"
            style={{ background: "#2e2b48", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={onOpenAdminApp}
          >
            💻 Mở Bảng Quản Trị (Admin)
          </button>
        </div>
      </div>

      {/* Visual Flow Diagram */}
      <div className="arch-flow-card">
        <h3>📐 Sơ Đồ Luồng Dữ Liệu Thực Tế</h3>
        <div className="flow-grid">
          <div className="flow-node node-render">
            <div className="node-icon">🚀</div>
            <div className="node-title">RENDER CLOUD</div>
            <div className="node-desc">Bot Logic & Processing</div>
            <ul className="node-bullets">
              <li>Long Polling Daemon (getUpdates)</li>
              <li>Webhook Server & Worker Threads</li>
              <li>Background Jobs & Schedulers</li>
            </ul>
          </div>

          <div className="flow-arrow">
            <span className="arrow-line">➔</span>
            <small>Query & Ledger</small>
          </div>

          <div className="flow-node node-cloudflare">
            <div className="node-icon">⚡</div>
            <div className="node-title">CLOUDFLARE D1 + R2</div>
            <div className="node-desc">Distributed Data & Storage</div>
            <ul className="node-bullets">
              <li>17 bảng D1: User, Wallet, Orders</li>
              <li>Sổ cái giao dịch Idempotent</li>
              <li>R2 Bucket: Tệp phát hành APK/Tool</li>
            </ul>
          </div>

          <div className="flow-arrow">
            <span className="arrow-line">➔</span>
            <small>Serve WebApps</small>
          </div>

          <div className="flow-node node-pages">
            <div className="node-icon">🌐</div>
            <div className="node-title">CLOUDFLARE PAGES</div>
            <div className="node-desc">Frontend Applications</div>
            <ul className="node-bullets">
              <li>Mini App Thành viên (14 nút)</li>
              <li>Bảng Quản trị Admin Console</li>
              <li>Global Edge CDN & SSL</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Blueprint & Configuration */}
      <div className="hub-grid" style={{ marginTop: 20 }}>
        <div className="hub-card" style={{ gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3>📄 render.yaml (Blueprint Triển Khai 1-Click)</h3>
            <button
              type="button"
              className="view-mode-btn"
              onClick={copyYaml}
            >
              {copied ? "✅ Đã sao chép!" : "📋 Sao chép render.yaml"}
            </button>
          </div>
          <pre className="code-block">{RENDER_YAML}</pre>
        </div>

        <div className="hub-card">
          <h3>🔑 Biến Môi Trường Cần Thiết</h3>
          <div className="endpoint-list">
            <div className="endpoint-item">
              <div><code>BOT_TOKEN</code><small style={{ display: "block", color: "#8798af" }}>Token Telegram Bot từ @BotFather</small></div>
              <span className="method-tag method-del">Bắt buộc</span>
            </div>
            <div className="endpoint-item">
              <div><code>BOT_MODE</code><small style={{ display: "block", color: "#8798af" }}>polling hoặc webhook</small></div>
              <span className="method-tag method-get">Mặc định: polling</span>
            </div>
            <div className="endpoint-item">
              <div><code>WEBAPP_URL</code><small style={{ display: "block", color: "#8798af" }}>URL Cloudflare Pages thành viên</small></div>
              <span className="method-tag method-post">Pages</span>
            </div>
            <div className="endpoint-item">
              <div><code>ADMIN_WEBAPP_URL</code><small style={{ display: "block", color: "#8798af" }}>URL Cloudflare Pages admin</small></div>
              <span className="method-tag method-post">Pages</span>
            </div>
            <div className="endpoint-item">
              <div><code>CLOUDFLARE_D1_DATABASE_ID</code><small style={{ display: "block", color: "#8798af" }}>Database ID của hendy_bot_db</small></div>
              <span className="method-tag method-put">D1 SQL</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
