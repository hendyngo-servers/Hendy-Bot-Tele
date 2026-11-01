import React, { useEffect, useMemo, useState } from "react";
import { adminApi } from "./services/api.js";

const STATUS_LABEL = {
  pending: "Chờ tiếp nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Đã hủy"
};
const MODULE_LABEL = {
  mini_game_live: "Mini Game Live",
  app_tool: "App / Tool",
  buy_code: "Mua Code",
  otp_proxy: "OTP & Proxy",
  vip: "VIP"
};
const NEXT_STATUSES = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["completed", "cancelled"],
  completed: [],
  cancelled: []
};
const money = (value) => new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " ₫";

export default function App() {
  const [token, setToken] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [section, setSection] = useState("orders");
  const [stats, setStats] = useState(null);
  const [releases, setReleases] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueStatus, setQueueStatus] = useState("all");
  const [queueModule, setQueueModule] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [adminNote, setAdminNote] = useState("");
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

  async function refresh(currentToken = token) {
    const [summary, published] = await Promise.all([
      adminApi("/api/v1/admin/stats", currentToken),
      adminApi("/api/v1/releases")
    ]);
    setStats(summary.stats);
    setReleases(published.releases || []);
    await loadQueue(currentToken);
    setAuthorized(true);
  }

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
  }, []);

  async function login(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await refresh(token);
      setNotice("Đã xác thực quản trị. Hàng đợi chỉ hiển thị qua API đã phân quyền.");
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
    try { await loadQueue(token, status, module, query); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function openOrder(orderId) {
    setBusy(true);
    setError("");
    setAdminNote("");
    try {
      const result = await adminApi("/api/v1/admin/orders/" + encodeURIComponent(orderId), token);
      setSelectedOrder(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function transitionOrder(nextStatus) {
    const order = selectedOrder?.order;
    if (!order) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi("/api/v1/admin/orders/" + encodeURIComponent(order.id) + "/status", token, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
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
      try { await loadQueue(); } catch {}
      try {
        const fresh = await adminApi("/api/v1/admin/orders/" + encodeURIComponent(order.id), token);
        setSelectedOrder(fresh);
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  async function publish(event) {
    event.preventDefault();
    if (!file || !version.trim()) {
      setError("Vui lòng chọn tệp và nhập phiên bản.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("platform", platform);
      data.append("version", version.trim());
      data.append("releaseNotes", notes.trim());
      await adminApi("/api/v1/admin/releases", token, { method: "POST", body: data });
      setFile(null);
      setVersion("");
      setNotes("");
      await refresh();
      setNotice("Đã tải tệp lên R2 và tạo bản phát hành.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
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
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const currentOrder = selectedOrder?.order;
  const availableTransitions = useMemo(() => NEXT_STATUSES[currentOrder?.status] || [], [currentOrder?.status]);

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><span>H</span><div><b>HENDY</b><small>CONTROL PLANE</small></div></div>
        <div className="side-label">WORKSPACE</div>
        {[
          ["overview", "▦", "Tổng quan"],
          ["orders", "▤", "Hàng đợi đơn hàng"],
          ["releases", "⇧", "Phát hành ứng dụng"],
          ["webhook", "⌁", "Telegram webhook"]
        ].map(([id, icon, label]) => <button key={id} className={"nav-item " + (section === id ? "active" : "")} onClick={() => setSection(id)}>
          {icon}<span>{label}</span>{id === "orders" && orderStats?.pending > 0 && <b className="nav-count">{orderStats.pending}</b>}
        </button>)}
        <div className="side-foot">CLOUDFLARE EDGE<br />Workers · D1 · R2</div>
      </aside>
      <section className="main-area">
        <header className="admin-header">
          <div><span className="crumb">HENDY / ADMIN</span><h1>{section === "orders" ? "Hàng đợi đơn hàng" : section === "releases" ? "Phát hành ứng dụng" : section === "webhook" ? "Telegram webhook" : "Trung tâm quản trị"}</h1></div>
          <span className="secure">● PRIVATE CONSOLE</span>
        </header>
        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}
        {!authorized ? <section className="card login-card">
          <div className="section-kicker">SECURE ACCESS</div><h2>Xác thực quản trị</h2>
          <p>Nhập ADMIN_API_TOKEN đã cấu hình bằng Wrangler Secret. Mở URL không cấp quyền xem hoặc xử lý đơn hàng.</p>
          <form onSubmit={login}>
            <label>Admin API token<input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required /></label>
            <button disabled={busy}>{busy ? "Đang xác thực…" : "Mở bảng điều khiển"}</button>
          </form>
        </section> : <>
          {section === "overview" && <>
            <div className="stats-grid">
              <Stat title="NGƯỜI DÙNG" value={stats?.users ?? "—"} detail="Dữ liệu D1" />
              <Stat title="TỔNG ĐƠN HÀNG" value={orderStats?.total ?? 0} detail="Đơn được lưu trong D1" />
              <Stat title="ĐANG CHỜ" value={orderStats?.pending ?? 0} detail="Cần nhân viên tiếp nhận" />
              <Stat title="ĐANG XỬ LÝ" value={orderStats?.processing ?? 0} detail="Đã xác nhận / đang thực hiện" />
            </div>
            <section className="card">
              <div className="card-heading"><div><div className="section-kicker">OPERATIONS</div><h2>Tình trạng xử lý đơn</h2></div><button className="secondary small" onClick={() => setSection("orders")}>Mở hàng đợi →</button></div>
              <div className="status-summary">
                {Object.entries({ pending: orderStats?.pending, confirmed: orderStats?.confirmed, processing: orderStats?.processing, completed: orderStats?.completed, cancelled: orderStats?.cancelled }).map(([key, value]) => <div key={key}><span className={"status-dot dot-" + key} /><b>{value ?? 0}</b><small>{STATUS_LABEL[key]}</small></div>)}
              </div>
            </section>
          </>}

          {section === "orders" && <section className="card order-queue-card">
            <div className="card-heading"><div><div className="section-kicker">ORDER OPERATIONS / D1</div><h2>Đơn cần xử lý <span className="total-chip">{queueTotal}</span></h2></div><button className="secondary small" disabled={busy} onClick={() => changeQueueFilter()}>↻ Làm mới</button></div>
            <div className="queue-filters">
              <label>Trạng thái<select value={queueStatus} onChange={(e) => changeQueueFilter(e.target.value, queueModule, search)}>
                <option value="all">Tất cả trạng thái</option><option value="pending">Chờ tiếp nhận</option><option value="confirmed">Đã xác nhận</option><option value="processing">Đang xử lý</option><option value="completed">Hoàn tất</option><option value="cancelled">Đã hủy</option>
              </select></label>
              <label>Module<select value={queueModule} onChange={(e) => changeQueueFilter(queueStatus, e.target.value, search)}>
                <option value="all">Tất cả module</option><option value="mini_game_live">Mini Game Live</option><option value="app_tool">App / Tool</option><option value="buy_code">Mua Code</option><option value="otp_proxy">OTP & Proxy</option><option value="vip">VIP</option>
              </select></label>
              <label className="queue-search">Tìm đơn / user<input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changeQueueFilter(queueStatus, queueModule, search)} placeholder="Mã đơn, tiêu đề, Telegram ID…" /></label>
              <button className="secondary" onClick={() => changeQueueFilter(queueStatus, queueModule, search)}>Tìm kiếm</button>
            </div>
            <div className="queue-table-wrap">
              <table className="queue-table">
                <thead><tr><th>MÃ ĐƠN / KHÁCH HÀNG</th><th>DỊCH VỤ</th><th>TRẠNG THÁI</th><th>GIÁ</th><th></th></tr></thead>
                <tbody>{orders.map((order) => <tr key={order.id}>
                  <td><b>{order.orderNumber}</b><small>{order.customerName} · TG {order.userId}</small></td>
                  <td><b>{MODULE_LABEL[order.module] || order.module}</b><small>{order.title} · SL {order.quantity}</small></td>
                  <td><span className={"status-pill status-" + order.status}>{STATUS_LABEL[order.status] || order.status}</span></td>
                  <td><b>{order.amount > 0 ? money(order.amount) : "Chờ báo giá"}</b></td>
                  <td><button className="row-action" onClick={() => openOrder(order.id)}>Chi tiết →</button></td>
                </tr>)}
                {!orders.length && <tr><td colSpan="5" className="table-empty">{busy ? "Đang tải dữ liệu…" : "Không có đơn phù hợp với bộ lọc."}</td></tr>}</tbody>
              </table>
            </div>
            <p className="hint">Mỗi lần đổi trạng thái đều cần đúng trạng thái hiện tại, ghi lịch sử D1 và khóa chống gửi lặp. Giá chỉ hiển thị khi được cập nhật ở bước báo giá riêng.</p>
          </section>}

          {section === "orders" && selectedOrder && currentOrder && <section className="card order-detail-card">
            <div className="card-heading"><div><div className="section-kicker">ORDER DETAIL</div><h2>{currentOrder.orderNumber}</h2></div><button className="secondary small" onClick={() => setSelectedOrder(null)}>Đóng</button></div>
            <div className="detail-grid">
              <div><small>KHÁCH HÀNG</small><b>{currentOrder.customerName}</b><span>Telegram ID: {currentOrder.userId}</span></div>
              <div><small>MODULE</small><b>{MODULE_LABEL[currentOrder.module] || currentOrder.module}</b><span>Số lượng: {currentOrder.quantity}</span></div>
              <div><small>TRẠNG THÁI</small><b><span className={"status-pill status-" + currentOrder.status}>{STATUS_LABEL[currentOrder.status]}</span></b><span>Cập nhật: {new Date(currentOrder.updatedAt).toLocaleString("vi-VN")}</span></div>
              <div><small>GIÁ TRỊ</small><b>{currentOrder.amount > 0 ? money(currentOrder.amount) : "Chờ báo giá"}</b><span>Không phát sinh thu tiền trong thao tác này</span></div>
            </div>
            <div className="detail-description"><small>NỘI DUNG YÊU CẦU</small><p>{currentOrder.title}</p><div>{currentOrder.description || "Không có ghi chú bổ sung."}</div></div>
            {availableTransitions.length > 0 ? <div className="transition-panel">
              <label>Ghi chú xử lý<textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows="2" maxLength="500" placeholder="Ghi lại kết quả tiếp nhận hoặc lý do hủy…" /></label>
              <div className="transition-actions">{availableTransitions.map((next) => <button key={next} disabled={busy} className={next === "cancelled" ? "danger-action" : "primary-action"} onClick={() => transitionOrder(next)}>
                {next === "confirmed" ? "✓ Xác nhận đơn" : next === "processing" ? "▶ Bắt đầu xử lý" : next === "completed" ? "✓ Hoàn tất" : "× Hủy đơn"}
              </button>)}</div>
            </div> : <p className="hint">Đơn ở trạng thái cuối, không cho phép chuyển tiếp.</p>}
            <div className="event-history"><h3>Lịch sử xử lý</h3>{(selectedOrder.events || []).map((event) => <div className="event-row" key={event.id}>
              <span className="event-bullet" /><div><b>{event.from_status ? STATUS_LABEL[event.from_status] + " → " : "Tạo mới → "}{STATUS_LABEL[event.to_status] || event.to_status}</b><small>{event.actor_label || event.actor_type} · {new Date(event.created_at).toLocaleString("vi-VN")}</small>{event.note && <p>{event.note}</p>}</div>
            </div>)}</div>
          </section>}

          {section === "releases" && <>
            <section className="card">
              <div className="card-heading"><div><div className="section-kicker">RELEASE MANAGEMENT</div><h2>Đăng tải ứng dụng</h2></div><span className="tag">D1 + R2</span></div>
              <form className="upload-form" onSubmit={publish}>
                <label>Nền tảng<select value={platform} onChange={(e) => setPlatform(e.target.value)}><option>Android</option><option>iOS</option><option>Windows</option><option>macOS</option><option>Linux</option><option>Other</option></select></label>
                <label>Phiên bản<input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.0.0" required /></label>
                <label className="wide">Tệp phát hành<input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label>
                <label className="wide">Ghi chú<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="3" placeholder="Nội dung cập nhật…" /></label>
                <button disabled={busy}>{busy ? "Đang xử lý…" : "↑ Tải lên & phát hành"}</button>
              </form>
              <p className="hint">Giới hạn API: 100 MB mỗi tệp. Chỉ người quản trị đã xác thực mới được ghi vào R2.</p>
            </section>
            <section className="card">
              <div className="card-heading"><div><div className="section-kicker">PUBLISHED</div><h2>Bản phát hành hiện có</h2></div><button className="secondary small" onClick={() => refresh()}>Làm mới</button></div>
              {releases.length === 0 ? <p className="hint">Chưa có bản phát hành.</p> : <div className="release-table">{releases.map((item) => <div className="release-line" key={item.id}><b>{item.platform}</b><span>v{item.version}</span><small>{item.file_name}</small><a href={(import.meta.env.VITE_API_BASE_URL || "") + "/api/v1/releases/" + item.id + "/download"} target="_blank" rel="noreferrer">Tải thử ↗</a></div>)}</div>}
            </section>
          </>}

          {section === "webhook" && <section className="card">
            <div className="card-heading"><div><div className="section-kicker">BOT OPERATIONS</div><h2>Telegram webhook</h2></div><span className="tag">SECRET HEADER</span></div>
            <label className="key-field">Webhook setup key<input type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} autoComplete="off" placeholder="WEBHOOK_SETUP_KEY" /></label>
            <p className="description">Đăng ký webhook cho Worker bằng WEBHOOK_SECRET_TOKEN đã cài đặt ở Cloudflare.</p>
            <button className="secondary" onClick={setupWebhook} disabled={busy || !setupKey}>↻ Đăng ký / đồng bộ webhook</button>
          </section>}

          <button className="logout" onClick={() => { setAuthorized(false); setToken(""); setSetupKey(""); setStats(null); setOrders([]); setSelectedOrder(null); }}>Đăng xuất khỏi bảng điều khiển</button>
        </>}
        <footer>HENDY BOT ADMIN · Cloudflare Workers / Pages / D1 / R2</footer>
      </section>
    </main>
  );
}

function Stat({ title, value, detail }) {
  return <article className="stat-card"><span>{title}</span><strong>{value}</strong><small>{detail}</small></article>;
}
