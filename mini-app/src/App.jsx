import { useCallback, useEffect, useState } from 'react';

const MENU = [
  { id: 'live', label: 'MINIGAME LIVE', icon: '🚀', tone: 'coral', wide: false, category: '' },
  { id: 'tools', label: 'THUÊ TOOL (NEW)', icon: '🧰', tone: 'blue', wide: false, category: 'tool' },
  { id: 'codes', label: 'MUA LÌ XÌ · CODE MÀN · CODE TELE', icon: '🎁', tone: 'green', wide: true, category: 'code' },
  { id: 'wallet', label: 'NẠP TIỀN', icon: '💳', tone: 'coral', wide: false },
  { id: 'otp', label: 'OTP & PROXY', icon: '⚙️', tone: 'blue', wide: false, category: 'otp_proxy' },
  { id: 'viptools', label: 'VIP KHO CÔNG CỤ ĐẶC QUYỀN', icon: '🏆', tone: 'blue', wide: true },
  { id: 'customer', label: 'TRUNG TÂM KHÁCH HÀNG', icon: '💎', tone: 'blue', wide: true },
  { id: 'duel', label: 'HỆ THỐNG GHÉP ĐỐI ĐẦU', icon: '⚔️', tone: 'coral', wide: true, category: 'duel' },
  { id: 'ref', label: 'Giới thiệu REF', icon: '🎊', tone: 'green', wide: false },
  { id: 'vip', label: 'VIP TRUNG TÂM VIP', icon: '👑', tone: 'green', wide: false },
  { id: 'group', label: 'NHÓM CHAT', icon: '🗣️', tone: 'green', wide: false },
  { id: 'news', label: 'KÊNH THÔNG BÁO', icon: '📢', tone: 'green', wide: false },
  { id: 'gift', label: 'NHẬP GIFTCODE', icon: '🎟️', tone: 'green', wide: false },
  { id: 'support', label: 'LIÊN HỆ CSKH', icon: '🧑‍💻', tone: 'green', wide: false }
];

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

const BRANDS = ['QQ88', '78WIN', 'SC88', 'C168', 'CM88', 'F8BET'];
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
  return <div className="notice" role="status"><span>{message}</span><button onClick={onClose} aria-label="Đóng">×</button></div>;
}

function Empty({ children = 'Chưa có dữ liệu.' }) {
  return <div className="empty-state"><span>◌</span><p>{children}</p></div>;
}

function PageTitle({ eyebrow, title, onBack }) {
  return (
    <div className="page-title">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
      <button className="back-button" onClick={onBack}>← Trang chủ</button>
    </div>
  );
}

export default function App() {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || '';

  const [session, setSession] = useState(null);
  const [overview, setOverview] = useState(null);
  const [page, setPage] = useState('home');
  const [adminTab, setAdminTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [brand, setBrand] = useState('QQ88');
  const [accountName, setAccountName] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [miniCode, setMiniCode] = useState('');

  const [catalog, setCatalog] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activity, setActivity] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [payment, setPayment] = useState(null);
  const [depositAmount, setDepositAmount] = useState('50000');
  const [lastDeposit, setLastDeposit] = useState(null);
  const [vipData, setVipData] = useState(null);
  const [referral, setReferral] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [supportText, setSupportText] = useState('');
  const [giftcode, setGiftcode] = useState('');

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
    category: 'tool', name: '', description: '', price: '0',
    durationDays: '0', vipLevel: '0', stock: '', active: true
  });
  const [giftForm, setGiftForm] = useState({
    code: '', rewardType: 'balance', rewardValue: '50000', maxUses: '1', expiresAt: ''
  });
  const [memberAdjustments, setMemberAdjustments] = useState({});
  const [ticketReplies, setTicketReplies] = useState({});
  const [broadcastMessage, setBroadcastMessage] = useState('');

  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    telegram?.setHeaderColor?.('#102b3f');
    telegram?.setBackgroundColor?.('#0b1724');
  }, [telegram]);

  const loadSession = useCallback(async () => {
    if (!initData) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api('/session', initData);
      setSession(data);
      setPage(data.isAdmin ? 'admin' : 'member-blocked');
    } catch (error) {
      setNotice(error.message);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadOverview = useCallback(async () => {
    const data = await api('/overview', initData);
    setOverview(data);
    setLinkedAccounts(data.linkedAccounts || []);
    return data;
  }, [initData]);

  const loadCatalog = useCallback(async category => {
    const data = await api('/catalog' + (category ? '?category=' + encodeURIComponent(category) : ''), initData);
    setCatalog(data || []);
    return data;
  }, [initData]);

  const loadOrders = useCallback(async () => {
    const data = await api('/orders', initData);
    setOrders(data || []);
    return data;
  }, [initData]);

  async function openPage(id) {
    setPage(id);
    try {
      if (id === 'live') await loadOverview();
      if (id === 'tools') { await loadCatalog('tool'); await loadOrders(); }
      if (id === 'codes') { await loadCatalog('code'); await loadOrders(); }
      if (id === 'otp') { await loadCatalog('otp_proxy'); await loadOrders(); }
      if (id === 'duel') { await loadCatalog('duel'); await loadOrders(); }
      if (id === 'wallet') {
        const [p, d] = await Promise.all([api('/payment-info', initData), api('/deposits', initData)]);
        setPayment(p); setDeposits(d || []);
      }
      if (id === 'vip') setVipData(await api('/vip', initData));
      if (id === 'viptools') { await loadCatalog('vip'); await loadOrders(); }
      if (id === 'customer') {
        const [history, timeline] = await Promise.all([
          api('/support', initData),
          api('/activity', initData)
        ]);
        setTickets(history || []);
        setActivity(timeline || []);
      }
      if (id === 'support') setTickets(await api('/support', initData));
      if (id === 'ref') setReferral(await api('/referral', initData));
      if (id === 'gift') setOverview(await api('/overview', initData));
      if (id === 'duel' || id === 'group' || id === 'news') {
        setNotice('Các chức năng thành viên được thao tác trực tiếp trong Telegram Bot. Mini App chỉ dành cho Admin.');
      }
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function refreshPage() {
    setBusy(true);
    try {
      if (page === 'admin') await loadAdminTab(adminTab);
      else if (page === 'home' || page === 'live') await loadOverview();
      else if (page === 'tools') { await loadCatalog('tool'); await loadOrders(); }
      else if (page === 'codes') { await loadCatalog('code'); await loadOrders(); }
      else if (page === 'otp') { await loadCatalog('otp_proxy'); await loadOrders(); }
      else if (page === 'wallet') {
        const [p, d] = await Promise.all([api('/payment-info', initData), api('/deposits', initData)]);
        setPayment(p); setDeposits(d || []);
      } else if (page === 'vip') setVipData(await api('/vip', initData));
      else if (page === 'ref') setReferral(await api('/referral', initData));
      else if (page === 'customer') {
        const [history, timeline] = await Promise.all([
          api('/support', initData),
          api('/activity', initData)
        ]);
        setTickets(history || []);
        setActivity(timeline || []);
      } else if (page === 'support') setTickets(await api('/support', initData));
      setNotice('Đã cập nhật dữ liệu.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (loading || !session) return;
    if (!session.isAdmin) {
      setPage('member-blocked');
      return;
    }
    setPage('admin');
    loadAdminTab('overview').catch(error => setNotice(error.message));
  }, [loading, session]);

  async function submitAccount(event) {
    event.preventDefault(); setBusy(true);
    try {
      await api('/links', initData, {
        method: 'POST',
        body: JSON.stringify({ brand, username: accountName, password: accountPassword, miniCode })
      });
      setAccountName(''); setAccountPassword(''); setMiniCode('');
      await loadOverview();
      setNotice('Đã thêm tài khoản liên kết và mã hóa mật khẩu.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function deleteAccount(id) {
    if (!window.confirm('Bạn chắc chắn muốn xóa liên kết này?')) return;
    setBusy(true);
    try {
      await api('/links/' + encodeURIComponent(id), initData, { method: 'DELETE' });
      await loadOverview(); setNotice('Đã xóa tài khoản liên kết.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function createDeposit(event) {
    event.preventDefault(); setBusy(true); setLastDeposit(null);
    try {
      const result = await api('/deposits', initData, {
        method: 'POST', body: JSON.stringify({ amount: Number(depositAmount) })
      });
      setLastDeposit(result);
      setDeposits(await api('/deposits', initData));
      setNotice('Đã tạo yêu cầu nạp. Chờ Admin đối soát và xác nhận.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function createOrder(item) {
    if (!window.confirm('Tạo yêu cầu đặt dịch vụ "' + item.name + '" với giá ' + money(item.price) + '?')) return;
    setBusy(true);
    try {
      const order = await api('/orders', initData, {
        method: 'POST', body: JSON.stringify({ itemId: item.id })
      });
      await loadOrders();
      setNotice('Đã tạo đơn ' + order.id.slice(0, 8) + '. Chờ Admin xử lý. Đơn chỉ trừ số dư khi được duyệt.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function submitSupport(event) {
    event.preventDefault(); setBusy(true);
    try {
      await api('/support', initData, { method: 'POST', body: JSON.stringify({ message: supportText }) });
      setSupportText('');
      setTickets(await api('/support', initData));
      setNotice('Đã gửi yêu cầu hỗ trợ.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function redeemGiftcode(event) {
    event.preventDefault(); setBusy(true);
    try {
      const reward = await api('/giftcodes/redeem', initData, {
        method: 'POST', body: JSON.stringify({ code: giftcode })
      });
      setGiftcode('');
      await loadOverview();
      setNotice(reward.rewardType === 'balance'
        ? 'Đổi thành công: +' + money(reward.rewardValue) + ' vào ví.'
        : 'Đổi thành công: nâng lên VIP ' + reward.rewardValue + '.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function loadAdminTab(tab) {
    if (!session?.isAdmin) throw new Error('Bạn không có quyền quản trị.');
    setAdminTab(tab);
    if (tab === 'overview') setAdminData(await api('/admin/overview', initData));
    if (tab === 'settings') {
      const result = await api('/admin/settings', initData);
      setAdminSettings({ ...result, payment: { ...result.payment } });
    }
    if (tab === 'deposits') setAdminDeposits(await api('/admin/deposits', initData));
    if (tab === 'catalog') setAdminCatalog(await api('/admin/catalog', initData));
    if (tab === 'orders') setAdminOrders(await api('/admin/orders', initData));
    if (tab === 'giftcodes') setAdminGiftcodes(await api('/admin/giftcodes', initData));
    if (tab === 'tickets') setAdminTickets(await api('/admin/tickets', initData));
    if (tab === 'users') setAdminUsers(await api('/admin/users', initData));
  }

  async function adminAction(path, method, body, successMessage) {
    setBusy(true);
    try {
      await api(path, initData, { method, body: JSON.stringify(body || {}) });
      await loadAdminTab(adminTab);
      setNotice(successMessage || 'Đã cập nhật dữ liệu.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function savePaymentSettings(event) {
    event.preventDefault();
    await adminAction('/admin/settings', 'PUT', {
      payment: adminSettings.payment,
      botUsername: adminSettings.payment.botUsername || adminSettings.botUsername || '',
      groupChatUrl: adminSettings.payment.groupChatUrl || '',
      newsChannelUrl: adminSettings.payment.newsChannelUrl || '',
      supportUsername: adminSettings.payment.supportUsername || '',
      referralCommissionPercent: Number(adminSettings.payment.referralCommissionPercent ?? adminSettings.referralCommissionPercent ?? 0)
    }, 'Đã lưu cấu hình thanh toán và QR.');
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
        await api('/admin/catalog/' + editingItem, initData, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/admin/catalog', initData, { method: 'POST', body: JSON.stringify(body) });
      }
      setEditingItem(null);
      setCatalogForm({ category: 'tool', name: '', description: '', price: '0', durationDays: '0', vipLevel: '0', stock: '', active: true });
      setAdminCatalog(await api('/admin/catalog', initData));
      setNotice('Đã lưu sản phẩm/dịch vụ.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function createGiftcode(event) {
    event.preventDefault(); setBusy(true);
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
      setGiftForm({ code: '', rewardType: 'balance', rewardValue: '50000', maxUses: '1', expiresAt: '' });
      setAdminGiftcodes(await api('/admin/giftcodes', initData));
      setNotice('Đã tạo giftcode.');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function saveMember(userId) {
    const adjustment = memberAdjustments[userId] || {};
    await adminAction('/admin/users/' + encodeURIComponent(userId), 'PATCH', {
      ...(adjustment.balanceDelta !== undefined && adjustment.balanceDelta !== '' ? { balanceDelta: Number(adjustment.balanceDelta) } : {}),
      ...(adjustment.vipLevel !== undefined && adjustment.vipLevel !== '' ? { vipLevel: Number(adjustment.vipLevel) } : {})
    }, 'Đã cập nhật thành viên.');
    setMemberAdjustments(current => ({ ...current, [userId]: {} }));
  }

  function signOut() {
    window.history.replaceState(null, '', window.location.pathname);
    setPage('home');
  }

  const title = MENU.find(item => item.id === page)?.label || 'HENDY CYBERTECH';

  if (!initData) {
    return <main className="gate-page"><div className="brand-symbol">H</div><p className="eyebrow">HENDY CYBERTECH</p><h1>Mở Mini App từ Telegram</h1><p className="muted">Vui lòng mở Mini App bằng nút trong bot để xác minh tài khoản.</p></main>;
  }
  if (loading) {
    return <main className="gate-page"><div className="brand-symbol">H</div><h1>Đang xác thực Telegram…</h1><div className="loader" /></main>;
  }
  if (!session) {
    return <main className="gate-page"><div className="brand-symbol">H</div><h1>Không xác thực được</h1><p className="muted">Hãy mở lại Mini App từ Telegram.</p><button className="primary-button" onClick={loadSession}>Thử lại</button><Notice message={notice} onClose={() => setNotice('')} /></main>;
  }

  if (!session.isAdmin) {
    return (
      <main className="gate-page">
        <div className="brand-symbol">H</div>
        <p className="eyebrow">HENDY CYBERTECH</p>
        <h1>Mini App dành riêng cho Admin</h1>
        <p className="muted">Menu thành viên được xử lý trực tiếp trong Telegram Bot. Gửi /menu để sử dụng các chức năng thành viên, không cần mở Mini App.</p>
        <button className="primary-button" onClick={() => telegram?.close?.()}>Đóng Mini App</button>
      </main>
    );
  }

  const user = overview?.profile || session.profile;
  const ordersForPage = orders;

  return (
    <div className={page === 'admin' ? 'app-shell admin-app-shell' : 'app-shell'}>
      <header className="topbar">
        <div className="brand-symbol small">H</div>
        <div className="brand-copy"><strong>HENDY <span>CYBERTECH</span></strong><small>TRUNG TÂM DỊCH VỤ & TÀI KHOẢN</small></div>
        <button className="icon-button" onClick={refreshPage} disabled={busy} aria-label="Làm mới">⟳</button>
      </header>

      {page === 'home' && (
        <main>
          <section className="welcome-card">
            <div><span className="eyebrow">XIN CHÀO THÀNH VIÊN</span><h1>{user?.name || session.profile.name}</h1><p>ID: {user?.id || session.profile.id} {user?.username ? '· @' + user.username : ''}</p></div>
            <div className="avatar">{(user?.name || 'H').slice(0, 1).toUpperCase()}</div>
          </section>
          <section className="wallet-overview">
            <div><span>SỐ DƯ TÀI KHOẢN</span><strong>{money(user?.balance)}</strong><small>VIP {user?.vipLevel || 0} · {overview?.counts?.linkedAccounts || 0} tài khoản liên kết</small></div>
            <button onClick={() => openPage('wallet')}>＋ Nạp tiền</button>
          </section>
          <div className="menu-heading"><span className="eyebrow">HENDY SERVICES</span><h2>MENU CHỨC NĂNG</h2></div>
          <section className="service-grid">
            {MENU.map(item => (
              <button key={item.id} className={'service-tile tone-' + item.tone + (item.wide ? ' wide' : '')} onClick={() => openPage(item.id)}>
                <span className="service-icon">{item.icon}</span><strong>{item.label}</strong><span className="service-arrow">↗</span>
              </button>
            ))}
          </section>
          {session.isAdmin && <button className="admin-entry" onClick={() => { setPage('admin'); loadAdminTab('overview').catch(e => setNotice(e.message)); }}>🛡️ MỞ BẢNG ĐIỀU KHIỂN ADMIN</button>}
          <section className="quick-stats">
            <div><strong>{overview?.counts?.linkedAccounts || 0}</strong><span>Liên kết</span></div>
            <div><strong>{overview?.counts?.orders || 0}</strong><span>Đơn hàng</span></div>
            <div><strong>{overview?.counts?.pendingDeposits || 0}</strong><span>Nạp chờ</span></div>
          </section>
        </main>
      )}

      {page === 'live' && (
        <main>
          <PageTitle eyebrow="MINIGAME LIVE" title="TRUNG TÂM QUẢN LÝ TÀI KHOẢN" onBack={() => setPage('home')} />
          <section className="panel">
            <div className="panel-heading"><h2>Thêm tài khoản liên kết</h2><span className="pill">{linkedAccounts.length}/10</span></div>
            <form className="form-stack" onSubmit={submitAccount}>
              <label>Nhà cung cấp<select value={brand} onChange={e => setBrand(e.target.value)}>{BRANDS.map(value => <option key={value}>{value}</option>)}</select></label>
              <label>Tên đăng nhập<input value={accountName} onChange={e => setAccountName(e.target.value)} minLength="2" maxLength="80" required /></label>
              <label>Mật khẩu<input type="password" value={accountPassword} onChange={e => setAccountPassword(e.target.value)} maxLength="256" autoComplete="new-password" required /></label>
              <label>Mã Mini<input value={miniCode} onChange={e => setMiniCode(e.target.value)} maxLength="80" /></label>
              <button className="primary-button" disabled={busy || linkedAccounts.length >= 10}>＋ Liên kết tài khoản</button>
            </form>
            <p className="form-hint">Mật khẩu được mã hóa ở máy chủ. Không gửi mật khẩu cho người khác.</p>
          </section>
          <section className="panel"><div className="panel-heading"><h2>Tài khoản đã liên kết</h2><span className="pill">{linkedAccounts.length}</span></div>
            {linkedAccounts.length ? linkedAccounts.map(item => <article className="account-row" key={item.id}><div className="account-avatar">{item.brand.slice(0, 1)}</div><div className="account-info"><strong>{item.brand} · {item.username}</strong><small>Mã Mini: {item.miniCode || '—'}</small></div><button className="remove-button" onClick={() => deleteAccount(item.id)} disabled={busy}>Xóa</button></article>) : <Empty>Chưa có tài khoản liên kết.</Empty>}
          </section>
        </main>
      )}

      {['tools', 'codes', 'otp', 'viptools', 'duel'].includes(page) && (
        <main>
          <PageTitle eyebrow="DANH MỤC DỊCH VỤ" title={title} onBack={() => setPage('home')} />
          <section className="product-grid">
            {catalog.length ? catalog.map(item => <article className="product-card" key={item.id}>
              <span className="product-category">{item.category === 'tool' ? 'CÔNG CỤ' : item.category === 'code' ? 'MÃ DỊCH VỤ' : item.category === 'otp_proxy' ? 'OTP & PROXY' : item.category === 'duel' ? 'ĐỐI ĐẦU' : 'VIP'}</span>
              <h3>{item.name}</h3><p>{item.description || 'Thông tin dịch vụ do quản trị viên cấu hình.'}</p>
              <div className="product-meta"><strong>{money(item.price)}</strong><small>{item.durationDays ? item.durationDays + ' ngày' : 'Theo yêu cầu'}{item.stock !== null ? ' · Còn ' + item.stock : ''}</small></div>
              <button className="primary-button" disabled={busy || item.stock === 0} onClick={() => createOrder(item)}>Tạo đơn dịch vụ</button>
            </article>) : <Empty>Chưa có dịch vụ được Admin đăng bán. Vui lòng quay lại sau.</Empty>}
          </section>
          <section className="panel"><h2>Lịch sử đơn hàng</h2>
            {ordersForPage.length ? ordersForPage.map(item => <article className="history-row" key={item.id}><div><strong>{item.itemName}</strong><small>{dateText(item.createdAt)}{item.durationDays ? ' · ' + item.durationDays + ' ngày' : ''}</small>{item.expiresAt && <small>Hết hạn: {dateText(item.expiresAt)}</small>}</div><div className="history-right"><b>{money(item.amount)}</b><small className={'status ' + item.status}>{item.status === 'pending' ? 'Chờ duyệt' : item.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}</small></div></article>) : <Empty>Bạn chưa có đơn hàng.</Empty>}
          </section>
        </main>
      )}

      {page === 'wallet' && (
        <main>
          <PageTitle eyebrow="VÍ ĐIỆN TỬ" title="NẠP TIỀN & GIAO DỊCH" onBack={() => setPage('home')} />
          <section className="wallet-overview compact"><div><span>SỐ DƯ HIỆN TẠI</span><strong>{money(user?.balance)}</strong></div></section>
          <section className="panel">
            <h2>Tạo yêu cầu nạp tiền</h2>
            <p className="muted">Số dư chỉ được cập nhật sau khi Admin xác nhận giao dịch thực tế.</p>
            <form className="form-stack" onSubmit={createDeposit}>
              <label>Số tiền (VNĐ)<input type="number" min={payment?.minDeposit || 10000} max="100000000" step="1000" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} required /></label>
              <button className="primary-button" disabled={busy}>Tạo mã nạp tiền</button>
            </form>
          </section>
          {lastDeposit && <section className="panel deposit-card"><span className="eyebrow">THÔNG TIN CHUYỂN KHOẢN</span><h2>{money(lastDeposit.amount)}</h2><div className="reference-code">Nội dung: <strong>{lastDeposit.reference}</strong><button onClick={() => navigator.clipboard?.writeText(lastDeposit.reference).then(() => setNotice('Đã sao chép nội dung chuyển khoản.'))}>Sao chép</button></div>
            {lastDeposit.qrUrl ? <img className="qr-image" src={lastDeposit.qrUrl} alt="Mã QR nạp tiền" /> : <p className="muted">Chưa cấu hình QR. Vui lòng dùng thông tin ngân hàng bên dưới hoặc liên hệ Admin.</p>}
            <p><strong>{lastDeposit.payment?.bankName || payment?.bankName || 'Ngân hàng chưa cấu hình'}</strong></p>
            <p>Số tài khoản: <strong>{lastDeposit.payment?.bankAccount || payment?.bankAccount || '—'}</strong></p>
            <p>Chủ tài khoản: <strong>{lastDeposit.payment?.bankAccountName || payment?.bankAccountName || '—'}</strong></p>
            <p className="muted">{lastDeposit.payment?.instructions || payment?.instructions}</p>
            <span className="status pending">Đang chờ Admin xác nhận</span>
          </section>}
          <section className="panel"><h2>Lịch sử giao dịch</h2>
            {deposits.length ? deposits.map(item => <article className="history-row" key={item.id}><div><strong>{item.reference}</strong><small>{dateText(item.createdAt)}</small></div><div className="history-right"><b>{money(item.amount)}</b><small className={'status ' + item.status}>{item.status === 'pending' ? 'Chờ xác nhận' : item.status === 'paid' ? 'Đã cộng tiền' : 'Từ chối'}</small></div></article>) : <Empty>Chưa có giao dịch nạp tiền.</Empty>}
          </section>
        </main>
      )}

      {page === 'vip' && (
        <main><PageTitle eyebrow="TRUNG TÂM VIP" title="CẤP BẬC & QUYỀN LỢI" onBack={() => setPage('home')} />
          <section className="vip-current"><span>CẤP THÀNH VIÊN HIỆN TẠI</span><strong>VIP {vipData?.currentLevel || user?.vipLevel || 0}</strong><small>Quyền lợi được áp dụng theo chính sách hệ thống.</small></section>
          <section className="vip-grid">{(vipData?.levels || []).map(level => <article className="vip-card" key={level.level}><span>VIP {level.level}</span><h3>{level.name}</h3><ul>{level.benefits.map(benefit => <li key={benefit}>{benefit}</li>)}</ul></article>)}</section>
          <section className="panel"><h2>Gói nâng cấp VIP</h2>{vipData?.upgradeProducts?.length ? vipData.upgradeProducts.map(item => <article className="product-card compact-card" key={item.id}><h3>{item.name}</h3><p>{item.description}</p><strong>{money(item.price)}</strong><button className="primary-button" onClick={() => createOrder(item)} disabled={busy}>Yêu cầu nâng cấp</button></article>) : <Empty>Chưa có gói nâng cấp VIP. Admin có thể thêm trong Danh mục.</Empty>}</section>
        </main>
      )}

      {page === 'customer' && (
        <main><PageTitle eyebrow="TRUNG TÂM KHÁCH HÀNG" title="HỒ SƠ & HỖ TRỢ" onBack={() => setPage('home')} />
          <section className="panel"><h2>Thông tin thành viên</h2><article className="profile-row"><span>Họ tên</span><strong>{user?.name || session.profile.name}</strong></article><article className="profile-row"><span>Telegram ID</span><strong>{user?.id || session.profile.id}</strong></article><article className="profile-row"><span>Số dư</span><strong>{money(user?.balance)}</strong></article><article className="profile-row"><span>Cấp VIP</span><strong>VIP {user?.vipLevel || 0}</strong></article></section>
          <section className="panel"><div className="panel-heading"><h2>Lịch sử hoạt động</h2><span className="pill">{activity.length}</span></div>
            {activity.length ? activity.map(item => <article className="history-row" key={item.id}><div><strong>{item.title}</strong><small>{item.detail || '—'} · {dateText(item.createdAt)}</small>{item.expiresAt && <small>Hết hạn: {dateText(item.expiresAt)}</small>}{item.reply && <small className="ticket-reply">Phản hồi: {item.reply}</small>}</div><small className={'status ' + item.status}>{item.status === 'pending' ? 'Đang chờ' : item.status === 'paid' || item.status === 'approved' || item.status === 'completed' || item.status === 'answered' ? 'Hoàn tất/Đã duyệt' : item.status === 'rejected' ? 'Từ chối' : item.status === 'open' ? 'Đang mở' : item.status}</small></article>) : <Empty>Chưa có hoạt động nào được ghi nhận.</Empty>}
          </section>
          <section className="panel"><h2>Gửi yêu cầu hỗ trợ</h2><form className="form-stack" onSubmit={submitSupport}><label>Nội dung<textarea rows="4" minLength="5" maxLength="2000" value={supportText} onChange={e => setSupportText(e.target.value)} required placeholder="Mô tả vấn đề bạn gặp phải..." /></label><button className="primary-button" disabled={busy}>Gửi CSKH</button></form></section>
          <section className="panel"><h2>Lịch sử hỗ trợ</h2>{tickets.length ? tickets.map(ticket => <article className="history-row" key={ticket.id}><div><strong>{ticket.message}</strong><small>{dateText(ticket.createdAt)}</small>{ticket.reply && <small className="ticket-reply">Phản hồi: {ticket.reply}</small>}</div><small className={'status ' + ticket.status}>{ticket.status === 'open' ? 'Đang mở' : ticket.status === 'answered' ? 'Đã trả lời' : 'Đã đóng'}</small></article>) : <Empty>Chưa có yêu cầu hỗ trợ.</Empty>}</section>
        </main>
      )}

      {page === 'ref' && (
        <main><PageTitle eyebrow="GIỚI THIỆU REF" title="CHƯƠNG TRÌNH GIỚI THIỆU" onBack={() => setPage('home')} />
          <section className="panel referral-card"><span className="eyebrow">MÃ GIỚI THIỆU CỦA BẠN</span><strong>{referral?.code || 'Đang tải…'}</strong>{referral?.link ? <><p className="muted">Chia sẻ đường dẫn này để mời thành viên mới.</p><button className="primary-button" onClick={() => navigator.clipboard?.writeText(referral.link).then(() => setNotice('Đã sao chép liên kết giới thiệu.'))}>Sao chép liên kết</button></> : <p className="muted">Admin cần cấu hình BOT_USERNAME trên Render để tạo liên kết mời tự động.</p>}</section>
          <section className="quick-stats"><div><strong>{referral?.stats?.invited || 0}</strong><span>Đã giới thiệu</span></div><div><strong>{money(referral?.stats?.commission || 0)}</strong><span>Hoa hồng nhận được</span></div><div><strong>{referral?.commissionPercent || 0}%</strong><span>Tỷ lệ hoa hồng</span></div></section>
          <section className="panel"><h2>Thành viên giới thiệu gần đây</h2>{referral?.stats?.referrals?.length ? referral.stats.referrals.map(item => <article className="history-row" key={item.referredId}><strong>ID {item.referredId}</strong><small>{dateText(item.createdAt)}</small></article>) : <Empty>Chưa có thành viên được giới thiệu.</Empty>}</section>
        </main>
      )}

      {page === 'gift' && (
        <main><PageTitle eyebrow="GIFT CODE" title="NHẬP MÃ QUÀ TẶNG" onBack={() => setPage('home')} />
          <section className="panel"><h2>Đổi giftcode</h2><p className="muted">Mỗi giftcode được sử dụng một lần cho mỗi tài khoản và có thể có giới hạn lượt hoặc ngày hết hạn.</p><form className="form-stack" onSubmit={redeemGiftcode}><label>Mã giftcode<input value={giftcode} onChange={e => setGiftcode(e.target.value.toUpperCase())} maxLength="64" required placeholder="NHẬP MÃ QUÀ TẶNG" /></label><button className="primary-button" disabled={busy}>Xác nhận đổi mã</button></form></section>
        </main>
      )}

      {['group', 'news'].includes(page) && (
        <main><PageTitle eyebrow="HENDY SERVICES" title={title} onBack={() => setPage('home')} /><section className="panel"><Empty>{page === 'duel' ? 'Hệ thống ghép đối đầu cần cấu hình nhà cung cấp và luật chơi trước khi mở.' : 'Liên kết cộng đồng chưa được cấu hình.'}</Empty></section></main>
      )}

      {page === 'support' && (
        <main><PageTitle eyebrow="LIÊN HỆ CSKH" title="HỖ TRỢ KHÁCH HÀNG" onBack={() => setPage('home')} /><section className="panel"><form className="form-stack" onSubmit={submitSupport}><label>Nội dung cần hỗ trợ<textarea rows="5" value={supportText} onChange={e => setSupportText(e.target.value)} minLength="5" maxLength="2000" required /></label><button className="primary-button" disabled={busy}>Gửi yêu cầu</button></form></section></main>
      )}

      {page === 'admin' && session.isAdmin && (
        <main className="admin-dashboard">
          <aside className="admin-sidebar">
            <div className="admin-brand">
              <span className="admin-brand-mark">H</span>
              <div><strong>HENDY</strong><small>CONTROL CENTER</small></div>
            </div>
            <div className="admin-account">
              <span className="admin-account-avatar">{(session.profile.name || 'A').slice(0, 1).toUpperCase()}</span>
              <div><strong>{session.profile.name}</strong><small>ADMIN · {session.profile.id}</small></div>
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
                  <button key={id} className={adminTab === id ? 'active' : ''} onClick={() => loadAdminTab(id).catch(e => setNotice(e.message))}>
                    <span className="admin-nav-icon">{meta[0]}</span>
                    <span className="admin-nav-copy"><strong>{label}</strong><small>{meta[1]}</small></span>
                    {adminTab === id && <span className="admin-nav-active">●</span>}
                  </button>
                );
              })}
            </nav>
            <div className="admin-sidebar-bottom">
              <span className="admin-secure-label">● KẾT NỐI BẢO MẬT</span>
              <button onClick={() => setPage('home')}>↩ Về trang thành viên</button>
              <small>HENDY CYBERTECH · ADMIN</small>
            </div>
          </aside>

          <section className="admin-workspace">
            <header className="admin-topbar">
              <div>
                <div className="admin-breadcrumb">HENDY CONTROL CENTER <span>/</span> {ADMIN_TABS.find(([id]) => id === adminTab)?.[1] || 'Tổng quan'}</div>
                <h1>{ADMIN_TABS.find(([id]) => id === adminTab)?.[1] || 'Tổng quan'}</h1>
                <p>Xin chào {session.profile.name}. Theo dõi và vận hành hệ thống Hendy tại đây.</p>
              </div>
              <div className="admin-top-actions">
                <span className="admin-live-status"><i /> HỆ THỐNG ADMIN</span>
                <button onClick={() => loadAdminTab(adminTab).catch(e => setNotice(e.message))} disabled={busy}>⟳ Làm mới</button>
                <button className="admin-mobile-home" onClick={() => setPage('home')}>Trang thành viên</button>
              </div>
            </header>

            <div className="admin-content">
          {adminTab === 'overview' && <section className="admin-stats">
            {[
              ['Thành viên', adminData?.totals?.users],
              ['Tài khoản liên kết', adminData?.totals?.linkedAccounts],
              ['Nạp chờ duyệt', adminData?.totals?.pendingDeposits],
              ['Đơn chờ xử lý', adminData?.totals?.pendingOrders],
              ['Yêu cầu hỗ trợ', adminData?.totals?.openTickets]
            ].map(([label, value]) => <div key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}
          </section>}

          {adminTab === 'settings' && adminSettings && <section className="panel">
            <h2>Cấu hình QR & tài khoản nhận tiền</h2>
            <form className="form-stack" onSubmit={savePaymentSettings}>
              <label>Mã BIN ngân hàng<input value={adminSettings.payment.bankBin || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankBin: e.target.value } }))} placeholder="VD: 970422" /></label>
              <label>Tên ngân hàng<input value={adminSettings.payment.bankName || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankName: e.target.value } }))} /></label>
              <label>Số tài khoản<input value={adminSettings.payment.bankAccount || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankAccount: e.target.value } }))} /></label>
              <label>Chủ tài khoản<input value={adminSettings.payment.bankAccountName || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, bankAccountName: e.target.value } }))} /></label>
              <label>URL ảnh QR tĩnh (tùy chọn, HTTPS)<input value={adminSettings.payment.qrImageUrl || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, qrImageUrl: e.target.value } }))} placeholder="https://..." /></label>
              <label>Username Bot Telegram (không có @)<input value={adminSettings.payment.botUsername || adminSettings.botUsername || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, botUsername: e.target.value } }))} placeholder="HendyBot" /></label>
              <label>Liên kết nhóm chat (HTTPS)<input value={adminSettings.payment.groupChatUrl || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, groupChatUrl: e.target.value } }))} placeholder="https://t.me/..." /></label>
              <label>Liên kết kênh thông báo (HTTPS)<input value={adminSettings.payment.newsChannelUrl || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, newsChannelUrl: e.target.value } }))} placeholder="https://t.me/..." /></label>
              <label>Username CSKH (không có @)<input value={adminSettings.payment.supportUsername || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, supportUsername: e.target.value } }))} placeholder="HendySupport" /></label>
              <label>Mức nạp tối thiểu<input type="number" min="10000" max="100000000" value={adminSettings.payment.minDeposit || 10000} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, minDeposit: Number(e.target.value) } }))} /></label>
              <label>Hướng dẫn chuyển khoản<textarea rows="3" value={adminSettings.payment.instructions || ''} onChange={e => setAdminSettings(v => ({ ...v, payment: { ...v.payment, instructions: e.target.value } }))} /></label>
              <label>Hoa hồng REF (%)<input type="number" min="0" max="20" step="0.1" value={adminSettings.referralCommissionPercent || 0} onChange={e => setAdminSettings(v => ({ ...v, referralCommissionPercent: Number(e.target.value) }))} /></label>
              <button className="primary-button" disabled={busy}>Lưu cấu hình thanh toán</button>
            </form>
            {adminSettings.payment.qrImageUrl && <img className="qr-preview" src={adminSettings.payment.qrImageUrl} alt="QR cấu hình" />}
          </section>}

          {adminTab === 'deposits' && <section className="panel"><h2>Yêu cầu nạp tiền</h2>
            {adminDeposits.length ? adminDeposits.map(item => <article className="admin-record" key={item.id}><div><strong>{money(item.amount)}</strong><small>{item.reference} · UID {item.userId}</small><small>{dateText(item.createdAt)}</small><span className={'status ' + item.status}>{item.status}</span></div>{item.status === 'pending' && <div className="record-actions"><button onClick={() => adminAction('/admin/deposits/' + item.id, 'PATCH', { status: 'paid' }, 'Đã duyệt nạp và cộng số dư.') } disabled={busy}>Duyệt</button><button className="danger-button" onClick={() => adminAction('/admin/deposits/' + item.id, 'PATCH', { status: 'rejected' }, 'Đã từ chối yêu cầu nạp.') } disabled={busy}>Từ chối</button></div>}</article>) : <Empty>Chưa có yêu cầu nạp tiền.</Empty>}
          </section>}

          {adminTab === 'catalog' && <section className="panel"><h2>{editingItem ? 'Chỉnh sửa danh mục' : 'Thêm sản phẩm / dịch vụ'}</h2>
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
            {adminCatalog.length ? adminCatalog.map(item => <article className="admin-record" key={item.id}><div><strong>{item.name}</strong><small>{item.category} · {money(item.price)} · {item.durationDays || 0} ngày</small><span className="status">{item.active ? 'Đang bán' : 'Đã ẩn'}</span></div><div className="record-actions"><button onClick={() => { setEditingItem(item.id); setCatalogForm({ ...item, price: String(item.price), durationDays: String(item.durationDays), vipLevel: String(item.vipLevel || 0), stock: item.stock === null ? '' : String(item.stock) }); }}>Sửa</button><button className="danger-button" onClick={() => adminAction('/admin/catalog/' + item.id, 'DELETE', {}, 'Đã xóa danh mục.')} disabled={busy}>Xóa</button></div></article>) : <Empty>Chưa có sản phẩm/dịch vụ.</Empty>}
          </section>}

          {adminTab === 'orders' && <section className="panel"><h2>Đơn hàng dịch vụ</h2>
            {adminOrders.length ? adminOrders.map(item => <article className="admin-record" key={item.id}><div><strong>{item.itemName}</strong><small>UID {item.userId} · {money(item.amount)}</small><small>{dateText(item.createdAt)}</small><span className={'status ' + item.status}>{item.status === 'pending' ? 'Chờ xử lý' : item.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}</span></div>{item.status === 'pending' && <div className="record-actions"><button onClick={() => adminAction('/admin/orders/' + item.id, 'PATCH', { status: 'approved' }, 'Đã duyệt đơn và trừ số dư.') } disabled={busy}>Duyệt</button><button className="danger-button" onClick={() => adminAction('/admin/orders/' + item.id, 'PATCH', { status: 'rejected' }, 'Đã từ chối đơn.') } disabled={busy}>Từ chối</button></div>}</article>) : <Empty>Chưa có đơn hàng.</Empty>}
          </section>}

          {adminTab === 'giftcodes' && <section className="panel"><h2>Tạo giftcode</h2><form className="form-stack" onSubmit={createGiftcode}>
            <label>Mã giftcode<input value={giftForm.code} onChange={e => setGiftForm(v => ({ ...v, code: e.target.value.toUpperCase() }))} required maxLength="64" /></label>
            <label>Loại phần thưởng<select value={giftForm.rewardType} onChange={e => setGiftForm(v => ({ ...v, rewardType: e.target.value, rewardValue: e.target.value === 'vip' ? '1' : '50000' }))}><option value="balance">Cộng tiền vào ví</option><option value="vip">Nâng cấp VIP</option></select></label>
            <label>Giá trị<input type="number" min="1" value={giftForm.rewardValue} onChange={e => setGiftForm(v => ({ ...v, rewardValue: e.target.value }))} /></label>
            <label>Số lượt sử dụng<input type="number" min="1" value={giftForm.maxUses} onChange={e => setGiftForm(v => ({ ...v, maxUses: e.target.value }))} /></label>
            <label>Ngày hết hạn (tùy chọn)<input type="date" value={giftForm.expiresAt} onChange={e => setGiftForm(v => ({ ...v, expiresAt: e.target.value }))} /></label>
            <button className="primary-button" disabled={busy}>Tạo giftcode</button>
          </form>
          <h2>Giftcode đã tạo</h2>{adminGiftcodes.length ? adminGiftcodes.map(item => <article className="admin-record" key={item.id}><div><strong>{item.code}</strong><small>{item.rewardType === 'balance' ? money(item.rewardValue) : 'VIP ' + item.rewardValue} · {item.uses}/{item.maxUses} lượt</small><span className="status">{item.active ? 'Đang hoạt động' : 'Đã tắt'}</span></div><button onClick={() => adminAction('/admin/giftcodes/' + item.id, 'PATCH', { active: !item.active }, 'Đã đổi trạng thái giftcode.')}>{item.active ? 'Tắt' : 'Bật'}</button></article>) : <Empty>Chưa tạo giftcode.</Empty>}
          </section>}

          {adminTab === 'users' && <section className="panel"><h2>Quản lý thành viên</h2>
            {adminUsers.length ? adminUsers.map(item => <article className="user-admin-card" key={item.id}><div><strong>{item.name}</strong><small>ID {item.id}{item.username ? ' · @' + item.username : ''}</small><small>Ví: {money(item.balance)} · VIP {item.vipLevel} · {item.linkedAccounts} liên kết</small></div><div className="member-edit"><input type="number" placeholder="± Số dư" value={memberAdjustments[item.id]?.balanceDelta ?? ''} onChange={e => setMemberAdjustments(v => ({ ...v, [item.id]: { ...v[item.id], balanceDelta: e.target.value } }))} /><input type="number" min="0" max="10" placeholder="VIP" value={memberAdjustments[item.id]?.vipLevel ?? ''} onChange={e => setMemberAdjustments(v => ({ ...v, [item.id]: { ...v[item.id], vipLevel: e.target.value } }))} /><button onClick={() => saveMember(item.id)} disabled={busy}>Lưu</button></div></article>) : <Empty>Chưa có thành viên.</Empty>}
          </section>}

          {adminTab === 'broadcast' && <section className="panel">
            <h2>Gửi thông báo tới thành viên</h2>
            <p className="muted">Bot sẽ gửi nội dung tới danh sách thành viên đã từng mở bot. Telegram có thể từ chối một số người dùng đã chặn bot.</p>
            <form className="form-stack" onSubmit={async event => {
              event.preventDefault();
              await adminAction('/admin/broadcast', 'POST', { message: broadcastMessage }, 'Đã hoàn tất gửi thông báo.');
              setBroadcastMessage('');
            }}>
              <label>Nội dung thông báo<textarea rows="6" minLength="2" maxLength="3500" value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} required placeholder="Nhập nội dung thông báo..." /></label>
              <button className="primary-button" disabled={busy}>Gửi thông báo</button>
            </form>
          </section>}

          {adminTab === 'tickets' && <section className="panel"><h2>Yêu cầu hỗ trợ</h2>
            {adminTickets.length ? adminTickets.map(item => <article className="admin-record ticket-admin-record" key={item.id}>
              <div><strong>UID {item.userId}</strong><p>{item.message}</p><small>{dateText(item.createdAt)}</small><span className={'status ' + item.status}>{item.status === 'open' ? 'Đang mở' : item.status === 'answered' ? 'Đã trả lời' : 'Đã đóng'}</span>{item.reply && <p className="muted">Phản hồi trước: {item.reply}</p>}</div>
              {item.status !== 'closed' && <div className="ticket-actions">
                <textarea rows="2" value={ticketReplies[item.id] || ''} onChange={e => setTicketReplies(v => ({ ...v, [item.id]: e.target.value }))} placeholder="Nhập phản hồi cho khách..." />
                <button onClick={() => adminAction('/admin/tickets/' + item.id, 'PATCH', { status: 'answered', reply: ticketReplies[item.id] || '' }, 'Đã gửi phản hồi cho khách.') } disabled={busy || !(ticketReplies[item.id] || '').trim()}>Trả lời</button>
                <button className="danger-button" onClick={() => adminAction('/admin/tickets/' + item.id, 'PATCH', { status: 'closed' }, 'Đã đóng yêu cầu hỗ trợ.')}>Đóng</button>
              </div>}
            </article>) : <Empty>Chưa có yêu cầu hỗ trợ.</Empty>}
          </section>}

              {adminTab === 'overview' && <section className="admin-overview-lower">
                <article className="admin-welcome-panel">
                  <span className="admin-panel-kicker">HENDY OPERATIONS</span>
                  <h2>Trung tâm vận hành</h2>
                  <p>Quản lý thanh toán, dịch vụ, thành viên và chăm sóc khách hàng từ một nơi.</p>
                  <div className="admin-shortcuts">
                    <button onClick={() => loadAdminTab('deposits').catch(e => setNotice(e.message))}>↧ Duyệt nạp tiền</button>
                    <button onClick={() => loadAdminTab('catalog').catch(e => setNotice(e.message))}>＋ Thêm dịch vụ</button>
                    <button onClick={() => loadAdminTab('broadcast').catch(e => setNotice(e.message))}>◉ Gửi thông báo</button>
                  </div>
                </article>
                <article className="admin-activity-panel">
                  <div className="admin-panel-heading"><div><span className="admin-panel-kicker">MEMBERS</span><h2>Thành viên mới</h2></div><button onClick={() => loadAdminTab('users').catch(e => setNotice(e.message))}>Xem tất cả →</button></div>
                  {adminData?.users?.length ? adminData.users.slice(0, 6).map(member => (
                    <div className="admin-mini-member" key={member.id}>
                      <span>{(member.name || 'U').slice(0, 1).toUpperCase()}</span>
                      <div><strong>{member.name}</strong><small>ID {member.id}</small></div>
                      <b>VIP {member.vipLevel || 0}</b>
                    </div>
                  )) : <Empty>Chưa có thành viên được ghi nhận.</Empty>}
                </article>
              </section>}
            </div>
          </section>
        </main>
      )}

      <footer><span>HENDY CYBERTECH</span><small>Hệ thống quản lý thành viên · Thanh toán do Admin đối soát</small></footer>
      <Notice message={notice} onClose={() => setNotice('')} />
    </div>
  );
}
