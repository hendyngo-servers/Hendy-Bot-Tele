import { useCallback, useEffect, useState } from 'react';

const ADMIN_TABS = [
  ['overview', 'Tổng quan'],
  ['settings', 'QR & Thanh toán'],
  ['deposits', 'Duyệt nạp'],
  ['catalog', 'Danh mục'],
  ['orders', 'Đơn hàng'],
  ['giftcodes', 'Giftcode'],
  ['users', 'Thành viên'],
  ['tickets', 'Hỗ trợ'],
  ['broadcast', 'Thông báo']
];

const money = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ';
const dateText = value => value ? new Date(value).toLocaleString('vi-VN') : '—';

async function api(path, initData, options = {}) {
  const response = await fetch('/api/mini' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.message || 'Không thể thực hiện yêu cầu.');
  }
  return body.data;
}

function Notice({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="notice" role="status">
      <span>{message}</span>
      <button onClick={onClose} aria-label="Đóng">×</button>
    </div>
  );
}

function Empty({ children = 'Chưa có dữ liệu.' }) {
  return <div className="empty-state"><span>◌</span><p>{children}</p></div>;
}

export default function App() {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || '';

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState('');
  const [adminTab, setAdminTab] = useState('overview');

  const [adminData, setAdminData] = useState(null);
  const [adminSettings, setAdminSettings] = useState(null);
  const [adminDeposits, setAdminDeposits] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminCatalog, setAdminCatalog] = useState([]);
  const [adminGiftcodes, setAdminGiftcodes] = useState([]);
  const [adminTickets, setAdminTickets] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);

  const [editingItem, setEditingItem] = useState(null);
  const [catalogForm, setCatalogForm] = useState({
    category: 'tool',
    name: '',
    description: '',
    price: '0',
    durationDays: '0',
    vipLevel: '0',
    stock: '',
    active: true
  });
  const [giftForm, setGiftForm] = useState({
    code: '',
    rewardType: 'balance',
    rewardValue: '50000',
    maxUses: '1',
    expiresAt: ''
  });
  const [memberAdjustments, setMemberAdjustments] = useState({});
  const [ticketReplies, setTicketReplies] = useState({});
  const [broadcastMessage, setBroadcastMessage] = useState('');

  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    telegram?.setHeaderColor?.('#101b2b');
    telegram?.setBackgroundColor?.('#0b1422');
  }, [telegram]);

  const loadAdminTab = useCallback(async (tab, initDataValue = initData) => {
    if (!session?.isAdmin) throw new Error('Bạn không có quyền quản trị.');
    setAdminTab(tab);
    if (tab === 'overview') setAdminData(await api('/admin/overview', initDataValue));
    if (tab === 'settings') {
      const result = await api('/admin/settings', initDataValue);
      setAdminSettings({ ...result, payment: { ...result.payment } });
    }
    if (tab === 'deposits') setAdminDeposits(await api('/admin/deposits', initDataValue));
    if (tab === 'catalog') setAdminCatalog(await api('/admin/catalog', initDataValue));
    if (tab === 'orders') setAdminOrders(await api('/admin/orders', initDataValue));
    if (tab === 'giftcodes') setAdminGiftcodes(await api('/admin/giftcodes', initDataValue));
    if (tab === 'tickets') setAdminTickets(await api('/admin/tickets', initDataValue));
    if (tab === 'users') setAdminUsers(await api('/admin/users', initDataValue));
  }, [initData, session]);

  const loadSession = useCallback(async () => {
    if (!initData) {
      setLoading(false);
      setAccessDenied(true);
      return;
    }

    setLoading(true);
    setAccessDenied(false);
    try {
      const data = await api('/session', initData);
      if (!data?.isAdmin) {
        setAccessDenied(true);
        setSession(null);
        return;
      }
      setSession(data);
    } catch (error) {
      setSession(null);
      setAccessDenied(true);
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    if (loading || !session?.isAdmin) return;
    loadAdminTab('overview').catch(error => setNotice(error.message));
  }, [loading, session, loadAdminTab]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refreshDashboard() {
    setBusy(true);
    try {
      await loadAdminTab(adminTab);
      setNotice('Đã cập nhật dữ liệu quản trị.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function adminAction(path, method, body, successMessage) {
    setBusy(true);
    try {
      await api(path, initData, {
        method,
        body: JSON.stringify(body || {})
      });
      await loadAdminTab(adminTab);
      setNotice(successMessage || 'Đã cập nhật dữ liệu.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePaymentSettings(event) {
    event.preventDefault();
    if (!adminSettings) return;
    await adminAction('/admin/settings', 'PUT', {
      payment: adminSettings.payment,
      botUsername: adminSettings.payment.botUsername || adminSettings.botUsername || '',
      groupChatUrl: adminSettings.payment.groupChatUrl || '',
      newsChannelUrl: adminSettings.payment.newsChannelUrl || '',
      supportUsername: adminSettings.payment.supportUsername || '',
      referralCommissionPercent: Number(
        adminSettings.payment.referralCommissionPercent ??
        adminSettings.referralCommissionPercent ?? 0
      )
    }, 'Đã lưu cấu hình QR, thanh toán và liên kết Bot.');
  }

  async function uploadQrImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setNotice('Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP.');
      return;
    }
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setNotice('Ảnh QR phải nhỏ hơn hoặc bằng 2 MB.');
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
      const result = await api('/admin/assets/qr', initData, {
        method: 'POST',
        body: JSON.stringify({ dataUrl })
      });
      setAdminSettings(current => ({
        ...current,
        payment: {
          ...current.payment,
          qrImageKey: result.key,
          qrImageUrl: ''
        },
        qrPreviewUrl: result.previewUrl
      }));
      setNotice('Đã tải ảnh QR lên Cloudflare R2.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCatalogItem(event) {
    event.preventDefault();
    const body = {
      ...catalogForm,
      price: Number(catalogForm.price),
      durationDays: Number(catalogForm.durationDays),
      vipLevel: Number(catalogForm.vipLevel || 0),
      stock: catalogForm.stock === '' ? null : Number(catalogForm.stock)
    };

    setBusy(true);
    try {
      if (editingItem) {
        await api('/admin/catalog/' + editingItem, initData, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await api('/admin/catalog', initData, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      setEditingItem(null);
      setCatalogForm({
        category: 'tool',
        name: '',
        description: '',
        price: '0',
        durationDays: '0',
        vipLevel: '0',
        stock: '',
        active: true
      });
      setAdminCatalog(await api('/admin/catalog', initData));
      setNotice('Đã lưu sản phẩm/dịch vụ.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createGiftcode(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/admin/giftcodes', initData, {
        method: 'POST',
        body: JSON.stringify({
          ...giftForm,
          rewardValue: Number(giftForm.rewardValue),
          maxUses: Number(giftForm.maxUses),
          expiresAt: giftForm.expiresAt || null
        })
      });
      setGiftForm({
        code: '',
        rewardType: 'balance',
        rewardValue: '50000',
        maxUses: '1',
        expiresAt: ''
      });
      setAdminGiftcodes(await api('/admin/giftcodes', initData));
      setNotice('Đã tạo giftcode.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMember(userId) {
    const adjustment = memberAdjustments[userId] || {};
    await adminAction('/admin/users/' + encodeURIComponent(userId), 'PATCH', {
      ...(adjustment.balanceDelta !== undefined && adjustment.balanceDelta !== ''
        ? { balanceDelta: Number(adjustment.balanceDelta) } : {}),
      ...(adjustment.vipLevel !== undefined && adjustment.vipLevel !== ''
        ? { vipLevel: Number(adjustment.vipLevel) } : {})
    }, 'Đã cập nhật thành viên.');
    setMemberAdjustments(current => ({ ...current, [userId]: {} }));
  }

  function closeAdmin() {
    telegram?.close?.();
  }

  if (loading) {
    return (
      <main className="gate-page">
        <div className="brand-symbol">H</div>
        <h1>Đang xác thực Admin…</h1>
        <div className="loader" />
      </main>
    );
  }

  if (!session?.isAdmin || accessDenied) {
    return (
      <main className="gate-page">
        <div className="brand-symbol">H</div>
        <p className="eyebrow">HENDY CYBERTECH</p>
        <h1>Mini App chỉ dành cho Admin</h1>
        <p className="muted">
          Menu thành viên được xử lý trực tiếp trong Telegram Bot.
          Hãy quay lại Bot và gửi /menu để sử dụng các chức năng thành viên.
        </p>
        <button className="primary-button" onClick={closeAdmin}>Đóng Mini App</button>
        <Notice message={notice} onClose={() => setNotice('')} />
      </main>
    );
  }

  return (
    <div className="app-shell admin-app-shell">
      <main className="admin-dashboard">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <span className="admin-brand-mark">H</span>
            <div><strong>HENDY</strong><small>CONTROL CENTER</small></div>
          </div>

          <div className="admin-account">
            <span className="admin-account-avatar">
              {(session.profile.name || 'A').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{session.profile.name}</strong>
              <small>ADMIN · {session.profile.id}</small>
            </div>
            <span className="admin-online-dot" />
          </div>

          <div className="admin-nav-label">QUẢN TRỊ HỆ THỐNG</div>
          <nav className="admin-side-nav">
            {ADMIN_TABS.map(([id, label]) => {
              const meta = {
                overview: ['▦', 'Tổng quan hệ thống'],
                settings: ['⌘', 'Ngân hàng & QR'],
                deposits: ['↧', 'Duyệt giao dịch'],
                catalog: ['▤', 'Sản phẩm & dịch vụ'],
                orders: ['▣', 'Xử lý đơn hàng'],
                giftcodes: ['✳', 'Mã quà tặng'],
                users: ['♙', 'Tài khoản thành viên'],
                tickets: ['✉', 'Chăm sóc khách hàng'],
                broadcast: ['◉', 'Thông báo hàng loạt']
              }[id];

              return (
                <button
                  key={id}
                  className={adminTab === id ? 'active' : ''}
                  onClick={() => loadAdminTab(id).catch(error => setNotice(error.message))}
                >
                  <span className="admin-nav-icon">{meta[0]}</span>
                  <span className="admin-nav-copy">
                    <strong>{label}</strong>
                    <small>{meta[1]}</small>
                  </span>
                  {adminTab === id && <span className="admin-nav-active">●</span>}
                </button>
              );
            })}
          </nav>

          <div className="admin-sidebar-bottom">
            <span className="admin-secure-label">● KẾT NỐI BẢO MẬT</span>
            <button onClick={closeAdmin}>↩ Đóng bảng quản trị</button>
            <small>HENDY CYBERTECH · ADMIN</small>
          </div>
        </aside>

        <section className="admin-workspace">
          <header className="admin-topbar">
            <div>
              <div className="admin-breadcrumb">
                HENDY CONTROL CENTER <span>/</span>
                {ADMIN_TABS.find(([id]) => id === adminTab)?.[1] || 'Tổng quan'}
              </div>
              <h1>{ADMIN_TABS.find(([id]) => id === adminTab)?.[1] || 'Tổng quan'}</h1>
              <p>Xin chào {session.profile.name}. Theo dõi và vận hành hệ thống Hendy tại đây.</p>
            </div>
            <div className="admin-top-actions">
              <span className="admin-live-status"><i /> HỆ THỐNG ADMIN</span>
              <button onClick={refreshDashboard} disabled={busy}>⟳ Làm mới</button>
              <button className="admin-mobile-home" onClick={closeAdmin}>Đóng Admin</button>
            </div>
          </header>

          <div className="admin-content">
            {adminTab === 'overview' && (
              <>
                <section className="admin-stats">
                  {[
                    ['Thành viên', adminData?.totals?.users],
                    ['Tài khoản liên kết', adminData?.totals?.linkedAccounts],
                    ['Nạp chờ duyệt', adminData?.totals?.pendingDeposits],
                    ['Đơn chờ xử lý', adminData?.totals?.pendingOrders],
                    ['Yêu cầu hỗ trợ', adminData?.totals?.openTickets]
                  ].map(([label, value]) => (
                    <div key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>
                  ))}
                </section>

                <section className="admin-integration-status">
                  <article>
                    <span className="admin-integration-mark">D1</span>
                    <div><strong>Cloudflare D1</strong><small>{adminData?.integrations?.database === 'cloudflare-d1' ? 'Cơ sở dữ liệu đã kết nối' : 'Chưa kết nối D1'}</small></div>
                    <b className={adminData?.integrations?.database === 'cloudflare-d1' ? 'connected' : 'disconnected'}>{adminData?.integrations?.database === 'cloudflare-d1' ? '● CONNECTED' : '● OFFLINE'}</b>
                  </article>
                  <article>
                    <span className="admin-integration-mark r2">R2</span>
                    <div><strong>Cloudflare R2</strong><small>Object Storage · ảnh QR và tài liệu</small></div>
                    <b className={adminData?.integrations?.objectStorage === 'cloudflare-r2' ? 'connected' : 'disconnected'}>{adminData?.integrations?.objectStorage === 'cloudflare-r2' ? '● CONNECTED' : '● OFFLINE'}</b>
                  </article>
                </section>

                <section className="admin-overview-lower">
                  <article className="admin-welcome-panel">
                    <span className="admin-panel-kicker">HENDY OPERATIONS</span>
                    <h2>Trung tâm vận hành</h2>
                    <p>Quản lý thanh toán, dịch vụ, thành viên và chăm sóc khách hàng từ một nơi.</p>
                    <div className="admin-shortcuts">
                      <button onClick={() => loadAdminTab('deposits').catch(error => setNotice(error.message))}>↧ Duyệt nạp tiền</button>
                      <button onClick={() => loadAdminTab('catalog').catch(error => setNotice(error.message))}>＋ Thêm dịch vụ</button>
                      <button onClick={() => loadAdminTab('broadcast').catch(error => setNotice(error.message))}>◉ Gửi thông báo</button>
                    </div>
                  </article>

                  <article className="admin-activity-panel">
                    <div className="admin-panel-heading">
                      <div><span className="admin-panel-kicker">MEMBERS</span><h2>Thành viên mới</h2></div>
                      <button onClick={() => loadAdminTab('users').catch(error => setNotice(error.message))}>Xem tất cả →</button>
                    </div>
                    {adminData?.users?.length ? adminData.users.slice(0, 6).map(member => (
                      <div className="admin-mini-member" key={member.id}>
                        <span>{(member.name || 'U').slice(0, 1).toUpperCase()}</span>
                        <div><strong>{member.name}</strong><small>ID {member.id}</small></div>
                        <b>VIP {member.vipLevel || 0}</b>
                      </div>
                    )) : <Empty>Chưa có thành viên được ghi nhận.</Empty>}
                  </article>
                </section>
              </>
            )}

            {adminTab === 'settings' && adminSettings && (
              <section className="panel">
                <h2>Cấu hình QR & tài khoản nhận tiền</h2>
                <form className="form-stack" onSubmit={savePaymentSettings}>
                  <label>Mã BIN ngân hàng<input value={adminSettings.payment.bankBin || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankBin: e.target.value } }))} placeholder="VD: 970422" /></label>
                  <label>Tên ngân hàng<input value={adminSettings.payment.bankName || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankName: e.target.value } }))} /></label>
                  <label>Số tài khoản<input value={adminSettings.payment.bankAccount || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankAccount: e.target.value } }))} /></label>
                  <label>Chủ tài khoản<input value={adminSettings.payment.bankAccountName || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankAccountName: e.target.value } }))} /></label>
                  <label>URL ảnh QR ngoài (tùy chọn, HTTPS)<input value={adminSettings.payment.qrImageUrl || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, qrImageUrl: e.target.value, qrImageKey: '' }, qrPreviewUrl: e.target.value }))} placeholder="https://..." /></label>
                  <label>Tải ảnh QR lên Cloudflare R2 (PNG/JPEG/WebP, tối đa 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadQrImage} disabled={busy} /></label>
                  {adminSettings.payment.qrImageKey && <p className="form-hint">Ảnh QR đang được lưu trong R2: {adminSettings.payment.qrImageKey}</p>}
                  <label>Username Bot Telegram (không có @)<input value={adminSettings.payment.botUsername || adminSettings.botUsername || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, botUsername: e.target.value } }))} placeholder="HendyBot" /></label>
                  <label>Liên kết nhóm chat (HTTPS)<input value={adminSettings.payment.groupChatUrl || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, groupChatUrl: e.target.value } }))} placeholder="https://t.me/..." /></label>
                  <label>Liên kết kênh thông báo (HTTPS)<input value={adminSettings.payment.newsChannelUrl || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, newsChannelUrl: e.target.value } }))} placeholder="https://t.me/..." /></label>
                  <label>Username CSKH (không có @)<input value={adminSettings.payment.supportUsername || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, supportUsername: e.target.value } }))} placeholder="HendySupport" /></label>
                  <label>Mức nạp tối thiểu<input type="number" min="10000" max="100000000" value={adminSettings.payment.minDeposit || 10000} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, minDeposit: Number(e.target.value) } }))} /></label>
                  <label>Hướng dẫn chuyển khoản<textarea rows="3" value={adminSettings.payment.instructions || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, instructions: e.target.value } }))} /></label>
                  <label>Hoa hồng REF (%)<input type="number" min="0" max="20" step="0.1" value={adminSettings.payment.referralCommissionPercent ?? adminSettings.referralCommissionPercent ?? 0} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, referralCommissionPercent: Number(e.target.value) } }))} /></label>
                  <button className="primary-button" disabled={busy}>Lưu cấu hình thanh toán</button>
                </form>
                {(adminSettings.qrPreviewUrl || adminSettings.payment.qrImageUrl) && <img className="qr-preview" src={adminSettings.qrPreviewUrl || adminSettings.payment.qrImageUrl} alt="QR cấu hình" />}
              </section>
            )}

            {adminTab === 'deposits' && (
              <section className="panel">
                <h2>Yêu cầu nạp tiền</h2>
                {adminDeposits.length ? adminDeposits.map(item => (
                  <article className="admin-record" key={item.id}>
                    <div>
                      <strong>{money(item.amount)}</strong>
                      <small>{item.reference} · UID {item.userId}</small>
                      <small>{dateText(item.createdAt)}</small>
                      <span className={'status ' + item.status}>{item.status}</span>
                    </div>
                    {item.status === 'pending' && (
                      <div className="record-actions">
                        <button onClick={() => adminAction('/admin/deposits/' + item.id, 'PATCH', { status: 'paid' }, 'Đã duyệt nạp và cộng số dư.')} disabled={busy}>Duyệt</button>
                        <button className="danger-button" onClick={() => adminAction('/admin/deposits/' + item.id, 'PATCH', { status: 'rejected' }, 'Đã từ chối yêu cầu nạp.')} disabled={busy}>Từ chối</button>
                      </div>
                    )}
                  </article>
                )) : <Empty>Chưa có yêu cầu nạp tiền.</Empty>}
              </section>
            )}

            {adminTab === 'catalog' && (
              <section className="panel">
                <h2>{editingItem ? 'Chỉnh sửa danh mục' : 'Thêm sản phẩm / dịch vụ'}</h2>
                <form className="form-stack" onSubmit={saveCatalogItem}>
                  <label>Nhóm<select value={catalogForm.category} onChange={e => setCatalogForm(v => ({ ...v, category: e.target.value }))}><option value="tool">Thuê Tool</option><option value="code">Mua Code</option><option value="otp_proxy">OTP & Proxy</option><option value="vip">Nâng cấp VIP</option><option value="duel">Ghép đối đầu</option></select></label>
                  <label>Tên sản phẩm<input value={catalogForm.name} onChange={e => setCatalogForm(v => ({ ...v, name: e.target.value }))} minLength="2" maxLength="100" required /></label>
                  <label>Mô tả<input value={catalogForm.description} onChange={e => setCatalogForm(v => ({ ...v, description: e.target.value }))} maxLength="500" /></label>
                  <label>Giá (VNĐ)<input type="number" min="0" value={catalogForm.price} onChange={e => setCatalogForm(v => ({ ...v, price: e.target.value }))} required /></label>
                  <label>Thời hạn (ngày, 0 nếu không áp dụng)<input type="number" min="0" value={catalogForm.durationDays} onChange={e => setCatalogForm(v => ({ ...v, durationDays: e.target.value }))} /></label>
                  <label>Cấp VIP nhận được (chỉ áp dụng cho danh mục VIP)<input type="number" min="0" max="10" value={catalogForm.vipLevel || 0} onChange={e => setCatalogForm(v => ({ ...v, vipLevel: e.target.value }))} /></label>
                  <label>Tồn kho (để trống = không giới hạn)<input type="number" min="0" value={catalogForm.stock} onChange={e => setCatalogForm(v => ({ ...v, stock: e.target.value }))} /></label>
                  <label className="check-label"><input type="checkbox" checked={catalogForm.active} onChange={e => setCatalogForm(v => ({ ...v, active: e.target.checked }))} /> Đang hiển thị</label>
                  <button className="primary-button" disabled={busy}>{editingItem ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</button>
                  {editingItem && <button type="button" className="back-button" onClick={() => { setEditingItem(null); setCatalogForm({ category: 'tool', name: '', description: '', price: '0', durationDays: '0', vipLevel: '0', stock: '', active: true }); }}>Hủy chỉnh sửa</button>}
                </form>
                <h2>Danh mục hiện tại</h2>
                {adminCatalog.length ? adminCatalog.map(item => (
                  <article className="admin-record" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.category} · {money(item.price)} · {item.durationDays || 0} ngày</small>
                      <span className="status">{item.active ? 'Đang bán' : 'Đã ẩn'}</span>
                    </div>
                    <div className="record-actions">
                      <button onClick={() => { setEditingItem(item.id); setCatalogForm({ ...item, price: String(item.price), durationDays: String(item.durationDays), vipLevel: String(item.vipLevel || 0), stock: item.stock === null ? '' : String(item.stock) }); }}>Sửa</button>
                      <button className="danger-button" onClick={() => adminAction('/admin/catalog/' + item.id, 'DELETE', {}, 'Đã xóa danh mục.')} disabled={busy}>Xóa</button>
                    </div>
                  </article>
                )) : <Empty>Chưa có sản phẩm/dịch vụ.</Empty>}
              </section>
            )}

            {adminTab === 'orders' && (
              <section className="panel">
                <h2>Đơn hàng dịch vụ</h2>
                {adminOrders.length ? adminOrders.map(item => (
                  <article className="admin-record" key={item.id}>
                    <div>
                      <strong>{item.itemName}</strong>
                      <small>UID {item.userId} · {money(item.amount)}</small>
                      <small>{dateText(item.createdAt)}</small>
                      <span className={'status ' + item.status}>{item.status === 'pending' ? 'Chờ xử lý' : item.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}</span>
                    </div>
                    {item.status === 'pending' && (
                      <div className="record-actions">
                        <button onClick={() => adminAction('/admin/orders/' + item.id, 'PATCH', { status: 'approved' }, 'Đã duyệt đơn và trừ số dư.')} disabled={busy}>Duyệt</button>
                        <button className="danger-button" onClick={() => adminAction('/admin/orders/' + item.id, 'PATCH', { status: 'rejected' }, 'Đã từ chối đơn.')} disabled={busy}>Từ chối</button>
                      </div>
                    )}
                  </article>
                )) : <Empty>Chưa có đơn hàng.</Empty>}
              </section>
            )}

            {adminTab === 'giftcodes' && (
              <section className="panel">
                <h2>Tạo giftcode</h2>
                <form className="form-stack" onSubmit={createGiftcode}>
                  <label>Mã giftcode<input value={giftForm.code} onChange={e => setGiftForm(v => ({ ...v, code: e.target.value.toUpperCase() }))} required maxLength="64" /></label>
                  <label>Loại phần thưởng<select value={giftForm.rewardType} onChange={e => setGiftForm(v => ({ ...v, rewardType: e.target.value, rewardValue: e.target.value === 'vip' ? '1' : '50000' }))}><option value="balance">Cộng tiền vào ví</option><option value="vip">Nâng cấp VIP</option></select></label>
                  <label>Giá trị<input type="number" min="1" value={giftForm.rewardValue} onChange={e => setGiftForm(v => ({ ...v, rewardValue: e.target.value }))} /></label>
                  <label>Số lượt sử dụng<input type="number" min="1" value={giftForm.maxUses} onChange={e => setGiftForm(v => ({ ...v, maxUses: e.target.value }))} /></label>
                  <label>Ngày hết hạn (tùy chọn)<input type="date" value={giftForm.expiresAt} onChange={e => setGiftForm(v => ({ ...v, expiresAt: e.target.value }))} /></label>
                  <button className="primary-button" disabled={busy}>Tạo giftcode</button>
                </form>
                <h2>Giftcode đã tạo</h2>
                {adminGiftcodes.length ? adminGiftcodes.map(item => (
                  <article className="admin-record" key={item.id}>
                    <div>
                      <strong>{item.code}</strong>
                      <small>{item.rewardType === 'balance' ? money(item.rewardValue) : 'VIP ' + item.rewardValue} · {item.uses}/{item.maxUses} lượt</small>
                      <span className="status">{item.active ? 'Đang hoạt động' : 'Đã tắt'}</span>
                    </div>
                    <button onClick={() => adminAction('/admin/giftcodes/' + item.id, 'PATCH', { active: !item.active }, 'Đã đổi trạng thái giftcode.')}>{item.active ? 'Tắt' : 'Bật'}</button>
                  </article>
                )) : <Empty>Chưa tạo giftcode.</Empty>}
              </section>
            )}

            {adminTab === 'users' && (
              <section className="panel">
                <h2>Quản lý thành viên</h2>
                {adminUsers.length ? adminUsers.map(item => (
                  <article className="user-admin-card" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>ID {item.id}{item.username ? ' · @' + item.username : ''}</small>
                      <small>Ví: {money(item.balance)} · VIP {item.vipLevel} · {item.linkedAccounts} liên kết</small>
                    </div>
                    <div className="member-edit">
                      <input type="number" placeholder="± Số dư" value={memberAdjustments[item.id]?.balanceDelta ?? ''} onChange={e => setMemberAdjustments(v => ({ ...v, [item.id]: { ...v[item.id], balanceDelta: e.target.value } }))} />
                      <input type="number" min="0" max="10" placeholder="VIP" value={memberAdjustments[item.id]?.vipLevel ?? ''} onChange={e => setMemberAdjustments(v => ({ ...v, [item.id]: { ...v[item.id], vipLevel: e.target.value } }))} />
                      <button onClick={() => saveMember(item.id)} disabled={busy}>Lưu</button>
                    </div>
                  </article>
                )) : <Empty>Chưa có thành viên.</Empty>}
              </section>
            )}

            {adminTab === 'broadcast' && (
              <section className="panel">
                <h2>Gửi thông báo tới thành viên</h2>
                <p className="muted">Bot gửi tới danh sách thành viên đã từng mở Bot. Telegram có thể từ chối người dùng đã chặn Bot.</p>
                <form className="form-stack" onSubmit={async event => {
                  event.preventDefault();
                  await adminAction('/admin/broadcast', 'POST', { message: broadcastMessage }, 'Đã hoàn tất gửi thông báo.');
                  setBroadcastMessage('');
                }}>
                  <label>Nội dung thông báo<textarea rows="6" minLength="2" maxLength="3500" value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} required placeholder="Nhập nội dung thông báo..." /></label>
                  <button className="primary-button" disabled={busy}>Gửi thông báo</button>
                </form>
              </section>
            )}

            {adminTab === 'tickets' && (
              <section className="panel">
                <h2>Yêu cầu hỗ trợ</h2>
                {adminTickets.length ? adminTickets.map(item => (
                  <article className="admin-record ticket-admin-record" key={item.id}>
                    <div>
                      <strong>UID {item.userId}</strong>
                      <p>{item.message}</p>
                      <small>{dateText(item.createdAt)}</small>
                      <span className={'status ' + item.status}>{item.status === 'open' ? 'Đang mở' : item.status === 'answered' ? 'Đã trả lời' : 'Đã đóng'}</span>
                      {item.reply && <p className="muted">Phản hồi trước: {item.reply}</p>}
                    </div>
                    {item.status !== 'closed' && (
                      <div className="ticket-actions">
                        <textarea rows="2" value={ticketReplies[item.id] || ''} onChange={e => setTicketReplies(v => ({ ...v, [item.id]: e.target.value }))} placeholder="Nhập phản hồi cho khách..." />
                        <button onClick={() => adminAction('/admin/tickets/' + item.id, 'PATCH', { status: 'answered', reply: ticketReplies[item.id] || '' }, 'Đã gửi phản hồi cho khách.')} disabled={busy || !(ticketReplies[item.id] || '').trim()}>Trả lời</button>
                        <button className="danger-button" onClick={() => adminAction('/admin/tickets/' + item.id, 'PATCH', { status: 'closed' }, 'Đã đóng yêu cầu hỗ trợ.')}>Đóng</button>
                      </div>
                    )}
                  </article>
                )) : <Empty>Chưa có yêu cầu hỗ trợ.</Empty>}
              </section>
            )}
          </div>
        </section>
      </main>

      <Notice message={notice} onClose={() => setNotice('')} />
    </div>
  );
}
