import React, { useMemo, useState } from "react";
import { adminApi } from "../services/api.js";

const STATUS_LABEL = {
  pending: "Chờ tiếp nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Đã hủy"
};
const MODULE_LABEL = {
  mini_game_live: "Mini Game Live",
  app_tool: "Thuê Tool",
  buy_code: "Mua Code",
  otp_proxy: "OTP & Proxy",
  vip: "VIP / Kho đặc quyền"
};
const NEXT_STATUSES = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["completed", "cancelled"],
  completed: [],
  cancelled: []
};
const TICKET_STATUS = {
  open: "Mới tiếp nhận",
  in_progress: "Đang xử lý",
  awaiting_user: "Chờ khách phản hồi",
  resolved: "Đã giải quyết",
  closed: "Đã đóng"
};
const money = value => new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " ₫";
const newKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "key-" + Math.random().toString(36).substring(2));

const NAVIGATION = [
  ["overview", "▦", "Tổng quan"],
  ["orders", "▤", "Hàng đợi đơn hàng"],
  ["deposits", "₫", "Duyệt nạp tiền"],
  ["catalog", "◈", "Danh mục dịch vụ"],
  ["giftcodes", "🎟", "Giftcode"],
  ["support", "✉", "Trung tâm hỗ trợ"],
  ["referrals", "♧", "Hoa hồng REF"],
  ["releases", "⇧", "Phát hành ứng dụng"],
  ["webhook", "⌁", "Telegram webhook"]
];

const emptyCatalogForm = {
  module: "app_tool",
  slug: "",
  title: "",
  description: "",
  unitPrice: "",
  durationDays: "",
  stock: "",
  sortOrder: "100"
};

export default function AdminApp() {
  const [token, setToken] = useState("admin123");
  const [setupKey, setSetupKey] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [section, setSection] = useState("orders");
  const [stats, setStats] = useState(null);
  const [releases, setReleases] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [depositStatus, setDepositStatus] = useState("pending");
  const [depositNote, setDepositNote] = useState("");
  const [orderStats, setOrderStats] = useState(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueStatus, setQueueStatus] = useState("all");
  const [queueModule, setQueueModule] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm);
  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [giftcodes, setGiftcodes] = useState([]);
  const [giftcodeForm, setGiftcodeForm] = useState({
    rewardVoucher: "100000",
    maxRedemptions: "10",
    expiresAt: ""
  });
  const [generatedGiftcode, setGeneratedGiftcode] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketStatus, setTicketStatus] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketReply, setTicketReply] = useState("");
  const [commissions, setCommissions] = useState([]);
  const [commissionStatus, setCommissionStatus] = useState("all");
  const [file, setFile] = useState(null);
  const [platform, setPlatform] = useState("Android");
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadQueue(currentToken = token, status = queueStatus, module = queueModule, query = search) {
    const params = new URLSearchParams({ limit: "100", status, module });
    if (query.trim()) params.set("q", query.trim());
    const result = await adminApi("/api/v1/admin/orders?" + params.toString(), currentToken);
    setOrders(result.orders || []);
    setQueueTotal(Number(result.total || 0));
    setOrderStats(result.stats || null);
  }

  async function loadDeposits(currentToken = token, status = depositStatus) {
    const result = await adminApi("/api/v1/admin/deposits?status=" + encodeURIComponent(status), currentToken);
    setDeposits(result.deposits || []);
  }

  async function loadCatalog(currentToken = token) {
    const result = await adminApi("/api/v1/admin/catalog", currentToken);
    setCatalog(result.items || []);
  }

  async function loadGiftcodes(currentToken = token) {
    const result = await adminApi("/api/v1/admin/giftcodes", currentToken);
    setGiftcodes(result.giftcodes || []);
  }

  async function loadTickets(currentToken = token, status = ticketStatus) {
    const result = await adminApi("/api/v1/admin/support/tickets?status=" + encodeURIComponent(status), currentToken);
    setTickets(result.tickets || []);
  }

  async function loadCommissions(currentToken = token, status = commissionStatus) {
    const result = await adminApi("/api/v1/admin/referrals/commissions?status=" + encodeURIComponent(status), currentToken);
    setCommissions(result.commissions || []);
  }

  async function openSection(nextSection) {
    setSection(nextSection);
    setError("");
    setNotice("");
    if (!authorized) return;
    setBusy(true);
    try {
      if (nextSection === "catalog") await loadCatalog();
      if (nextSection === "giftcodes") await loadGiftcodes();
      if (nextSection === "support") await loadTickets(token, ticketStatus);
      if (nextSection === "referrals") await loadCommissions(token, commissionStatus);
      if (nextSection === "deposits") await loadDeposits();
      if (nextSection === "orders") await loadQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh(currentToken = token) {
    setBusy(true);
    setError("");
    try {
      const [summary, published, queue, depositsData] = await Promise.all([
        adminApi("/api/v1/admin/stats", currentToken),
        adminApi("/api/v1/releases"),
        adminApi("/api/v1/admin/orders?limit=100&status=all&module=all", currentToken),
        adminApi("/api/v1/admin/deposits?status=pending", currentToken)
      ]);
      setStats(summary.stats);
      setReleases(published.releases || []);
      setOrders(queue.orders || []);
      setQueueTotal(Number(queue.total || 0));
      setOrderStats(queue.stats || null);
      setDeposits(depositsData.deposits || []);
      setAuthorized(true);
    } finally {
      setBusy(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await refresh(token);
      setNotice("Đã xác thực quản trị thành công. Bảng điều khiển sẵn sàng.");
    } catch (err) {
      setAuthorized(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeQueueFilter(status = queueStatus, module = queueModule, query = search) {
    setQueueStatus(status);
    setQueueModule(module);
    setBusy(true);
    setError("");
    try {
      await loadQueue(token, status, module, query);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openOrder(orderId) {
    setBusy(true);
    setError("");
    setAdminNote("");
    setQuoteAmount("");
    setQuoteNote("");
    try {
      const result = await adminApi("/api/v1/admin/orders/" + encodeURIComponent(orderId), token);
      setSelectedOrder(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createQuote(event) {
    event.preventDefault();
    const order = selectedOrder?.order;
    const amount = Number(quoteAmount);
    if (!order) return;
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setError("Giá báo phải là số nguyên VND dương.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi("/api/v1/admin/orders/" + encodeURIComponent(order.id) + "/quote", token, {
        method: "POST",
        headers: { "Idempotency-Key": newKey() },
        body: JSON.stringify({ amount, note: quoteNote.trim() })
      });
      setSelectedOrder(result);
      setQuoteAmount("");
      setQuoteNote("");
      await loadQueue();
      setNotice("Đã gửi báo giá " + money(amount) + " cho " + order.orderNumber + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function transitionOrder(nextStatus) {
    const order = selectedOrder?.order;
    if (!order) return;
    if (nextStatus === "processing" && Number(order.amount) > 0 && order.paymentStatus !== "paid") {
      setError("Khách hàng phải thanh toán qua ví trước khi bắt đầu xử lý.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi("/api/v1/admin/orders/" + encodeURIComponent(order.id) + "/status", token, {
        method: "POST",
        headers: { "Idempotency-Key": newKey() },
        body: JSON.stringify({
          expectedStatus: order.status,
          status: nextStatus,
          note: adminNote.trim()
        })
      });
      setSelectedOrder(result);
      setAdminNote("");
      await loadQueue();
      const summary = await adminApi("/api/v1/admin/stats", token);
      setStats(summary.stats);
      setNotice("Đã chuyển đơn " + order.orderNumber + " sang trạng thái: " + STATUS_LABEL[nextStatus] + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewDeposit(item, status) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminApi("/api/v1/admin/deposits/" + encodeURIComponent(item.id) + "/review", token, {
        method: "POST",
        body: JSON.stringify({ status, note: depositNote.trim() })
      });
      await loadDeposits();
      setDepositNote("");
      setNotice(status === "approved"
        ? "Đã đối soát và cộng " + money(item.amount) + " cho " + item.reference + "."
        : "Đã từ chối yêu cầu nạp " + item.reference + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCatalogItem(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminApi(
        editingCatalogId
          ? "/api/v1/admin/catalog/" + encodeURIComponent(editingCatalogId)
          : "/api/v1/admin/catalog",
        token,
        {
          method: editingCatalogId ? "PUT" : "POST",
          body: JSON.stringify({
            ...catalogForm,
            unitPrice: catalogForm.unitPrice === "" ? null : Number(catalogForm.unitPrice),
            durationDays: catalogForm.durationDays === "" ? null : Number(catalogForm.durationDays),
            stock: catalogForm.stock === "" ? null : Number(catalogForm.stock),
            sortOrder: Number(catalogForm.sortOrder)
          })
        }
      );
      setCatalogForm(emptyCatalogForm);
      const wasEditing = Boolean(editingCatalogId);
      setEditingCatalogId(null);
      await loadCatalog();
      setNotice(wasEditing ? "Đã cập nhật giá, thời hạn, mô tả và tồn kho." : "Đã tạo sản phẩm/dịch vụ mới trong danh mục.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function editCatalogItem(item) {
    setEditingCatalogId(item.id);
    setCatalogForm({
      module: item.module,
      slug: item.slug,
      title: item.title,
      description: item.description || "",
      unitPrice: item.unit_price === null || item.unit_price === undefined ? "" : String(item.unit_price),
      durationDays: item.duration_days === null || item.duration_days === undefined ? "" : String(item.duration_days),
      stock: item.stock === null || item.stock === undefined ? "" : String(item.stock),
      sortOrder: String(item.sort_order ?? 100)
    });
    setError("");
    setNotice("Đang chỉnh sửa " + item.title + ". Lưu biểu mẫu để cập nhật danh mục.");
  }

  function cancelCatalogEdit() {
    setEditingCatalogId(null);
    setCatalogForm(emptyCatalogForm);
  }

  async function setCatalogStatus(item, active) {
    setBusy(true);
    setError("");
    try {
      await adminApi("/api/v1/admin/catalog/" + encodeURIComponent(item.id) + "/" + (active ? "activate" : "deactivate"), token, { method: "POST" });
      await loadCatalog();
      setNotice(active ? "Đã mở bán " + item.title + "." : "Đã ngừng mở bán " + item.title + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createGiftcode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setGeneratedGiftcode(null);
    try {
      const result = await adminApi("/api/v1/admin/giftcodes", token, {
        method: "POST",
        body: JSON.stringify({
          rewardVoucher: Number(giftcodeForm.rewardVoucher),
          maxRedemptions: Number(giftcodeForm.maxRedemptions),
          expiresAt: giftcodeForm.expiresAt || null
        })
      });
      setGeneratedGiftcode(result);
      await loadGiftcodes();
      setNotice("Đã tạo Giftcode. Hãy sao chép mã và gửi cho người nhận; mã đầy đủ chỉ hiển thị lần này.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setGiftcodeActive(item, active) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminApi("/api/v1/admin/giftcodes/" + encodeURIComponent(item.id) + "/" + (active ? "activate" : "deactivate"), token, { method: "POST" });
      await loadGiftcodes();
      setNotice(active ? "Đã kích hoạt Giftcode." : "Đã thu hồi Giftcode; mã này không thể đổi thêm.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openTicket(ticketId) {
    setBusy(true);
    setError("");
    try {
      const result = await adminApi("/api/v1/admin/support/tickets/" + encodeURIComponent(ticketId), token);
      setSelectedTicket(result);
      setTicketReply("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function replyTicket(event) {
    event.preventDefault();
    const ticketId = selectedTicket?.ticket?.id;
    if (!ticketId || !ticketReply.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminApi("/api/v1/admin/support/tickets/" + encodeURIComponent(ticketId) + "/messages", token, {
        method: "POST",
        headers: { "Idempotency-Key": newKey() },
        body: JSON.stringify({ message: ticketReply.trim() })
      });
      setSelectedTicket(result);
      setTicketReply("");
      await loadTickets();
      setNotice("Đã gửi phản hồi cho khách hàng.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeTicketStatus(ticket, status) {
    setBusy(true);
    setError("");
    try {
      const result = await adminApi("/api/v1/admin/support/tickets/" + encodeURIComponent(ticket.id) + "/status", token, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      await loadTickets();
      if (selectedTicket?.ticket?.id === ticket.id) {
        const refreshed = await adminApi("/api/v1/admin/support/tickets/" + encodeURIComponent(ticket.id), token);
        setSelectedTicket(refreshed);
      }
      setNotice("Đã chuyển ticket sang: " + (TICKET_STATUS[result.status] || result.status) + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function settleCommission(item, action) {
    const labels = { approve: "duyệt", pay: "chi trả vào ví", void: "hủy" };
    if (!window.confirm("Bạn xác nhận " + labels[action] + " khoản hoa hồng " + money(item.amount) + " của " + item.referrerName + "?")) return;
    const note = window.prompt("Ghi chú đối soát (không bắt buộc):", item.adminNote || "");
    if (note === null) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminApi("/api/v1/admin/referrals/commissions/" + encodeURIComponent(item.id) + "/settle", token, {
        method: "POST",
        body: JSON.stringify({ action, note })
      });
      await loadCommissions();
      setNotice("Đã " + labels[action] + " khoản hoa hồng.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish(event) {
    event.preventDefault();
    if (!version.trim()) {
      setError("Vui lòng nhập phiên bản.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminApi("/api/v1/admin/releases", token, {
        method: "POST",
        body: JSON.stringify({ platform, version: version.trim(), releaseNotes: notes.trim() })
      });
      setVersion("");
      setNotes("");
      const published = await adminApi("/api/v1/releases");
      setReleases(published.releases || []);
      setNotice("Đã tạo bản phát hành mới thành công.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setupWebhook() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi("/api/v1/admin/webhook/setup", token, {
        method: "POST",
        headers: { "X-Webhook-Setup-Key": setupKey }
      });
      setNotice(result.message || "Đã gửi yêu cầu đăng ký webhook.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const currentOrder = selectedOrder?.order;
  const availableTransitions = useMemo(() => NEXT_STATUSES[currentOrder?.status] || [], [currentOrder?.status]);

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><span>H</span><div><b>HENDY</b><small>CONTROL PLANE</small></div></div>
        <div className="side-label">WORKSPACE</div>
        {NAVIGATION.map(([id, icon, label]) => <button key={id} className={"nav-item " + (section === id ? "active" : "")} onClick={() => openSection(id)}>
          {icon}<span>{label}</span>
          {id === "orders" && orderStats?.pending > 0 && <b className="nav-count">{orderStats.pending}</b>}
          {id === "deposits" && deposits.length > 0 && <b className="nav-count">{deposits.length}</b>}
        </button>)}
        <div className="side-foot">HENDY SYSTEM<br />Console · Live Data</div>
      </aside>

      <section className="main-area">
        <header className="admin-header">
          <div><span className="crumb">HENDY / ADMIN</span><h1>{NAVIGATION.find(item => item[0] === section)?.[2] || "Trung tâm quản trị"}</h1></div>
          <span className="secure">● PRIVATE CONSOLE</span>
        </header>
        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}

        {!authorized ? <section className="card login-card">
          <div className="section-kicker">SECURE ACCESS</div><h2>Xác thực quản trị</h2>
          <p>Nhập ADMIN_API_TOKEN để mở quyền truy cập bảng điều khiển quản trị.</p>
          <form onSubmit={login}>
            <label>Admin API token<input type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" required /></label>
            <button disabled={busy}>{busy ? "Đang xác thực…" : "Mở bảng điều khiển"}</button>
          </form>
        </section> : <>
          {section === "overview" && <>
            <div className="stats-grid">
              <Stat title="NGƯỜI DÙNG" value={stats?.users ?? "—"} detail="Thành viên hệ thống" />
              <Stat title="TỔNG ĐƠN HÀNG" value={orderStats?.total ?? 0} detail="Đơn được lưu trong hệ thống" />
              <Stat title="ĐANG CHỜ" value={orderStats?.pending ?? 0} detail="Cần nhân viên tiếp nhận" />
              <Stat title="ĐANG XỬ LÝ" value={orderStats?.processing ?? 0} detail="Đã xác nhận / đang thực hiện" />
            </div>
            <section className="card">
              <div className="card-heading"><div><div className="section-kicker">OPERATIONS</div><h2>Tình trạng xử lý đơn</h2></div><button className="secondary small" onClick={() => openSection("orders")}>Mở hàng đợi →</button></div>
              <div className="status-summary">
                {Object.entries({ pending: orderStats?.pending, confirmed: orderStats?.confirmed, processing: orderStats?.processing, completed: orderStats?.completed, cancelled: orderStats?.cancelled }).map(([key, value]) => <div key={key}><span className={"status-dot dot-" + key} /><b>{value ?? 0}</b><small>{STATUS_LABEL[key]}</small></div>)}
              </div>
            </section>
          </>}

          {section === "orders" && <section className="card order-queue-card">
            <div className="card-heading"><div><div className="section-kicker">ORDER OPERATIONS</div><h2>Đơn cần xử lý <span className="total-chip">{queueTotal}</span></h2></div><button className="secondary small" disabled={busy} onClick={() => changeQueueFilter()}>↻ Làm mới</button></div>
            <div className="queue-filters">
              <label>Trạng thái<select value={queueStatus} onChange={event => changeQueueFilter(event.target.value, queueModule, search)}>
                <option value="all">Tất cả trạng thái</option><option value="pending">Chờ tiếp nhận</option><option value="confirmed">Đã xác nhận</option><option value="processing">Đang xử lý</option><option value="completed">Hoàn tất</option><option value="cancelled">Đã hủy</option>
              </select></label>
              <label>Module<select value={queueModule} onChange={event => changeQueueFilter(queueStatus, event.target.value, search)}>
                <option value="all">Tất cả module</option><option value="mini_game_live">Mini Game Live</option><option value="app_tool">Thuê Tool</option><option value="buy_code">Mua Code</option><option value="otp_proxy">OTP & Proxy</option><option value="vip">VIP / Kho đặc quyền</option>
              </select></label>
              <label className="queue-search">Tìm đơn / user<input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === "Enter" && changeQueueFilter(queueStatus, queueModule, search)} placeholder="Mã đơn, tiêu đề, Telegram ID…" /></label>
              <button className="secondary" onClick={() => changeQueueFilter(queueStatus, queueModule, search)}>Tìm kiếm</button>
            </div>
            <div className="queue-table-wrap"><table className="queue-table">
              <thead><tr><th>MÃ ĐƠN / KHÁCH HÀNG</th><th>DỊCH VỤ</th><th>TRẠNG THÁI</th><th>GIÁ / THANH TOÁN</th><th></th></tr></thead>
              <tbody>{orders.map(order => <tr key={order.id}>
                <td><b>{order.orderNumber}</b><small>{order.customerName} · TG {order.userId}</small></td>
                <td><b>{MODULE_LABEL[order.module] || order.module}</b><small>{order.title} · SL {order.quantity}</small></td>
                <td><span className={"status-pill status-" + order.status}>{STATUS_LABEL[order.status] || order.status}</span></td>
                <td><b>{order.amount > 0 ? money(order.amount) : "Chờ báo giá"}</b><small>{order.paymentStatus === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}</small></td>
                <td><button className="row-action" onClick={() => openOrder(order.id)}>Chi tiết →</button></td>
              </tr>)}
              {!orders.length && <tr><td colSpan="5" className="table-empty">{busy ? "Đang tải dữ liệu…" : "Không có đơn phù hợp với bộ lọc."}</td></tr>}</tbody>
            </table></div>
            <p className="hint">Chỉ chuyển đơn sang đang xử lý sau khi khách hàng thanh toán số dư ví. Báo giá, trạng thái và lịch sử thao tác được ghi vết chi tiết.</p>
          </section>}

          {section === "orders" && selectedOrder && currentOrder && <section className="card order-detail-card">
            <div className="card-heading"><div><div className="section-kicker">ORDER DETAIL</div><h2>{currentOrder.orderNumber}</h2></div><button className="secondary small" onClick={() => setSelectedOrder(null)}>Đóng</button></div>
            <div className="detail-grid">
              <div><small>KHÁCH HÀNG</small><b>{currentOrder.customerName}</b><span>Telegram ID: {currentOrder.userId}</span></div>
              <div><small>MODULE</small><b>{MODULE_LABEL[currentOrder.module] || currentOrder.module}</b><span>Số lượng: {currentOrder.quantity}</span></div>
              <div><small>TRẠNG THÁI</small><b><span className={"status-pill status-" + currentOrder.status}>{STATUS_LABEL[currentOrder.status]}</span></b><span>Cập nhật: {new Date(currentOrder.updatedAt).toLocaleString("vi-VN")}</span></div>
              <div><small>GIÁ TRỊ</small><b>{currentOrder.amount > 0 ? money(currentOrder.amount) : "Chờ báo giá"}</b><span>{currentOrder.paymentStatus === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}</span></div>
            </div>
            <div className="detail-description"><small>NỘI DUNG YÊU CẦU</small><p>{currentOrder.title}</p><div>{currentOrder.description || "Không có ghi chú bổ sung."}</div></div>

            {currentOrder.status === "pending" && currentOrder.quote?.status !== "sent" && <form className="quote-admin-form" onSubmit={createQuote}>
              <div><div className="section-kicker">QUOTE TO CUSTOMER</div><h3>Tạo báo giá VND</h3></div>
              <label>Số tiền<input type="number" min="1" step="1" value={quoteAmount} onChange={event => setQuoteAmount(event.target.value)} required /></label>
              <label>Ghi chú báo giá<textarea value={quoteNote} onChange={event => setQuoteNote(event.target.value)} rows="2" maxLength="500" placeholder="Phạm vi, thời hạn, điều kiện dịch vụ…" /></label>
              <button className="primary-action" disabled={busy}>{busy ? "Đang gửi…" : "Gửi báo giá cho khách"}</button>
            </form>}

            {currentOrder.quote && <div className="quote-status-panel">
              <b>Báo giá gần nhất: {money(currentOrder.quote.amount)}</b>
              <span>{currentOrder.quote.status === "sent" ? "Đang chờ khách phản hồi" : currentOrder.quote.status === "accepted" ? "Khách đã chấp nhận" : currentOrder.quote.status === "rejected" ? "Khách đã từ chối" : currentOrder.quote.status}</span>
              {currentOrder.quote.note && <p>{currentOrder.quote.note}</p>}
            </div>}

            {availableTransitions.length > 0 ? <div className="transition-panel">
              <label>Ghi chú xử lý<textarea value={adminNote} onChange={event => setAdminNote(event.target.value)} rows="2" maxLength="500" placeholder="Ghi lại kết quả tiếp nhận hoặc lý do hủy…" /></label>
              <div className="transition-actions">{availableTransitions.map(next => {
                const requiresPayment = next === "processing" && currentOrder.paymentStatus !== "paid";
                return <button key={next} disabled={busy || requiresPayment} title={requiresPayment ? "Chờ khách thanh toán" : ""} className={next === "cancelled" ? "danger-action" : "primary-action"} onClick={() => transitionOrder(next)}>
                  {next === "confirmed" ? "✓ Xác nhận đơn" : next === "processing" ? "▶ Bắt đầu xử lý" : next === "completed" ? "✓ Hoàn tất" : "× Hủy đơn"}
                </button>;
              })}</div>
              {currentOrder.status === "confirmed" && currentOrder.paymentStatus !== "paid" && <p className="hint">Khách cần chấp nhận báo giá và thanh toán qua ví trước khi bạn bắt đầu cung cấp dịch vụ.</p>}
            </div> : <p className="hint">Đơn ở trạng thái cuối, không cho phép chuyển tiếp.</p>}

            <div className="event-history"><h3>Lịch sử xử lý</h3>{(selectedOrder.events || []).map(event => <div className="event-row" key={event.id}>
              <span className="event-bullet" /><div><b>{event.from_status ? STATUS_LABEL[event.from_status] + " → " : "Tạo mới → "}{STATUS_LABEL[event.to_status] || event.to_status}</b><small>{event.actor_label || event.actor_type} · {new Date(event.created_at).toLocaleString("vi-VN")}</small>{event.note && <p>{event.note}</p>}</div>
            </div>)}</div>
          </section>}

          {section === "deposits" && <section className="card order-queue-card">
            <div className="card-heading"><div><div className="section-kicker">WALLET OPERATIONS</div><h2>Yêu cầu nạp tiền</h2></div><button className="secondary small" disabled={busy} onClick={() => loadDeposits()}>↻ Làm mới</button></div>
            <div className="queue-filters">
              <label>Trạng thái<select value={depositStatus} onChange={async event => { setDepositStatus(event.target.value); setBusy(true); try { await loadDeposits(token, event.target.value); } catch(err) { setError(err.message); } finally { setBusy(false); } }}>
                <option value="pending">Chờ đối soát</option><option value="approved">Đã duyệt</option><option value="rejected">Đã từ chối</option><option value="all">Tất cả</option>
              </select></label>
              <label className="queue-search">Ghi chú xử lý<textarea rows="1" maxLength="500" value={depositNote} onChange={event => setDepositNote(event.target.value)} placeholder="Ghi chú hoặc mã giao dịch ngân hàng" /></label>
            </div>
            <div className="queue-table-wrap"><table className="queue-table">
              <thead><tr><th>MÃ THAM CHIẾU</th><th>THÀNH VIÊN</th><th>SỐ TIỀN</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
              <tbody>{deposits.map(item => <tr key={item.id}>
                <td><b>{item.reference}</b><small>{new Date(item.createdAt).toLocaleString("vi-VN")}</small></td>
                <td><b>{item.userName}</b><small>Telegram ID: {item.userId}</small></td>
                <td><b>{money(item.amount)}</b></td>
                <td><span className={"status-pill status-" + (item.status === "approved" ? "completed" : item.status === "rejected" ? "cancelled" : "pending")}>{item.status === "approved" ? "Đã cộng tiền" : item.status === "rejected" ? "Từ chối" : "Chờ đối soát"}</span></td>
                <td>{item.status === "pending" ? <div className="transition-actions"><button disabled={busy} className="primary-action" onClick={() => reviewDeposit(item, "approved")}>Duyệt & cộng tiền</button><button disabled={busy} className="danger-action" onClick={() => reviewDeposit(item, "rejected")}>Từ chối</button></div> : <small>{item.adminNote || "Đã xử lý"}</small>}</td>
              </tr>)}
              {!deposits.length && <tr><td colSpan="5" className="table-empty">Không có yêu cầu nạp tiền.</td></tr>}</tbody>
            </table></div>
            <p className="hint">Chỉ bấm duyệt sau khi đã xác minh tiền vào tài khoản ngân hàng. Thao tác duyệt ghi sổ cái ví.</p>
          </section>}

          {section === "catalog" && <>
            <section className="card catalog-editor">
              <div className="card-heading"><div><div className="section-kicker">SERVICE CATALOG</div><h2>{editingCatalogId ? "Chỉnh sửa sản phẩm / gói dịch vụ" : "Thêm sản phẩm hoặc gói dịch vụ"}</h2></div><div className="transition-actions">{editingCatalogId && <button className="secondary small" type="button" onClick={cancelCatalogEdit}>Hủy sửa</button>}<button className="secondary small" type="button" onClick={() => loadCatalog()}>↻ Làm mới</button></div></div>
              <form className="management-form" onSubmit={saveCatalogItem}>
                <label>Nhóm dịch vụ<select value={catalogForm.module} onChange={event => setCatalogForm({ ...catalogForm, module: event.target.value })}>
                  <option value="mini_game_live">Mini Game Live</option><option value="app_tool">Thuê Tool</option><option value="buy_code">Mua Code</option><option value="otp_proxy">OTP & Proxy</option><option value="vip">VIP / Kho đặc quyền</option>
                </select></label>
                <label>Slug<input value={catalogForm.slug} onChange={event => setCatalogForm({ ...catalogForm, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} maxLength="80" placeholder="tool-pro-30-days" required /></label>
                <label>Tên sản phẩm<input value={catalogForm.title} onChange={event => setCatalogForm({ ...catalogForm, title: event.target.value })} maxLength="100" required /></label>
                <label>Giá bán VND<input type="number" min="0" step="1" value={catalogForm.unitPrice} onChange={event => setCatalogForm({ ...catalogForm, unitPrice: event.target.value })} placeholder="Để trống nếu cần báo giá" /></label>
                <label>Thời hạn (ngày)<input type="number" min="1" max="3650" value={catalogForm.durationDays} onChange={event => setCatalogForm({ ...catalogForm, durationDays: event.target.value })} placeholder="Không áp dụng" /></label>
                <label>Tồn kho / số lượng<input type="number" min="0" max="1000000" value={catalogForm.stock} onChange={event => setCatalogForm({ ...catalogForm, stock: event.target.value })} placeholder="Để trống nếu không giới hạn" /></label>
                <label>Thứ tự hiển thị<input type="number" min="0" value={catalogForm.sortOrder} onChange={event => setCatalogForm({ ...catalogForm, sortOrder: event.target.value })} /></label>
                <label className="wide">Mô tả<textarea value={catalogForm.description} onChange={event => setCatalogForm({ ...catalogForm, description: event.target.value })} rows="3" maxLength="1000" /></label>
                <button disabled={busy}>{busy ? "Đang lưu…" : editingCatalogId ? "Lưu thay đổi danh mục" : "＋ Tạo sản phẩm trong hệ thống"}</button>
              </form>
            </section>
            <section className="card order-queue-card">
              <div className="card-heading"><div><div className="section-kicker">PUBLISHED CATALOG</div><h2>Danh mục hiện tại ({catalog.length})</h2></div></div>
              <div className="queue-table-wrap"><table className="queue-table">
                <thead><tr><th>NHÓM</th><th>SẢN PHẨM</th><th>GIÁ / THỜI HẠN</th><th>TỒN KHO</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
                <tbody>{catalog.map(item => <tr key={item.id}>
                  <td>{MODULE_LABEL[item.module] || item.module}</td>
                  <td><b>{item.title}</b><small>{item.slug}</small></td>
                  <td><b>{item.unit_price === null ? "Chờ báo giá" : money(item.unit_price)}</b><small>{item.duration_days ? item.duration_days + " ngày" : "Không giới hạn thời hạn"}</small></td>
                  <td>{item.stock === null ? "Không giới hạn" : item.stock}</td>
                  <td><span className={"status-pill " + (Number(item.is_active) ? "status-completed" : "status-cancelled")}>{Number(item.is_active) ? "Đang mở" : "Đã tắt"}</span></td>
                  <td><div className="transition-actions"><button className="row-action" type="button" disabled={busy} onClick={() => editCatalogItem(item)}>Sửa</button><button className="row-action" type="button" disabled={busy} onClick={() => setCatalogStatus(item, !Number(item.is_active))}>{Number(item.is_active) ? "Ngừng bán" : "Mở bán"}</button></div></td>
                </tr>)}
                {!catalog.length && <tr><td colSpan="6" className="table-empty">Chưa có sản phẩm. Tạo sản phẩm ở biểu mẫu phía trên.</td></tr>}</tbody>
              </table></div>
            </section>
          </>}

          {section === "giftcodes" && <>
            <section className="card">
              <div className="card-heading"><div><div className="section-kicker">REWARD OPERATIONS</div><h2>Tạo Giftcode mới</h2></div></div>
              <form className="management-form" onSubmit={createGiftcode}>
                <label>Điểm voucher thưởng<input type="number" min="1" max="100000000" value={giftcodeForm.rewardVoucher} onChange={event => setGiftcodeForm({ ...giftcodeForm, rewardVoucher: event.target.value })} required /></label>
                <label>Giới hạn lượt đổi<input type="number" min="1" max="100000" value={giftcodeForm.maxRedemptions} onChange={event => setGiftcodeForm({ ...giftcodeForm, maxRedemptions: event.target.value })} required /></label>
                <label>Hết hạn (UTC)<input type="datetime-local" value={giftcodeForm.expiresAt} onChange={event => setGiftcodeForm({ ...giftcodeForm, expiresAt: event.target.value })} /></label>
                <button disabled={busy}>{busy ? "Đang tạo…" : "Tạo mã Giftcode bảo mật"}</button>
              </form>
              {generatedGiftcode && <div className="one-time-secret">
                <strong>Mã vừa tạo – chỉ hiển thị trong phiên này</strong>
                <code>{generatedGiftcode.code}</code>
                <span>{Number(generatedGiftcode.rewardVoucher).toLocaleString("vi-VN")} điểm voucher · tối đa {generatedGiftcode.maxRedemptions} lượt</span>
                <button className="secondary" onClick={() => navigator.clipboard?.writeText(generatedGiftcode.code).then(() => setNotice("Đã sao chép Giftcode.")).catch(() => setError("Không thể sao chép mã."))}>Sao chép mã</button>
              </div>}
            </section>
            <section className="card order-queue-card">
              <div className="card-heading"><div><div className="section-kicker">GIFT CODE INVENTORY</div><h2>Danh sách Giftcode ({giftcodes.length})</h2></div><button className="secondary small" onClick={() => loadGiftcodes()}>↻ Làm mới</button></div>
              <div className="queue-table-wrap"><table className="queue-table">
                <thead><tr><th>MÃ / ID</th><th>THƯỞNG</th><th>LƯỢT ĐÃ ĐỔI</th><th>GIỚI HẠN</th><th>HẾT HẠN</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
                <tbody>{giftcodes.map(item => <tr key={item.id}>
                  <td><code>{item.code || item.id.slice(0, 12)}</code></td><td>{Number(item.rewardVoucher).toLocaleString("vi-VN")} voucher</td>
                  <td>{item.actualRedemptions}</td><td>{item.maxRedemptions}</td>
                  <td>{item.expiresAt ? new Date(item.expiresAt).toLocaleString("vi-VN") : "Không hết hạn"}</td>
                  <td><span className={"status-pill " + (item.isActive ? "status-completed" : "status-cancelled")}>{item.isActive ? "Đang hoạt động" : "Đã tắt"}</span></td>
                  <td><button className={item.isActive ? "danger-action" : "primary-action"} disabled={busy} onClick={() => setGiftcodeActive(item,!item.isActive)}>{item.isActive ? "Thu hồi" : "Kích hoạt"}</button></td>
                </tr>)}
                {!giftcodes.length && <tr><td colSpan="7" className="table-empty">Chưa tạo Giftcode nào.</td></tr>}</tbody>
              </table></div>
            </section>
          </>}

          {section === "support" && <>
            <section className="card order-queue-card">
              <div className="card-heading"><div><div className="section-kicker">CUSTOMER CARE</div><h2>Ticket hỗ trợ</h2></div><button className="secondary small" onClick={() => loadTickets()}>↻ Làm mới</button></div>
              <div className="queue-filters">
                <label>Trạng thái<select value={ticketStatus} onChange={async event => { setTicketStatus(event.target.value); try { await loadTickets(token, event.target.value); } catch (err) { setError(err.message); } }}>
                  <option value="all">Tất cả</option><option value="open">Mới mở</option><option value="in_progress">Đang xử lý</option><option value="awaiting_user">Chờ khách</option><option value="resolved">Đã giải quyết</option><option value="closed">Đã đóng</option>
                </select></label>
              </div>
              <div className="queue-table-wrap"><table className="queue-table">
                <thead><tr><th>MÃ TICKET</th><th>THÀNH VIÊN</th><th>TIÊU ĐỀ</th><th>TRẠNG THÁI</th><th></th></tr></thead>
                <tbody>{tickets.map(ticket => <tr key={ticket.id}>
                  <td><b>{ticket.ticket_number}</b><small>{new Date(ticket.created_at).toLocaleString("vi-VN")}</small></td>
                  <td><b>{ticket.customer_name}</b><small>Telegram ID: {ticket.user_id}</small></td>
                  <td><b>{ticket.subject}</b><small>{ticket.last_message || ""}</small></td>
                  <td>{TICKET_STATUS[ticket.status] || ticket.status}</td>
                  <td><button className="row-action" onClick={() => openTicket(ticket.id)}>Mở ticket →</button></td>
                </tr>)}
                {!tickets.length && <tr><td colSpan="5" className="table-empty">Không có ticket trong bộ lọc.</td></tr>}</tbody>
              </table></div>
            </section>
            {selectedTicket?.ticket && <section className="card">
              <div className="card-heading"><div><div className="section-kicker">TICKET DETAIL</div><h2>{selectedTicket.ticket.ticket_number} · {selectedTicket.ticket.subject}</h2></div><button className="secondary small" onClick={() => setSelectedTicket(null)}>Đóng</button></div>
              <div className="ticket-thread">{(selectedTicket.messages || []).map(message => <article className={"ticket-message " + message.sender_type} key={message.id}>
                <strong>{message.sender_type === "admin" ? "Admin / CSKH" : message.sender_type === "user" ? "Thành viên" : "Hệ thống"}</strong>
                <p>{message.message}</p><small>{new Date(message.created_at).toLocaleString("vi-VN")}</small>
              </article>)}</div>
              {!["resolved","closed"].includes(selectedTicket.ticket.status) && <form className="management-form" onSubmit={replyTicket}>
                <label className="wide">Phản hồi thành viên<textarea value={ticketReply} onChange={event => setTicketReply(event.target.value)} maxLength="3000" rows="3" required /></label>
                <button disabled={busy}>{busy ? "Đang gửi…" : "Gửi phản hồi"}</button>
              </form>}
              <div className="transition-actions">
                {Object.entries(TICKET_STATUS).filter(([status]) => status !== selectedTicket.ticket.status && !["resolved","closed"].includes(selectedTicket.ticket.status)).map(([status,label]) => <button key={status} className="secondary" disabled={busy} onClick={() => changeTicketStatus(selectedTicket.ticket,status)}>{label}</button>)}
              </div>
            </section>}
          </>}

          {section === "referrals" && <section className="card order-queue-card">
            <div className="card-heading"><div><div className="section-kicker">REFERRAL COMMISSIONS</div><h2>Hoa hồng giới thiệu</h2></div><button className="secondary small" onClick={() => loadCommissions()}>↻ Làm mới</button></div>
            <div className="queue-filters">
              <label>Trạng thái<select value={commissionStatus} onChange={async event => { setCommissionStatus(event.target.value); try { await loadCommissions(token,event.target.value); } catch (err) { setError(err.message); } }}>
                <option value="all">Tất cả</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt / chờ chi</option><option value="paid">Đã chi trả</option><option value="void">Đã hủy</option>
              </select></label>
            </div>
            <div className="queue-table-wrap"><table className="queue-table">
              <thead><tr><th>NGƯỜI GIỚI THIỆU</th><th>NGƯỜI ĐƯỢC MỜI</th><th>ĐƠN HÀNG</th><th>HOA HỒNG</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
              <tbody>{commissions.map(item => <tr key={item.id}>
                <td><b>{item.referrerName}</b><small>ID {item.referrerUserId}</small></td>
                <td><b>{item.referredName}</b><small>ID {item.referredUserId}</small></td>
                <td>{item.orderNumber || "—"}</td><td><b>{money(item.amount)}</b>{item.adminNote && <small>{item.adminNote}</small>}</td><td>{item.status}{item.reviewedBy && <small> · Duyệt: {item.reviewedBy}</small>}{item.paidBy && <small> · Chi: {item.paidBy}</small>}</td>
                <td><div className="transition-actions">
                  {item.status === "pending" && <button className="primary-action" disabled={busy} onClick={() => settleCommission(item,"approve")}>Duyệt</button>}
                  {item.status === "approved" && <button className="primary-action" disabled={busy} onClick={() => settleCommission(item,"pay")}>Chi vào ví</button>}
                  {["pending","approved"].includes(item.status) && <button className="danger-action" disabled={busy} onClick={() => settleCommission(item,"void")}>Hủy</button>}
                </div></td>
              </tr>)}
              {!commissions.length && <tr><td colSpan="6" className="table-empty">Chưa có hoa hồng.</td></tr>}</tbody>
            </table></div>
          </section>}

          {section === "releases" && <>
            <section className="card">
              <div className="card-heading"><div><div className="section-kicker">RELEASE MANAGEMENT</div><h2>Đăng tải ứng dụng</h2></div><span className="tag">RELEASE CENTER</span></div>
              <form className="upload-form" onSubmit={publish}>
                <label>Nền tảng<select value={platform} onChange={event => setPlatform(event.target.value)}><option>Android</option><option>iOS</option><option>Windows</option><option>macOS</option><option>Linux</option><option>Other</option></select></label>
                <label>Phiên bản<input value={version} onChange={event => setVersion(event.target.value)} placeholder="2.1.0" required /></label>
                <label className="wide">Ghi chú cập nhật<textarea value={notes} onChange={event => setNotes(event.target.value)} rows="3" placeholder="Nội dung cập nhật tính năng mới…" /></label>
                <button disabled={busy}>{busy ? "Đang xử lý…" : "↑ Phát hành phiên bản mới"}</button>
              </form>
            </section>
            <section className="card">
              <div className="card-heading"><div><div className="section-kicker">PUBLISHED</div><h2>Bản phát hành hiện có</h2></div><button className="secondary small" onClick={async () => { const result = await adminApi("/api/v1/releases"); setReleases(result.releases || []); }}>Làm mới</button></div>
              {releases.length === 0 ? <p className="hint">Chưa có bản phát hành.</p> : <div className="release-table">{releases.map(item => <div className="release-line" key={item.id}><b>{item.platform}</b><span>v{item.version}</span><small>{item.file_name} · {item.release_notes}</small><span className="tag">Đang công bố</span></div>)}</div>}
            </section>
          </>}

          {section === "webhook" && <section className="card">
            <div className="card-heading"><div><div className="section-kicker">BOT OPERATIONS</div><h2>Telegram webhook</h2></div><span className="tag">SYNC</span></div>
            <label className="key-field">Webhook setup key<input type="password" value={setupKey} onChange={event => setSetupKey(event.target.value)} autoComplete="off" placeholder="WEBHOOK_SETUP_KEY" /></label>
            <p className="description">Đăng ký và đồng bộ webhook Telegram cho hệ thống bot.</p>
            <button className="secondary" onClick={setupWebhook} disabled={busy}>↻ Đăng ký / đồng bộ webhook</button>
          </section>}

          <button className="logout" onClick={() => { setAuthorized(false); setToken("admin123"); setStats(null); setOrders([]); setSelectedOrder(null); setSelectedTicket(null); }}>Đăng xuất khỏi bảng điều khiển</button>
        </>}
        <footer>HENDY BOT ADMIN · Control Console</footer>
      </section>
    </main>
  );
}

function Stat({ title, value, detail }) {
  return <article className="stat-card"><span>{title}</span><strong>{value}</strong><small>{detail}</small></article>;
}
