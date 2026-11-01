import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, releaseDownloadUrl } from "./services/api.js";

const BRANDS = ["QQ88", "78WIN", "SC88", "C168", "CM88", "F8BET"];
const MODULES = [
  { id: "mini_game_live", apiModule: "mini_game_live", title: "MINI GAME LIVE", subtitle: "Liên kết tài khoản · Đơn và trạng thái", icon: "🎮", tone: "coral", orderable: true },
  { id: "app_tool", apiModule: "app_tool", title: "THUÊ TOOL", subtitle: "Danh mục công cụ · Thời hạn · Lịch sử", icon: "🧰", tone: "blue", orderable: true, catalog: true },
  { id: "buy_code", apiModule: "buy_code", title: "MUA CODE", subtitle: "Code màn · Code tele · Đơn mua", icon: "🎁", tone: "green", orderable: true, catalog: true },
  { id: "wallet", title: "NẠP TIỀN · VÍ ĐIỆN TỬ", subtitle: "Số dư · Chuyển khoản · Giao dịch", icon: "💳", tone: "coral", route: "wallet" },
  { id: "otp_proxy", apiModule: "otp_proxy", title: "OTP & PROXY", subtitle: "Gói dịch vụ · Đơn và lịch sử", icon: "🛡️", tone: "blue", orderable: true, catalog: true },
  { id: "vip_tools", apiModule: "vip", title: "KHO VIP ĐẶC QUYỀN", subtitle: "Gói công cụ và yêu cầu quyền lợi", icon: "🏆", tone: "gold", orderable: true, catalog: true },
  { id: "support", title: "TRUNG TÂM KHÁCH HÀNG", subtitle: "Hồ sơ · Ticket · Trao đổi hỗ trợ", icon: "💎", tone: "blue", route: "support" },
  { id: "pairing", apiModule: "mini_game_live", title: "HỆ THỐNG GHÉP ĐÔI", subtitle: "Gửi yêu cầu ghép đôi · Theo dõi tiến trình", icon: "💞", tone: "coral", orderable: true, defaultTitle: "Yêu cầu ghép đôi" },
  { id: "referral", title: "GIỚI THIỆU REF", subtitle: "Mã mời · Thống kê · Hoa hồng", icon: "🤝", tone: "green", route: "referral" },
  { id: "vip", title: "TRUNG TÂM VIP", subtitle: "Cấp bậc · Điểm · Nâng cấp", icon: "👑", tone: "gold", route: "vip" },
  { id: "group_chat", title: "NHÓM CHAT", subtitle: "Mở cộng đồng hỗ trợ Hendy", icon: "👥", tone: "green", external: "groupChatUrl" },
  { id: "news_channel", title: "KÊNH THÔNG BÁO", subtitle: "Tin tức và cập nhật hệ thống", icon: "📢", tone: "green", external: "newsChannelUrl" },
  { id: "giftcode", title: "NHẬP GIFTCODE", subtitle: "Đổi mã · Kiểm tra phần thưởng", icon: "🎟️", tone: "coral", route: "giftcode" },
  { id: "contact_support", title: "LIÊN HỆ CSKH", subtitle: "Mở hỗ trợ hoặc gửi ticket riêng", icon: "🎧", tone: "green", external: "supportUrl", fallbackRoute: "support" }
];
const STATUS_LABELS = {
  pending: "Chờ tiếp nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Đã hủy"
};
const PAYMENT_LABELS = { unpaid: "Chưa thanh toán", paid: "Đã thanh toán", refunded: "Đã hoàn tiền" };
const TICKET_STATUS = {
  open: "Đang mở",
  in_progress: "Đang xử lý",
  awaiting_user: "Chờ phản hồi của bạn",
  resolved: "Đã giải quyết",
  closed: "Đã đóng"
};
const money = value => new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " ₫";
const idempotencyKey = () => crypto.randomUUID();

export default function App() {
  const telegram = useMemo(() => window.Telegram?.WebApp || null, []);
  const initData = telegram?.initData || "";
  const [tab, setTab] = useState("home");
  const [home, setHome] = useState(null);
  const [orders, setOrders] = useState([]);
  const [links, setLinks] = useState({});
  const [releases, setReleases] = useState([]);
  const [publicConfig, setPublicConfig] = useState({});
  const [brand, setBrand] = useState(BRANDS[0]);
  const [accountLabel, setAccountLabel] = useState("");
  const [selectedModule, setSelectedModule] = useState(null);
  const [catalogItemId, setCatalogItemId] = useState("");
  const [orderTitle, setOrderTitle] = useState("");
  const [orderDescription, setOrderDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [catalogItems, setCatalogItems] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [ticketReply, setTicketReply] = useState("");
  const referralStartParam = String(
    telegram?.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get("startapp") ||
    ""
  );
  const referralStartCode = referralStartParam.replace(/^ref_/i, "").trim().toUpperCase();
  const [referralSummary, setReferralSummary] = useState(null);
  const [referralCodeInput, setReferralCodeInput] = useState(referralStartCode);
  const [vipProfile, setVipProfile] = useState(null);
  const [giftcodeInput, setGiftcodeInput] = useState("");
  const [walletOverview, setWalletOverview] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTransfer, setDepositTransfer] = useState(null);
  const requestedModule = useMemo(() => new URLSearchParams(window.location.search).get("module"), []);
  const requestedSection = useMemo(() => new URLSearchParams(window.location.search).get("section"), []);

  const loadHomeData = useCallback(async () => {
    const [homeData, orderData, linkData, releaseData, configData] = await Promise.all([
      api("/api/v1/home", {}, initData),
      api("/api/v1/orders?limit=50", {}, initData),
      api("/api/v1/links", {}, initData),
      api("/api/v1/releases"),
      api("/api/v1/public-config")
    ]);
    setHome(homeData);
    setOrders(orderData.orders || []);
    setLinks(linkData.links || {});
    setReleases(releaseData.releases || []);
    setPublicConfig(configData || {});
  }, [initData]);

  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    telegram?.setHeaderColor?.("#101827");
    telegram?.setBackgroundColor?.("#090d18");
    if (!initData) {
      setError("Chưa có phiên Telegram hợp lệ. Hãy mở Mini App bằng nút trong bot Telegram.");
      setLoading(false);
      return;
    }
    loadHomeData().catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [initData, telegram, loadHomeData]);

  async function loadCatalog(moduleId) {
    const result = await api("/api/v1/catalog?module=" + encodeURIComponent(moduleId), {}, initData);
    setCatalogItems(result.items || []);
  }

  async function openExternal(url, label) {
    if (!url || !/^https:\/\//i.test(url)) {
      setNotice("Quản trị viên chưa cấu hình liên kết " + label + ".");
      return;
    }
    try {
      if (telegram?.openTelegramLink && /^(https:\/\/)?t\.me\//i.test(url)) telegram.openTelegramLink(url);
      else if (telegram?.openLink) telegram.openLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Không thể mở liên kết. Vui lòng thử lại.");
    }
  }

  async function openModule(item) {
    setError("");
    setNotice("");
    setSelectedModule(null);
    setCatalogItemId("");
    if (item.external) {
      const target = publicConfig[item.external];
      if (target) await openExternal(target, item.title);
      else if (item.fallbackRoute) {
        setTab(item.fallbackRoute);
        await loadSupportTickets();
      } else setNotice("Liên kết này chưa được cấu hình. Vui lòng liên hệ Admin.");
      return;
    }
    if (item.id === "mini_game_live") {
      setTab("links");
      return;
    }
    if (item.route === "wallet") {
      setTab("wallet");
      try { await refreshWallet(); } catch (err) { setError(err.message); }
      return;
    }
    if (item.route === "support") {
      setTab("support");
      await loadSupportTickets();
      return;
    }
    if (item.route === "referral") {
      setTab("referral");
      try { setReferralSummary(await api("/api/v1/referral", {}, initData)); }
      catch (err) { setError(err.message); }
      return;
    }
    if (item.route === "giftcode") {
      setTab("giftcode");
      return;
    }
    if (item.route === "vip") {
      setTab("vip");
      try { setVipProfile(await api("/api/v1/vip", {}, initData)); }
      catch (err) { setError(err.message); }
      return;
    }

    setSelectedModule(item);
    setOrderTitle(item.defaultTitle || "Yêu cầu " + item.title);
    setOrderDescription(item.id === "pairing" || requestedSection === "pairing"
      ? "Yêu cầu sử dụng hệ thống ghép đôi. Vui lòng mô tả nền tảng và khung thời gian mong muốn."
      : "");
    setQuantity(1);
    setTab("home");
    const moduleId = item.apiModule || item.id;
    if (item.catalog) {
      try { await loadCatalog(moduleId); }
      catch (err) { setCatalogItems([]); setError(err.message); }
    } else {
      setCatalogItems([]);
    }
  }

  async function refreshWallet() {
    const result = await api("/api/v1/wallet", {}, initData);
    setWalletOverview(result);
  }

  async function refreshOrdersAndHome() {
    const [orderData, homeData] = await Promise.all([
      api("/api/v1/orders?limit=50", {}, initData),
      api("/api/v1/home", {}, initData)
    ]);
    setOrders(orderData.orders || []);
    setHome(homeData);
  }

  async function submitDeposit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/api/v1/deposits", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({ amountVnd: Number(depositAmount) })
      }, initData);
      setDepositAmount("");
      setDepositTransfer(result.transfer || null);
      await refreshWallet();
      setNotice("Đã tạo yêu cầu nạp " + result.request.reference + ". Chuyển khoản đúng số tiền và nội dung tham chiếu, sau đó chờ Admin đối soát.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function loadSupportTickets() {
    const result = await api("/api/v1/support/tickets", {}, initData);
    setSupportTickets(result.tickets || []);
    setSelectedTicket(null);
  }

  async function openSupportTicket(ticketId) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/v1/support/tickets/" + encodeURIComponent(ticketId), {}, initData);
      setSelectedTicket(result);
      setTicketReply("");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function submitSupport(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/support/tickets", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({ category: "general", subject: supportSubject, message: supportMessage })
      }, initData);
      setSupportSubject("");
      setSupportMessage("");
      await loadSupportTickets();
      if (result.ticket?.ticket?.id) await openSupportTicket(result.ticket.ticket.id);
      setNotice("Đã gửi yêu cầu hỗ trợ tới Trung tâm khách hàng.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function replySupportTicket(event) {
    event.preventDefault();
    const ticketId = selectedTicket?.ticket?.id;
    if (!ticketId || !ticketReply.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/support/tickets/" + encodeURIComponent(ticketId) + "/messages", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({ message: ticketReply.trim() })
      }, initData);
      setSelectedTicket(result);
      setTicketReply("");
      await loadSupportTickets();
      setNotice("Đã gửi phản hồi cho ticket hỗ trợ.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function claimReferral(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/v1/referral/claim", {
        method: "POST",
        body: JSON.stringify({ code: referralCodeInput })
      }, initData);
      setReferralCodeInput("");
      setReferralSummary(await api("/api/v1/referral", {}, initData));
      setNotice("Đã ghi nhận mã giới thiệu. Mỗi tài khoản chỉ được gắn một mã.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function redeemGiftcode(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/giftcodes/redeem", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({ code: giftcodeInput.trim().toUpperCase() })
      }, initData);
      setGiftcodeInput("");
      await refreshWallet();
      setNotice("Đổi Giftcode thành công. Phần thưởng: " + Number(result.rewardVoucher || 0).toLocaleString("vi-VN") + " điểm voucher.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function requestVipUpgrade(tier) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({
          module: "vip",
          title: "Yêu cầu nâng cấp " + tier.name,
          description: "Mã cấp bậc: " + tier.code,
          quantity: 1
        })
      }, initData);
      await refreshOrdersAndHome();
      setNotice("Đã tạo yêu cầu nâng cấp VIP " + tier.name + ". Admin sẽ kiểm tra điều kiện và gửi báo giá.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function selectCatalogItem(item) {
    const module = MODULES.find(value => value.catalog && (value.apiModule || value.id) === item.module);
    if (!module) {
      setError("Không xác định được nhóm dịch vụ của sản phẩm.");
      return;
    }
    setSelectedModule(module);
    setCatalogItemId(item.id);
    setOrderTitle(item.title);
    setOrderDescription([
      item.description,
      item.duration_days ? "Thời hạn: " + item.duration_days + " ngày" : "",
      item.stock === null || item.stock === undefined ? "" : "Tồn kho hiển thị: " + item.stock
    ].filter(Boolean).join(" · "));
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
        headers: { "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({
          module: selectedModule.apiModule || selectedModule.id,
          title: orderTitle,
          description: orderDescription,
          quantity: Number(quantity),
          ...(catalogItemId ? { catalogItemId } : {})
        })
      }, initData);
      await refreshOrdersAndHome();
      setSelectedModule(null);
      setCatalogItemId("");
      setNotice("Đã ghi nhận " + result.order.orderNumber + ". Đơn được lưu trong hệ thống; Admin sẽ xác nhận hoặc gửi báo giá trước khi thanh toán.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function respondToQuote(order, decision) {
    if (!order.quote?.id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/v1/orders/" + encodeURIComponent(order.id) + "/quotes/" + encodeURIComponent(order.quote.id) + "/respond", {
        method: "POST",
        body: JSON.stringify({ decision })
      }, initData);
      await refreshOrdersAndHome();
      if (decision === "accepted") {
        setNotice("Đã chấp nhận báo giá. Bạn có thể thanh toán từ số dư ví để Admin bắt đầu xử lý.");
      } else {
        setNotice("Đã từ chối báo giá. Đơn sẽ trở về trạng thái chờ để Admin trao đổi lại.");
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function payOrder(order) {
    if (!window.confirm("Xác nhận thanh toán " + money(order.amount) + " từ số dư ví cho đơn " + order.orderNumber + "?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/v1/orders/" + encodeURIComponent(order.id) + "/pay", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey() }
      }, initData);
      await Promise.all([refreshOrdersAndHome(), refreshWallet()]);
      setNotice("Thanh toán đơn hàng thành công. Số dư ví còn " + money(result.balance) + ".");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
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
      setNotice("Đã lưu mã tài khoản. Hệ thống không yêu cầu hoặc lưu mật khẩu/OTP.");
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
    const item = requestedSection === "pairing"
      ? MODULES.find(value => value.id === "pairing")
      : MODULES.find(value => value.id === requestedModule);
    if (item) openModule(item);
  }, [loading, initData, requestedModule, requestedSection]);

  const orderCount = home?.orderSummary?.total || 0;
  const totalLinks = Object.values(links).reduce((count, rows) => count + (rows?.length || 0), 0);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol">H</div>
          <div><strong>HENDY</strong><span>TELEGRAM MINI APP</span></div>
        </div>
        <div className="connection"><i /> CLOUDFLARE EDGE · D1</div>
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
            <p>Telegram ID: {home?.user?.id || "—"} · Tham gia: {home?.user?.createdAt ? new Date(home.user.createdAt).toLocaleDateString("vi-VN") : "—"}</p>
          </div>
          <div className="member-chip"><span>✦</span><div><small>HẠNG THÀNH VIÊN</small><strong>{home?.membership?.tier || "Cơ bản"}</strong></div></div>
        </section>

        <section className="overview-grid">
          <article className="balance-card" role="button" tabIndex="0" onClick={() => openModule(MODULES.find(item => item.id === "wallet"))}>
            <div className="overview-label">SỐ DƯ HIỆN TẠI</div>
            <strong>{money(home?.user?.balance)}</strong>
            <span>Ví nội bộ · Chạm để mở giao dịch</span>
          </article>
          <article className="metric-card metric-violet">
            <span>ĐƠN HÀNG</span><strong>{orderCount}</strong><small>{home?.orderSummary?.pending || 0} đang chờ</small>
          </article>
          <article className="metric-card metric-blue">
            <span>TÀI KHOẢN LIÊN KẾT</span><strong>{totalLinks}</strong><small>Mã tài khoản đã lưu</small>
          </article>
        </section>

        <nav className="main-nav" aria-label="Điều hướng">
          <button className={tab === "home" ? "active" : ""} onClick={() => { setTab("home"); setSelectedModule(null); }}>⌂ Trang chủ</button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>▤ Đơn hàng <b>{orderCount}</b></button>
          <button className={tab === "links" ? "active" : ""} onClick={() => setTab("links")}>↗ Tài khoản liên kết</button>
          <button className="refresh-button" onClick={() => loadHomeData().catch(err => setError(err.message))}>↻</button>
        </nav>

        {loading ? <div className="loading-panel">Đang đồng bộ dữ liệu D1…</div> : <>
          {tab === "home" && <>
            <section className="section-block">
              <div className="section-title"><div><span className="eyebrow">HENDY SERVICE DIRECTORY</span><h2>Danh mục chức năng</h2></div><span className="section-aside">{MODULES.length} LỐI TRUY CẬP</span></div>
              <div className="module-grid">
                {MODULES.map((item, index) => <button
                  type="button"
                  key={item.id}
                  className={"module-card tone-" + item.tone}
                  onClick={() => openModule(item)}
                >
                  <div className="module-top"><span className="module-icon">{item.icon}</span><span className="module-index">{String(index + 1).padStart(2, "0")}</span></div>
                  <strong>{item.title}</strong>
                  <span className="module-description">{item.subtitle}</span>
                  <span className="module-state ready">{item.external ? "MỞ LIÊN KẾT ↗" : "MỞ CHỨC NĂNG ↗"}</span>
                </button>)}
              </div>
            </section>

            {selectedModule?.catalog && <section className="section-block">
              <div className="section-title"><div><span className="eyebrow">CATALOG FROM D1</span><h2>Danh mục {selectedModule.title}</h2></div></div>
              {catalogItems.length ? <div className="release-list">{catalogItems.map(item => <article className="release-row" key={item.id}>
                <div className="release-icon">✦</div>
                <div className="release-info"><strong>{item.title}</strong><span>{item.description || item.slug} · {item.duration_days ? item.duration_days + " ngày · " : ""}{item.unit_price === null ? "Chờ báo giá" : money(item.unit_price)}{item.stock === null || item.stock === undefined ? "" : " · Tồn " + item.stock}</span></div>
                <button className="download-link" type="button" disabled={item.stock !== null && item.stock !== undefined && Number(item.stock) < 1} onClick={() => selectCatalogItem(item)}>Chọn</button>
              </article>)}</div> : <div className="empty-panel">Danh mục hiện chưa có sản phẩm đang mở bán. Admin có thể thêm sản phẩm từ Bảng quản trị → Danh mục.</div>}
            </section>}

            {selectedModule && <section className="request-panel">
              <div className="section-title"><div><span className="eyebrow">SERVICE REQUEST</span><h2>{selectedModule.title}</h2></div><button className="close-button" onClick={() => { setSelectedModule(null); setCatalogItemId(""); }} aria-label="Đóng">×</button></div>
              <p className="helper-copy">Yêu cầu được lưu vào D1 và chuyển tới hàng đợi Admin. Giá chỉ do danh mục hoặc Admin xác định; không gửi mật khẩu, OTP, cookie hay thông tin đăng nhập bên thứ ba.</p>
              <form className="request-form" onSubmit={submitOrder}>
                <label>Tiêu đề yêu cầu<input value={orderTitle} onChange={event => setOrderTitle(event.target.value)} minLength={3} maxLength={100} required /></label>
                <label>Số lượng<input type="number" min="1" max="50" value={quantity} onChange={event => setQuantity(event.target.value)} required /></label>
                <label className="full">Thông tin bổ sung<textarea value={orderDescription} onChange={event => setOrderDescription(event.target.value)} maxLength={1000} rows="3" placeholder="Ghi rõ gói dịch vụ, thời hạn hoặc yêu cầu cụ thể." /></label>
                <div className="form-footer"><span>Giá: <b>{catalogItemId ? "Theo danh mục" : "Chờ Admin báo giá"}</b></span><button disabled={busy}>{busy ? "Đang gửi…" : "Gửi yêu cầu →"}</button></div>
              </form>
            </section>}

            <section className="section-block lower-section">
              <div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Đơn hàng gần đây</h2></div><button className="text-button" onClick={() => setTab("orders")}>Xem tất cả ↗</button></div>
              <OrderList orders={orders.slice(0, 4)} busy={busy} onQuote={respondToQuote} onPay={payOrder} />
            </section>

            <section className="section-block lower-section">
              <div className="section-title"><div><span className="eyebrow">OFFICIAL RELEASES</span><h2>Ứng dụng & công cụ phát hành</h2></div><span className="section-aside">{releases.length} BẢN PHÁT HÀNH</span></div>
              {releases.length === 0 ? <div className="empty-panel">Chưa có bản phát hành được Admin công bố.</div> : <div className="release-list">{releases.slice(0, 5).map(release => <article className="release-row" key={release.id}>
                <div className="release-icon">↓</div>
                <div className="release-info"><strong>{release.platform} · v{release.version}</strong><span>{release.file_name || "Tệp phát hành"} · {release.release_notes || "Bản chính thức"}</span></div>
                <a className="download-link" href={releaseDownloadUrl(release.id)}>Tải về</a>
              </article>)}</div>}
            </section>
          </>}

          {tab === "orders" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">ORDER MANAGEMENT</span><h2>Đơn hàng của tôi</h2></div><span className="section-aside">{orders.length} HIỂN THỊ</span></div>
            <OrderList orders={orders} busy={busy} onQuote={respondToQuote} onPay={payOrder} />
            <p className="footnote">Đơn chỉ được xử lý sau khi đã xác nhận, khách hàng chấp nhận báo giá (nếu có) và thanh toán thành công từ ví.</p>
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
              </> : <div className="empty-panel">Admin chưa cấu hình ngân hàng. Chưa thể tạo yêu cầu chuyển khoản.</div>}
            </section>
            {depositTransfer && <section className="request-panel transfer-panel">
              <h3>Thông tin lệnh chuyển khoản</h3>
              <p>Số tiền: <b>{money(depositTransfer.amount)}</b></p>
              <p>Nội dung chuyển khoản: <b>{depositTransfer.reference}</b></p>
              {depositTransfer.qrUrl && <img className="transfer-qr" src={depositTransfer.qrUrl} alt="Mã QR chuyển khoản VietQR" />}
              <button type="button" className="text-button" onClick={() => navigator.clipboard?.writeText(depositTransfer.reference).then(() => setNotice("Đã sao chép nội dung chuyển khoản.")).catch(() => setError("Không thể sao chép."))}>Sao chép nội dung chuyển khoản</button>
            </section>}
            <div className="section-title"><div><span className="eyebrow">DEPOSIT HISTORY</span><h2>Lịch sử nạp tiền</h2></div></div>
            {(walletOverview?.deposits || []).length ? <div className="orders-list">{walletOverview.deposits.map(item => <article className="order-row" key={item.id}>
              <div className="order-mark">₫</div><div className="order-main"><strong>{item.reference}</strong><span>{money(item.amount)}</span><small>{new Date(item.createdAt).toLocaleString("vi-VN")}</small></div>
              <div className="order-side"><span className={"status-pill status-" + (item.status === "approved" ? "completed" : item.status === "rejected" ? "cancelled" : "pending")}>{item.status === "approved" ? "Đã cộng tiền" : item.status === "rejected" ? "Từ chối" : "Chờ đối soát"}</span>{item.adminNote && <small>{item.adminNote}</small>}</div>
            </article>)}</div> : <div className="empty-panel">Chưa có yêu cầu nạp tiền.</div>}
            <div className="section-title"><div><span className="eyebrow">WALLET LEDGER</span><h2>Lịch sử biến động số dư</h2></div></div>
            {(walletOverview?.transactions || []).length ? <div className="orders-list">{walletOverview.transactions.map(item => <article className="order-row" key={item.id}>
              <div className="order-mark">₫</div><div className="order-main"><strong>{item.type === "deposit" ? "Nạp tiền" : item.type === "order_payment" ? "Thanh toán đơn hàng" : item.type === "referral_commission" ? "Hoa hồng giới thiệu" : item.type}</strong><small>{new Date(item.createdAt).toLocaleString("vi-VN")}</small></div>
              <div className="order-side"><b className={item.amount < 0 ? "amount-debit" : "amount-credit"}>{item.amount > 0 ? "+" : ""}{money(item.amount)}</b><small>Số dư sau giao dịch: {money(item.balanceAfter)}</small></div>
            </article>)}</div> : <div className="empty-panel">Chưa có biến động số dư.</div>}
            <p className="footnote">Yêu cầu nạp chỉ được cộng tiền sau khi Admin xác minh tiền vào ngân hàng. Thanh toán đơn trừ ví theo giao dịch có sổ cái và khóa chống xử lý lặp.</p>
          </section>}

          {tab === "support" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">CUSTOMER CARE</span><h2>Trung tâm khách hàng</h2></div><button className="text-button" onClick={() => loadSupportTickets().catch(err => setError(err.message))}>↻ Làm mới</button></div>
            <form className="request-form" onSubmit={submitSupport}>
              <label>Tiêu đề<input value={supportSubject} onChange={e => setSupportSubject(e.target.value)} minLength={4} maxLength={120} required /></label>
              <label className="full">Nội dung<textarea value={supportMessage} onChange={e => setSupportMessage(e.target.value)} rows="4" maxLength={3000} required /></label>
              <div className="form-footer"><span>Gửi ticket để nhân viên phản hồi ngay trong Mini App</span><button disabled={busy}>{busy ? "Đang gửi…" : "Tạo ticket hỗ trợ"}</button></div>
            </form>
            {selectedTicket?.ticket && <section className="request-panel">
              <div className="section-title"><div><span className="eyebrow">TICKET DETAIL</span><h2>{selectedTicket.ticket.ticket_number || selectedTicket.ticket.subject}</h2></div><button className="close-button" onClick={() => setSelectedTicket(null)}>×</button></div>
              <p>{selectedTicket.ticket.subject} · {TICKET_STATUS[selectedTicket.ticket.status] || selectedTicket.ticket.status}</p>
              <div className="ticket-thread">{(selectedTicket.messages || []).map(message => <article className={"ticket-message " + message.sender_type} key={message.id}>
                <strong>{message.sender_type === "admin" ? "CSKH Hendy" : message.sender_type === "user" ? "Bạn" : "Hệ thống"}</strong>
                <p>{message.message}</p><small>{new Date(message.created_at).toLocaleString("vi-VN")}</small>
              </article>)}</div>
              {!["resolved","closed"].includes(selectedTicket.ticket.status) && <form className="link-form" onSubmit={replySupportTicket}>
                <label>Phản hồi<input value={ticketReply} onChange={e => setTicketReply(e.target.value)} maxLength={3000} required placeholder="Nhập nội dung phản hồi..." /></label>
                <button disabled={busy}>{busy ? "Đang gửi…" : "Gửi phản hồi"}</button>
              </form>}
            </section>}
            <div className="section-title"><div><span className="eyebrow">SUPPORT HISTORY</span><h2>Lịch sử hỗ trợ</h2></div></div>
            {supportTickets.length ? supportTickets.map(ticket => <article className="account-card support-ticket-card" key={ticket.id}>
              <div><strong>{ticket.ticket_number || ticket.ticketNumber || ticket.subject}</strong><small>{ticket.subject} · {TICKET_STATUS[ticket.status] || ticket.status}</small></div>
              <button type="button" className="download-link" onClick={() => openSupportTicket(ticket.id)}>Mở trao đổi</button>
            </article>) : <div className="empty-panel">Chưa có ticket hỗ trợ. Gửi yêu cầu ở biểu mẫu phía trên.</div>}
          </section>}

          {tab === "referral" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">REFERRAL PROGRAM</span><h2>Giới thiệu REF</h2></div></div>
            {referralSummary ? <>
              <div className="overview-grid">
                <article className="metric-card"><span>MÃ GIỚI THIỆU</span><strong>{referralSummary.code}</strong><small>Chia sẻ cho bạn bè</small></article>
                <article className="metric-card"><span>ĐÃ GIỚI THIỆU</span><strong>{referralSummary.invited}</strong><small>Tài khoản đã ghi nhận</small></article>
              </div>
              <div className="panel">
                {referralSummary.inviteUrl ? <>
                  <p className="helper-copy">{referralSummary.inviteUrl}</p>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(referralSummary.inviteUrl).then(() => setNotice("Đã sao chép liên kết giới thiệu.")).catch(() => setError("Không thể sao chép liên kết."))}>Sao chép liên kết</button>
                </> : <p className="footnote">Quản trị viên chưa cấu hình WEBAPP_URL chính thức. Mã giới thiệu của bạn vẫn dùng được: gửi trực tiếp mã này cho người được mời.</p>}
                <p className="footnote">{referralSummary.commissionNote}</p>
                {referralSummary.commissionAvailable && <p className="footnote">Tỷ lệ cấu hình: {(Number(referralSummary.commissionRateBps || 0) / 100).toFixed(2)}% trên giá trị đơn đã thanh toán và hoàn tất.</p>}
              </div>
              <div className="account-grid">{(referralSummary.commissions || []).map(item => <article className="account-card" key={item.status}><strong>{item.status === "pending" ? "Chờ duyệt" : item.status === "approved" ? "Đã duyệt" : item.status === "paid" ? "Đã chi trả" : item.status}</strong><p>{item.total} giao dịch · {money(item.amount)}</p></article>)}</div>
              {referralSummary.referredBy ? <p className="helper-copy">Bạn được giới thiệu bởi: {referralSummary.referredBy.name} (ID {referralSummary.referredBy.id}).</p> : <form className="link-form" onSubmit={claimReferral}><label>Mã giới thiệu của người mời<input value={referralCodeInput} onChange={e => setReferralCodeInput(e.target.value.toUpperCase())} maxLength={32} required /></label><button disabled={busy}>{busy ? "Đang ghi nhận…" : "Áp dụng mã"}</button></form>}
            </> : <div className="loading-panel">Đang tải dữ liệu giới thiệu…</div>}
          </section>}

          {tab === "giftcode" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">REWARD CENTER</span><h2>Nhập Giftcode</h2></div></div>
            <form className="link-form" onSubmit={redeemGiftcode}><label>Mã Giftcode<input value={giftcodeInput} onChange={e => setGiftcodeInput(e.target.value.toUpperCase())} maxLength={40} placeholder="HENDY-XXXX-XXXX-XXXX" required /></label><button disabled={busy}>{busy ? "Đang kiểm tra…" : "Đổi thưởng"}</button></form>
            <p className="footnote">Mỗi Giftcode chỉ được đổi một lần trên mỗi tài khoản. Phần thưởng được cộng vào ví voucher, không tự cộng vào số dư tiền mặt.</p>
          </section>}

          {tab === "vip" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">MEMBERSHIP</span><h2>Trung tâm VIP</h2></div></div>
            {vipProfile ? <>
              <div className="overview-grid"><article className="metric-card"><span>HẠNG HIỆN TẠI</span><strong>{vipProfile.currentTier?.name || "Cơ bản"}</strong></article><article className="metric-card"><span>ĐIỂM VIP</span><strong>{vipProfile.points || 0}</strong></article></div>
              <div className="account-grid">{(vipProfile.tiers || []).map(tier => <article className="account-card" key={tier.code}><strong>{tier.name}</strong><p className="muted">Từ {Number(tier.minPoints).toLocaleString("vi-VN")} điểm</p><p className="muted">{(tier.benefits || []).join(" · ")}</p><button type="button" disabled={busy || tier.code === vipProfile.currentTier?.code || Number(vipProfile.points || 0) < Number(tier.minPoints || 0)} onClick={() => requestVipUpgrade(tier)}>{tier.code === vipProfile.currentTier?.code ? "Đang sở hữu" : Number(vipProfile.points || 0) >= Number(tier.minPoints || 0) ? "Đủ điều kiện · yêu cầu Admin duyệt" : "Cần thêm " + Math.max(0,Number(tier.minPoints || 0)-Number(vipProfile.points || 0)).toLocaleString("vi-VN") + " điểm"}</button></article>)}</div>
            </> : <div className="loading-panel">Đang tải cấp bậc VIP…</div>}
          </section>}

          {tab === "links" && <section className="section-block">
            <div className="section-title"><div><span className="eyebrow">MINI GAME LIVE · ACCOUNT CONNECTIONS</span><h2>Trung tâm quản lý tài khoản liên kết</h2></div><span className="section-aside">{totalLinks} LIÊN KẾT</span></div>
            <div className="module-action-row"><p className="helper-copy">Quản lý mã/tên tài khoản của bạn, theo dõi đơn Mini Game Live trong mục Đơn hàng. Không gửi mật khẩu hay OTP.</p><button className="text-button" onClick={() => { const item = MODULES.find(value => value.id === "mini_game_live"); setSelectedModule(item); setOrderTitle("Yêu cầu Mini Game Live"); setOrderDescription(""); setQuantity(1); setTab("home"); }}>＋ Tạo yêu cầu Mini Game Live</button></div>
            <p className="helper-copy">Chỉ lưu tên/mã tài khoản để bạn quản lý. Không nhập mật khẩu, OTP, cookie hoặc mã khôi phục.</p>
            <form className="link-form" onSubmit={addLink}>
              <label>Sảnh / nền tảng<select value={brand} onChange={event => setBrand(event.target.value)}>{BRANDS.map(item => <option key={item}>{item}</option>)}</select></label>
              <label>Mã tài khoản<input value={accountLabel} onChange={event => setAccountLabel(event.target.value)} maxLength={40} placeholder="Tên hoặc mã tài khoản" required /></label>
              <button disabled={busy}>{busy ? "Đang lưu…" : "＋ Thêm liên kết"}</button>
            </form>
            <div className="account-grid">{BRANDS.map(item => <article className="account-card" key={item}>
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

function OrderList({ orders, busy, onQuote, onPay }) {
  if (!orders?.length) return <div className="empty-panel">Bạn chưa có đơn hàng. Chọn một chức năng để tạo yêu cầu đầu tiên.</div>;
  return <div className="orders-list">{orders.map(order => <article className="order-row order-row-expanded" key={order.id}>
    <div className="order-mark">↗</div>
    <div className="order-main"><strong>{order.orderNumber}</strong><span>{order.title} · SL {order.quantity}</span><small>{new Date(order.createdAt).toLocaleString("vi-VN")}</small>
      {order.quote?.status === "sent" && <div className="quote-box"><b>Báo giá: {money(order.quote.amount)}</b>{order.quote.note && <p>{order.quote.note}</p>}<span>Vui lòng chấp nhận hoặc từ chối báo giá.</span><div className="quote-actions"><button disabled={busy} onClick={() => onQuote(order, "accepted")}>Chấp nhận</button><button disabled={busy} onClick={() => onQuote(order, "rejected")}>Từ chối</button></div></div>}
      {order.status === "confirmed" && order.paymentStatus !== "paid" && Number(order.amount) > 0 && <div className="quote-box"><b>Đã xác nhận · Cần thanh toán {money(order.amount)}</b><p>Thanh toán từ số dư ví để chuyển đơn sang bước xử lý.</p><button disabled={busy} onClick={() => onPay(order)}>Thanh toán từ ví</button></div>}
    </div>
    <div className="order-side"><b>{money(order.amount)}</b><span className={"status-pill status-" + order.status}>{STATUS_LABELS[order.status] || order.status}</span><small>{PAYMENT_LABELS[order.paymentStatus] || "Chưa thanh toán"}</small></div>
  </article>)}</div>;
}
