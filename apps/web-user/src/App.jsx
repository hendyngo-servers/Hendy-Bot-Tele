import React, { useEffect, useMemo, useState } from "react";
import { api, releaseDownloadUrl } from "./services/api.js";

const BRANDS = ["QQ88", "78WIN", "SC88", "C168", "CM88", "F8BET"];
const MODULES = [
  { id: "mini_game_live", title: "Mini Game Live", subtitle: "Liên kết tài khoản · Theo dõi đơn", icon: "🎮", accent: "#ff7b72", tint: "rgba(255,123,114,.16)", orderable: true },
  { id: "app_tool", title: "App / Tool", subtitle: "Thuê công cụ · Thời hạn · Lịch sử", icon: "🧰", accent: "#55d6be", tint: "rgba(85,214,190,.16)", orderable: true },
  { id: "buy_code", title: "Mua Code", subtitle: "Danh mục · Đơn mua · Lịch sử", icon: "⌘", accent: "#ae91ff", tint: "rgba(174,145,255,.16)", orderable: true },
  { id: "wallet", title: "Ví điện tử", subtitle: "Số dư · Nạp tiền · Giao dịch", icon: "💳", accent: "#f4be56", tint: "rgba(244,190,86,.16)", orderable: false, note: "Ví và thanh toán sẽ được tích hợp sau khi chốt nhà cung cấp." },
  { id: "otp_proxy", title: "OTP & Proxy", subtitle: "Dịch vụ · Gói thuê · Đơn hàng", icon: "🛡️", accent: "#6fa9ff", tint: "rgba(111,169,255,.16)", orderable: true },
  { id: "vip", title: "VIP", subtitle: "Cấp bậc · Quyền lợi · Nâng cấp", icon: "👑", accent: "#ff9cce", tint: "rgba(255,156,206,.16)", orderable: true },
  { id: "support", title: "Trung tâm khách hàng", subtitle: "Hồ sơ · Hỗ trợ · Hoạt động", icon: "🎧", accent: "#70d5f5", tint: "rgba(112,213,245,.16)", orderable: false, note: "Trung tâm hỗ trợ đang được hoàn thiện." },
  { id: "referral", title: "Giới thiệu REF", subtitle: "Mã giới thiệu · Hoa hồng", icon: "🤝", accent: "#a6dd78", tint: "rgba(166,221,120,.16)", orderable: false, note: "Số liệu hoa hồng chỉ hiển thị sau khi có quy tắc đối soát." },
  { id: "giftcode", title: "Giftcode", subtitle: "Nhập mã · Kiểm tra phần thưởng", icon: "🎁", accent: "#ffad68", tint: "rgba(255,173,104,.16)", orderable: false, note: "Giftcode chưa được kích hoạt để tránh ghi nhận thưởng khi chưa có bộ máy chống dùng lặp." }
];
const STATUS_LABELS = {
  pending: "Chờ tiếp nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Đã hủy"
};

const money = (value) => new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " ₫";

export default function App() {
  const telegram = useMemo(() => window.Telegram?.WebApp || null, []);
  const initData = telegram?.initData || "";
  const [tab, setTab] = useState("home");
  const [home, setHome] = useState(null);
  const [orders, setOrders] = useState([]);
  const [links, setLinks] = useState({});
  const [releases, setReleases] = useState([]);
  const [brand, setBrand] = useState(BRANDS[0]);
  const [accountLabel, setAccountLabel] = useState("");
  const [selectedModule, setSelectedModule] = useState(null);
  const [orderTitle, setOrderTitle] = useState("");
  const [orderDescription, setOrderDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    if (!initData) {
      setError("Chưa có phiên Telegram hợp lệ. Hãy mở Mini App bằng nút trong bot Telegram.");
      setLoading(false);
      return;
    }
    Promise.all([
      api("/api/v1/home", {}, initData),
      api("/api/v1/orders?limit=20", {}, initData),
      api("/api/v1/links", {}, initData),
      api("/api/v1/releases")
    ]).then(([homeData, orderData, linkData, releaseData]) => {
      setHome(homeData);
      setOrders(orderData.orders || []);
      setLinks(linkData.links || {});
      setReleases(releaseData.releases || []);
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [initData, telegram]);

  function openModule(item) {
    setError("");
    setNotice("");
    if (!item.orderable) {
      setSelectedModule(null);
      setNotice(item.note || "Tính năng đang được hoàn thiện.");
      return;
    }
    setSelectedModule(item);
    setOrderTitle("Yêu cầu " + item.title);
    setOrderDescription("");
    setQuantity(1);
    setTab("home");
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!selectedModule || !initData) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/api/v1/orders", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          module: selectedModule.id,
          title: orderTitle,
          description: orderDescription,
          quantity: Number(quantity)
        })
      }, initData);
      if (!result.duplicate) setOrders((current) => [result.order, ...current]);
      setSelectedModule(null);
      setNotice("Đã ghi nhận " + result.order.orderNumber + ". Đơn đang chờ nhân viên xác nhận và báo giá; ví chưa bị trừ tiền.");
      const freshHome = await api("/api/v1/home", {}, initData);
      setHome(freshHome);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addLink(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ brand, accountLabel })
      }, initData);
      setLinks(result.links || {});
      setAccountLabel("");
      setNotice("Đã lưu mã tài khoản. Hệ thống không yêu cầu hoặc lưu mật khẩu hay OTP.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(targetBrand, index) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/v1/links/" + encodeURIComponent(targetBrand) + "/" + index, { method: "DELETE" }, initData);
      setLinks(result.links || {});
      setNotice("Đã xóa liên kết.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const orderCount = home?.orderSummary?.total || 0;
  const totalLinks = Object.values(links).reduce((count, rows) => count + (rows?.length || 0), 0);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol">H</div>
          <div><strong>HENDY</strong><span>TELEGRAM MINI APP</span></div>
        </div>
        <div className="connection"><i /> CLOUDFLARE EDGE</div>
      </header>

      {!initData && <section className="auth-wall">
        <div className="auth-icon">🔐</div>
        <h1>Mở Hendy Bot từ Telegram</h1>
        <p>Mini App chỉ nhận dữ liệu người dùng sau khi Worker xác thực chữ ký initData. Không dùng initDataUnsafe làm căn cứ đăng nhập.</p>
      </section>}

      {error && <div className="notice error">{error}</div>}
      {notice && <div className="notice success">{notice}</div>}

      {initData && <>
        <section className="welcome">
          <div className="welcome-copy">
            <span className="eyebrow">HENDY SERVICE HUB · MEMBER AREA</span>
            <h1>Xin chào, <em>{home?.user?.name || "thành viên"}</em></h1>
            <p>Một nơi quản lý dịch vụ, đơn hàng và tài khoản của bạn.</p>
          </div>
          <div className="member-chip"><span>✦</span><div><small>HẠNG THÀNH VIÊN</small><strong>{home?.membership?.tier || "Cơ bản"}</strong></div></div>
        </section>

        <section className="overview-grid">
          <article className="balance-card">
            <div className="overview-label">SỐ DƯ HIỆN TẠI</div>
            <strong>{money(home?.user?.balance)}</strong>
            <span>Ví điện tử · Chưa bật nạp/rút</span>
          </article>
          <article className="metric-card metric-violet">
            <span>ĐƠN HÀNG</span><strong>{orderCount}</strong><small>{home?.orderSummary?.pending || 0} đang chờ</small>
          </article>
          <article className="metric-card metric-blue">
            <span>LIÊN KẾT</span><strong>{totalLinks}</strong><small>Mã tài khoản đã lưu</small>
          </article>
        </section>

        <nav className="main-nav" aria-label="Điều hướng">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>⌂ Tổng quan</button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>▤ Đơn hàng <b>{orderCount}</b></button>
          <button className={tab === "links" ? "active" : ""} onClick={() => setTab("links")}>↗ Tài khoản liên kết</button>
        </nav>

        {loading ? <div className="loading-panel">Đang đồng bộ dữ liệu D1…</div> : <>
          {tab === "home" && <>
            <section className="section-block">
              <div className="section-title"><div><span className="eyebrow">SERVICE DIRECTORY</span><h2>Menu chức năng</h2></div><span className="section-aside">09 MODULES</span></div>
              <div className="module-grid">
                {MODULES.map((item, index) => <button
                  type="button"
                  key={item.id}
                  className="module-card"
                  style={{ "--accent": item.accent, "--tint": item.tint }}
                  onClick={() => openModule(item)}
                >
                  <div className="module-top"><span className="module-icon">{item.icon}</span><span className="module-index">{String(index + 1).padStart(2, "0")}</span></div>
                  <strong>{item.title}</strong>
                  <span className="module-description">{item.subtitle}</span>
                  <span className={item.orderable ? "module-state ready" : "module-state"}>{item.orderable ? "TẠO YÊU CẦU ↗" : "ĐANG HOÀN THIỆN"}</span>
                </button>)}
              </div>
            </section>

            {selectedModule && <section className="request-panel">
              <div className="section-title"><div><span className="eyebrow">NEW SERVICE REQUEST</span><h2>{selectedModule.title}</h2></div><button className="close-button" onClick={() => setSelectedModule(null)} aria-label="Đóng">×</button></div>
              <p className="helper-copy">Đây là yêu cầu dịch vụ, chưa phải giao dịch thanh toán. Nhân viên sẽ kiểm tra, xác nhận thông tin và báo giá trước khi thực hiện.</p>
              <form className="request-form" onSubmit={submitOrder}>
                <label>Tiêu đề yêu cầu<input value={orderTitle} onChange={(event) => setOrderTitle(event.target.value)} minLength={3} maxLength={100} required /></label>
                <label>Số lượng<input type="number" min="1" max="50" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
                <label className="full">Thông tin bổ sung<textarea value={orderDescription} onChange={(event) => setOrderDescription(event.target.value)} maxLength={1000} rows="3" placeholder="Ghi rõ gói dịch vụ, phiên bản hoặc yêu cầu cụ thể. Không gửi mật khẩu/OTP." /></label>
                <div className="form-footer"><span>Giá: <b>Chờ báo giá</b></span><button disabled={busy}>{busy ? "Đang gửi…" : "Gửi yêu cầu →"}</button></div>
              </form>
            </section>}

            <section className="section-block lower-section">
              <div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Đơn hàng gần đây</h2></div><button className="text-button" onClick={() => setTab("orders")}>Xem tất cả ↗</button></div>
              <OrderList orders={orders.slice(0, 4)} />
            </section>

            <section className="section-block lower-section">
              <div className="section-title"><div><span className="eyebrow">OFFICIAL RELEASES</span><h2>Ứng dụng & công cụ</h2></div><span className="section-aside">{releases.length} BẢN PHÁT HÀNH</span></div>
              {releases.length === 0 ? <div className="empty-panel">Chưa có bản phát hành được công bố.</div> : <div className="release-list">{releases.slice(0, 5).map((release) => <article className="release-row" key={release.id}>
                <div className="release-icon">↓</div>
                <div className="release-info"><strong>{release.platform} · v{release.version}</strong><span>{release.file_name || "Tệp phát hành"} · {release.release_notes || "Bản chính thức"}</span></div>
                <a className="download-link" href={releaseDownloadUrl(release.id)}>Tải về</a>
              </article>)}</div>}
            </section>
          </>}

          {tab === "orders" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">ORDER MANAGEMENT</span><h2>Đơn hàng của tôi</h2></div><span className="section-aside">{orders.length} HIỂN THỊ</span></div>
            <OrderList orders={orders} />
            <p className="footnote">Đơn mới được lưu trạng thái chờ tiếp nhận. Giá trị 0 ₫ không phải thanh toán miễn phí; đơn đang chờ nhân viên báo giá.</p>
          </section>}

          {tab === "links" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">ACCOUNT CONNECTIONS</span><h2>Tài khoản liên kết</h2></div><span className="section-aside">{totalLinks} LIÊN KẾT</span></div>
            <p className="helper-copy">Chỉ lưu tên/mã tài khoản để bạn quản lý. Không nhập mật khẩu, OTP, cookie hoặc mã khôi phục.</p>
            <form className="link-form" onSubmit={addLink}>
              <label>Sảnh / nền tảng<select value={brand} onChange={(event) => setBrand(event.target.value)}>{BRANDS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Mã tài khoản<input value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} maxLength={40} placeholder="Tên hoặc mã tài khoản" required /></label>
              <button disabled={busy}>{busy ? "Đang lưu…" : "＋ Thêm liên kết"}</button>
            </form>
            <div className="account-grid">{BRANDS.map((item) => <article className="account-card" key={item}>
              <div className="account-heading"><strong>{item}</strong><span>{links[item]?.length || 0}</span></div>
              {(links[item] || []).length === 0 ? <p className="empty">Chưa có tài khoản</p> : links[item].map((account, index) => <div className="account-row" key={item + account.tk + index}>
                <span>{account.tk}</span><button className="icon-button" aria-label="Xóa liên kết" disabled={busy} onClick={() => removeLink(item, index)}>×</button>
              </div>)}
            </article>)}</div>
          </section>}
        </>}
      </>}

      <footer className="app-footer"><span>HENDY BOT</span><span>WORKERS · D1 · R2</span><span>SECURE MEMBER AREA</span></footer>
    </main>
  );
}

function OrderList({ orders }) {
  if (!orders?.length) return <div className="empty-panel">Bạn chưa có đơn hàng. Chọn một module dịch vụ để tạo yêu cầu đầu tiên.</div>;
  return <div className="orders-list">{orders.map((order) => <article className="order-row" key={order.id}>
    <div className="order-mark">↗</div>
    <div className="order-main"><strong>{order.orderNumber}</strong><span>{order.title} · SL {order.quantity}</span><small>{new Date(order.createdAt).toLocaleString("vi-VN")}</small></div>
    <div className="order-side"><b>{money(order.amount)}</b><span className={"status-pill status-" + order.status}>{STATUS_LABELS[order.status] || order.status}</span><small>Chờ báo giá</small></div>
  </article>)}</div>;
}
