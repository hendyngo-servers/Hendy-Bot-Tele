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
  const [catalogItems, setCatalogItems] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [referralSummary, setReferralSummary] = useState(null);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [vipProfile, setVipProfile] = useState(null);
  const [giftcodeInput, setGiftcodeInput] = useState("");
  const [walletOverview, setWalletOverview] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const requestedModule = useMemo(() => new URLSearchParams(window.location.search).get("module"), []);

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

  async function loadCatalog(moduleId) {
    try {
      const result = await api("/api/v1/catalog?module=" + encodeURIComponent(moduleId), {}, initData);
      setCatalogItems(result.items || []);
    } catch (err) {
      setCatalogItems([]);
      setError(err.message);
    }
  }

  async function openModule(item) {
    setError("");
    setNotice("");
    setSelectedModule(null);
    if (item.id === "wallet") {
      setTab("wallet");
      try { setWalletOverview(await api("/api/v1/wallet", {}, initData)); }
      catch (err) { setError(err.message); }
      return;
    }
    if (item.id === "support") {
      setTab("support");
      try {
        const result = await api("/api/v1/support/tickets", {}, initData);
        setSupportTickets(result.tickets || []);
      } catch (err) { setError(err.message); }
      return;
    }
    if (item.id === "referral") {
      setTab("referral");
      try { setReferralSummary(await api("/api/v1/referral", {}, initData)); }
      catch (err) { setError(err.message); }
      return;
    }
    if (item.id === "giftcode") {
      setTab("giftcode");
      return;
    }
    if (item.id === "vip") {
      setTab("vip");
      try { setVipProfile(await api("/api/v1/vip", {}, initData)); }
      catch (err) { setError(err.message); }
      return;
    }
    if (!item.orderable) {
      setNotice(item.note || "Tính năng đang được hoàn thiện.");
      return;
    }
    setSelectedModule(item);
    setOrderTitle("Yêu cầu " + item.title);
    setOrderDescription("");
    setQuantity(1);
    setTab("home");
    if (["app_tool", "buy_code", "otp_proxy"].includes(item.id)) await loadCatalog(item.id);
  }

  async function refreshWallet() {
    setWalletOverview(await api("/api/v1/wallet", {}, initData));
  }

  async function submitDeposit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/deposits", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amountVnd: Number(depositAmount) })
      }, initData);
      setDepositAmount("");
      await refreshWallet();
      setNotice("Đã tạo yêu cầu nạp " + result.request.reference + ". Chuyển khoản đúng nội dung tham chiếu và chờ Admin đối soát.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function submitSupport(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/support/tickets", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ category: "general", subject: supportSubject, message: supportMessage })
      }, initData);
      setSupportTickets(current => [result.ticket || result, ...current]);
      setSupportSubject(""); setSupportMessage("");
      setNotice("Đã gửi yêu cầu hỗ trợ đến Trung tâm khách hàng.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function claimReferral(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/v1/referral/claim", { method: "POST", body: JSON.stringify({ code: referralCodeInput }) }, initData);
      setReferralCodeInput("");
      setReferralSummary(await api("/api/v1/referral", {}, initData));
      setNotice("Đã ghi nhận mã giới thiệu.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function redeemGiftcode(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/giftcodes/redeem", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ code: giftcodeInput.trim().toUpperCase() })
      }, initData);
      setGiftcodeInput("");
      setNotice("Đổi Giftcode thành công. Phần thưởng: " + Number(result.rewardVoucher || 0).toLocaleString("vi-VN") + " điểm.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function requestVipUpgrade(tier) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/orders", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ module: "vip", title: "Yêu cầu nâng cấp " + tier.name, description: "Mã cấp bậc: " + tier.code, quantity: 1 })
      }, initData);
      setOrders(current => result.duplicate ? current : [result.order, ...current]);
      setNotice("Đã tạo yêu cầu nâng cấp VIP. Nhân viên sẽ xác nhận điều kiện và báo giá.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function selectCatalogItem(item) {
    const module = MODULES.find(value => value.id === item.module);
    if (!module) return;
    setSelectedModule(module);
    setOrderTitle(item.title);
    setOrderDescription([item.slug, item.description, item.duration_days ? "Thời hạn: " + item.duration_days + " ngày" : ""].filter(Boolean).join(" · "));
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

  useEffect(() => {
    if (loading || !initData || !requestedModule) return;
    const item = MODULES.find(value => value.id === requestedModule);
    if (item) openModule(item);
  }, [loading, initData, requestedModule]);

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

            {selectedModule && ["app_tool", "buy_code", "otp_proxy"].includes(selectedModule.id) && catalogItems.length > 0 && <section className="section-block">
              <div className="section-title"><div><span className="eyebrow">SERVICE CATALOG</span><h2>Danh mục {selectedModule.title}</h2></div></div>
              <div className="release-list">{catalogItems.map(item => <article className="release-row" key={item.id}>
                <div className="release-icon">✦</div>
                <div className="release-info"><strong>{item.title}</strong><span>{item.description || item.slug} · {item.duration_days ? item.duration_days + " ngày · " : ""}{item.unit_price === null ? "Chờ báo giá" : money(item.unit_price)}</span></div>
                <button className="download-link" type="button" onClick={() => selectCatalogItem(item)}>Chọn</button>
              </article>)}</div>
            </section>}
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

          {tab === "wallet" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">HENDY WALLET</span><h2>Ví điện tử</h2></div><button className="text-button" type="button" onClick={() => refreshWallet().catch(err => setError(err.message))}>↻ Làm mới</button></div>
            <div className="balance-card"><div className="overview-label">SỐ DƯ KHẢ DỤNG</div><strong>{money(walletOverview?.balance ?? home?.user?.balance)}</strong><span>Ví nội bộ · VND</span></div>
            <section className="request-panel">
              <div className="section-title"><div><span className="eyebrow">BANK TRANSFER</span><h2>Thông tin chuyển khoản</h2></div></div>
              {walletOverview?.payment?.configured ? <>
                <p><b>{walletOverview.payment.bankName || "Ngân hàng"}</b> {walletOverview.payment.bankBin ? "· " + walletOverview.payment.bankBin : ""}</p>
                <p>Số tài khoản: <b>{walletOverview.payment.accountNumber}</b></p>
                <p>Chủ tài khoản: <b>{walletOverview.payment.accountName}</b></p>
                <p className="helper-copy">{walletOverview.payment.instruction}</p>
                <form className="link-form" onSubmit={submitDeposit}>
                  <label>Số tiền (10.000–100.000.000 VNĐ)<input type="number" min="10000" max="100000000" step="1000" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} required /></label>
                  <button disabled={busy}>{busy ? "Đang tạo…" : "Tạo yêu cầu nạp"}</button>
                </form>
              </> : <div className="empty-panel">Admin chưa cấu hình thông tin ngân hàng. Chưa thể tạo yêu cầu chuyển khoản.</div>}
            </section>
            <div className="section-title"><div><span className="eyebrow">TRANSACTION HISTORY</span><h2>Lịch sử nạp tiền</h2></div></div>
            {(walletOverview?.deposits || []).length ? <div className="orders-list">{walletOverview.deposits.map(item => <article className="order-row" key={item.id}>
              <div className="order-mark">₫</div><div className="order-main"><strong>{item.reference}</strong><span>{money(item.amount)}</span><small>{new Date(item.createdAt).toLocaleString("vi-VN")}</small></div>
              <div className="order-side"><span className={"status-pill status-" + (item.status === "approved" ? "completed" : item.status === "rejected" ? "cancelled" : "pending")}>{item.status === "approved" ? "Đã cộng tiền" : item.status === "rejected" ? "Từ chối" : "Chờ đối soát"}</span>{item.adminNote && <small>{item.adminNote}</small>}</div>
            </article>)}</div> : <div className="empty-panel">Chưa có giao dịch nạp tiền.</div>}
            <p className="footnote">Số dư chỉ được cộng sau khi Admin kiểm tra giao dịch thực tế. Không gửi ảnh/chứng từ chứa thông tin ngân hàng nhạy cảm vào nhóm công khai.</p>
          </section>}

          {tab === "support" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">CUSTOMER CARE</span><h2>Trung tâm khách hàng</h2></div></div>
            <form className="request-form" onSubmit={submitSupport}>
              <label className="full">Tiêu đề<input value={supportSubject} onChange={e => setSupportSubject(e.target.value)} minLength={3} maxLength={120} required /></label>
              <label className="full">Nội dung<textarea value={supportMessage} onChange={e => setSupportMessage(e.target.value)} rows="4" maxLength={4000} required /></label>
              <div className="form-footer"><span>Trao đổi với bộ phận hỗ trợ</span><button disabled={busy}>{busy ? "Đang gửi…" : "Gửi yêu cầu"}</button></div>
            </form>
            <div className="section-title"><div><span className="eyebrow">SUPPORT HISTORY</span><h2>Lịch sử hỗ trợ</h2></div></div>
            {supportTickets.length ? supportTickets.map(ticket => <article className="account-card" key={ticket.id}><strong>{ticket.ticketNumber || ticket.ticket_number || ticket.subject}</strong><p>{ticket.subject}</p><small>{ticket.status} · {ticket.updatedAt || ticket.updated_at || ""}</small></article>) : <div className="empty-panel">Chưa có yêu cầu hỗ trợ.</div>}
          </section>}

          {tab === "referral" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">REFERRAL PROGRAM</span><h2>Giới thiệu REF</h2></div></div>
            {referralSummary ? <>
              <div className="overview-grid"><article className="metric-card"><span>MÃ GIỚI THIỆU</span><strong>{referralSummary.code}</strong><small>Chia sẻ cho bạn bè</small></article><article className="metric-card"><span>ĐÃ GIỚI THIỆU</span><strong>{referralSummary.invited}</strong><small>Tài khoản đã ghi nhận</small></article></div>
              <div className="panel"><p className="helper-copy">{referralSummary.inviteUrl}</p><button type="button" onClick={() => navigator.clipboard?.writeText(referralSummary.inviteUrl).then(() => setNotice("Đã sao chép liên kết giới thiệu.")).catch(() => setError("Không thể sao chép liên kết."))}>Sao chép liên kết</button><p className="footnote">{referralSummary.commissionNote}</p></div>
              <form className="link-form" onSubmit={claimReferral}><label>Mã giới thiệu của người mời<input value={referralCodeInput} onChange={e => setReferralCodeInput(e.target.value)} maxLength={32} required /></label><button disabled={busy}>{busy ? "Đang ghi nhận…" : "Áp dụng mã"}</button></form>
            </> : <div className="loading-panel">Đang tải dữ liệu giới thiệu…</div>}
          </section>}

          {tab === "giftcode" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">REWARD CENTER</span><h2>Nhập Giftcode</h2></div></div>
            <form className="link-form" onSubmit={redeemGiftcode}><label>Mã Giftcode<input value={giftcodeInput} onChange={e => setGiftcodeInput(e.target.value.toUpperCase())} maxLength={40} placeholder="HENDY-XXXX-XXXX-XXXX" required /></label><button disabled={busy}>{busy ? "Đang kiểm tra…" : "Đổi thưởng"}</button></form>
            <p className="footnote">Mã được kiểm tra thời hạn, lượt sử dụng và chống đổi lặp ở máy chủ. Phần thưởng là điểm voucher, không tự cộng tiền mặt.</p>
          </section>}

          {tab === "vip" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">MEMBERSHIP</span><h2>Trung tâm VIP</h2></div></div>
            {vipProfile ? <>
              <div className="overview-grid"><article className="metric-card"><span>HẠNG HIỆN TẠI</span><strong>{vipProfile.currentTier?.name || "Cơ bản"}</strong></article><article className="metric-card"><span>ĐIỂM VIP</span><strong>{vipProfile.points || 0}</strong></article></div>
              <div className="account-grid">{(vipProfile.tiers || []).map(tier => <article className="account-card" key={tier.code}><strong>{tier.name}</strong><p className="muted">Từ {Number(tier.minPoints).toLocaleString("vi-VN")} điểm</p><p className="muted">{(tier.benefits || []).join(" · ")}</p><button type="button" disabled={busy || tier.code === vipProfile.currentTier?.code} onClick={() => requestVipUpgrade(tier)}>{tier.code === vipProfile.currentTier?.code ? "Đang sở hữu" : "Yêu cầu nâng cấp"}</button></article>)}</div>
            </> : <div className="loading-panel">Đang tải cấp bậc VIP…</div>}
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
