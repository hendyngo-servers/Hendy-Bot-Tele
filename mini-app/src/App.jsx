import { useCallback, useEffect, useState } from 'react';

const BRANDS = ['QQ88', '78WIN', 'SC88', 'C168', 'CM88', 'F8BET'];

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

const formatDate = value => value
  ? new Date(value).toLocaleString('vi-VN')
  : '—';

function Notice({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="notice" role="status">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Đóng thông báo">×</button>
    </div>
  );
}

export default function App() {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || '';
  const requestedMode = new URLSearchParams(window.location.search).get('mode');

  const [session, setSession] = useState(null);
  const [mode, setMode] = useState('gate');
  const [overview, setOverview] = useState(null);
  const [adminOverview, setAdminOverview] = useState(null);
  const [brand, setBrand] = useState('QQ88');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [miniCode, setMiniCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    telegram?.setHeaderColor?.('#101a2b');
    telegram?.setBackgroundColor?.('#0b1220');
  }, [telegram]);

  const loadSession = useCallback(async () => {
    if (!initData) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api('/session', initData);
      setSession(result);
    } catch (error) {
      setNotice(error.message);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const loadAccounts = useCallback(async () => {
    const result = await api('/overview', initData);
    setOverview(result);
    return result;
  }, [initData]);

  const loadAdmin = useCallback(async () => {
    const result = await api('/admin/overview', initData);
    setAdminOverview(result);
    return result;
  }, [initData]);

  async function enterAccountCenter() {
    setBusy(true);
    try {
      await loadAccounts();
      setMode('accounts');
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function enterAdmin() {
    if (!session?.isAdmin) {
      setNotice('Tài khoản Telegram này không được cấp quyền quản trị.');
      return;
    }
    setBusy(true);
    try {
      await loadAdmin();
      setMode('admin');
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (loading || !session || mode !== 'gate') return;
    if (requestedMode !== 'accounts' && requestedMode !== 'admin') return;

    let active = true;
    const isAdminMode = requestedMode === 'admin';
    if (isAdminMode && !session.isAdmin) {
      setNotice('Tài khoản Telegram này không được cấp quyền quản trị.');
      return undefined;
    }

    setBusy(true);
    api(isAdminMode ? '/admin/overview' : '/overview', initData)
      .then(result => {
        if (!active) return;
        if (isAdminMode) setAdminOverview(result);
        else setOverview(result);
        setMode(isAdminMode ? 'admin' : 'accounts');
      })
      .catch(error => {
        if (active) setNotice(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });

    return () => { active = false; };
  }, [loading, session, mode, requestedMode, initData]);

  async function refreshCurrent() {
    setBusy(true);
    try {
      if (mode === 'admin') await loadAdmin();
      else if (mode === 'accounts') await loadAccounts();
      else await loadSession();
      setNotice('Đã cập nhật dữ liệu.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAccount(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/links', initData, {
        method: 'POST',
        body: JSON.stringify({ brand, username, password, miniCode })
      });
      setUsername('');
      setPassword('');
      setMiniCode('');
      await loadAccounts();
      setNotice('Đã thêm tài khoản liên kết. Mật khẩu được mã hóa trước khi lưu.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount(id) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa liên kết tài khoản này?')) return;
    setBusy(true);
    try {
      await api('/links/' + encodeURIComponent(id), initData, { method: 'DELETE' });
      await loadAccounts();
      setNotice('Đã xóa tài khoản liên kết.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.history.replaceState(null, '', window.location.pathname);
    setMode('gate');
    setOverview(null);
    setAdminOverview(null);
    setNotice('');
  }

  if (!initData) {
    return (
      <main className="gate-page">
        <div className="brand-symbol">H</div>
        <p className="eyebrow">HENDY CYBERTECH</p>
        <h1>Đăng nhập bằng Telegram</h1>
        <p className="muted">
          Vui lòng mở Mini App từ bot Telegram để xác thực và truy cập trung tâm quản lý tài khoản.
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="gate-page">
        <div className="brand-symbol">H</div>
        <p className="eyebrow">HENDY CYBERTECH</p>
        <h1>Đang xác thực phiên Telegram…</h1>
        <div className="loader" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="gate-page">
        <div className="brand-symbol">H</div>
        <p className="eyebrow">HENDY CYBERTECH</p>
        <h1>Phiên đăng nhập không hợp lệ</h1>
        <p className="muted">Hãy đóng Mini App và mở lại từ bot Telegram.</p>
        <button className="primary-button" onClick={loadSession}>Thử xác thực lại</button>
        <Notice message={notice} onClose={() => setNotice('')} />
      </main>
    );
  }

  const profile = overview?.profile || session.profile;
  const accounts = overview?.linkedAccounts || [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-symbol small">H</div>
        <div className="brand-copy">
          <strong>HENDY <span>CYBERTECH</span></strong>
          <small>CỔNG ĐĂNG NHẬP HỆ THỐNG</small>
        </div>
        {mode !== 'gate' && (
          <button className="icon-button" onClick={refreshCurrent} disabled={busy} aria-label="Làm mới">⟳</button>
        )}
      </header>

      {mode === 'gate' && (
        <main className="login-layout">
          <section className="login-intro">
            <span className="eyebrow">XÁC THỰC TELEGRAM THÀNH CÔNG</span>
            <h1>Xin chào, {session.profile.name}</h1>
            <p>ID Telegram: <strong>{session.profile.id}</strong></p>
            <p className="muted">Chọn khu vực đăng nhập mà bạn được cấp quyền truy cập.</p>
          </section>

          <button className="login-card account-login" onClick={enterAccountCenter} disabled={busy}>
            <span className="login-icon">🔐</span>
            <span className="login-card-copy">
              <strong>TRUNG TÂM QUẢN LÝ TÀI KHOẢN</strong>
              <small>Thêm, xem và xóa các tài khoản đã liên kết</small>
            </span>
            <span className="login-arrow">→</span>
          </button>

          {session.isAdmin && (
            <button className="login-card admin-login" onClick={enterAdmin} disabled={busy}>
              <span className="login-icon">🛡️</span>
              <span className="login-card-copy">
                <strong>ĐĂNG NHẬP ADMIN</strong>
                <small>Khu vực quản trị hệ thống dành riêng cho quản trị viên</small>
              </span>
              <span className="login-arrow">→</span>
            </button>
          )}

          <section className="security-note">
            <strong>Đăng nhập bảo mật</strong>
            <p>Danh tính được xác minh bằng chữ ký Telegram. Quyền Admin được đối chiếu với ADMIN_ID tại máy chủ.</p>
          </section>
        </main>
      )}

      {mode === 'accounts' && (
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">KHU VỰC THÀNH VIÊN</span>
              <h1>TRUNG TÂM QUẢN LÝ TÀI KHOẢN</h1>
              <p>{profile?.name || session.profile.name} · ID {profile?.id || session.profile.id}</p>
            </div>
            <button className="secondary-button" onClick={logout}>Đăng xuất</button>
          </div>

          <section className="summary-strip">
            <div><strong>{accounts.length}</strong><span>Tài khoản đã liên kết</span></div>
            <div><strong>10</strong><span>Giới hạn mỗi thành viên</span></div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div><span className="eyebrow">THÊM TÀI KHOẢN</span><h2>Liên kết tài khoản mới</h2></div>
            </div>
            <form className="form-stack" onSubmit={submitAccount}>
              <label>Nhà cung cấp
                <select value={brand} onChange={event => setBrand(event.target.value)}>
                  {BRANDS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Tên đăng nhập
                <input value={username} onChange={event => setUsername(event.target.value)} minLength="2" maxLength="80" autoComplete="username" required placeholder="Nhập tên tài khoản" />
              </label>
              <label>Mật khẩu
                <input type="password" value={password} onChange={event => setPassword(event.target.value)} maxLength="256" autoComplete="new-password" required placeholder="Nhập mật khẩu tài khoản" />
              </label>
              <label>Mã Mini (không bắt buộc)
                <input value={miniCode} onChange={event => setMiniCode(event.target.value)} maxLength="80" placeholder="Mặc định dùng tên đăng nhập" />
              </label>
              <button className="primary-button" disabled={busy || accounts.length >= 10}>
                {busy ? 'ĐANG XỬ LÝ…' : '＋ THÊM TÀI KHOẢN'}
              </button>
            </form>
            <p className="form-hint">Mật khẩu được mã hóa AES-256-GCM ở máy chủ. Mật khẩu không hiển thị lại trong danh sách.</p>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div><span className="eyebrow">DANH SÁCH LIÊN KẾT</span><h2>Tài khoản của bạn ({accounts.length})</h2></div>
            </div>
            {accounts.length === 0 ? (
              <div className="empty-state"><span>🔗</span><strong>Chưa có tài khoản liên kết</strong><p>Thêm tài khoản đầu tiên bằng biểu mẫu phía trên.</p></div>
            ) : (
              <div className="account-list">
                {accounts.map(account => (
                  <article className="account-row" key={account.id}>
                    <div className="account-avatar">{account.brand.slice(0, 1)}</div>
                    <div className="account-info">
                      <strong>{account.brand} · {account.username}</strong>
                      <small>Mã Mini: {account.miniCode || '—'}</small>
                      <small>Ngày thêm: {formatDate(account.createdAt)}</small>
                    </div>
                    <button className="remove-button" disabled={busy} onClick={() => removeAccount(account.id)}>Xóa</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {mode === 'admin' && (
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">QUYỀN TRUY CẬP ĐÃ XÁC MINH</span>
              <h1>TRANG QUẢN TRỊ ADMIN</h1>
              <p>{session.profile.name} · ID {session.profile.id}</p>
            </div>
            <button className="secondary-button" onClick={logout}>Đăng xuất</button>
          </div>

          <section className="admin-stats">
            <div><strong>{adminOverview?.totals?.users ?? 0}</strong><span>Thành viên</span></div>
            <div><strong>{adminOverview?.totals?.linkedAccounts ?? 0}</strong><span>Tài khoản liên kết</span></div>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">THÀNH VIÊN</span><h2>Danh sách người dùng gần đây</h2></div></div>
            {adminOverview?.users?.length ? (
              <div className="admin-list">
                {adminOverview.users.map(user => (
                  <article className="admin-row" key={user.id}>
                    <div><strong>{user.name}</strong><small>ID: {user.id}{user.username ? ' · @' + user.username : ''}</small></div>
                    <div className="admin-row-meta"><strong>{user.linkedAccounts}</strong><small>liên kết</small></div>
                  </article>
                ))}
              </div>
            ) : <p className="muted">Chưa có dữ liệu thành viên.</p>}
          </section>

          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">QUẢN LÝ LIÊN KẾT</span><h2>Tài khoản vừa được thêm</h2></div></div>
            {adminOverview?.recentAccounts?.length ? (
              <div className="admin-list">
                {adminOverview.recentAccounts.map(account => (
                  <article className="admin-row" key={account.id}>
                    <div><strong>{account.brand} · {account.username}</strong><small>Chủ sở hữu ID: {account.ownerId}</small></div>
                    <small>{formatDate(account.createdAt)}</small>
                  </article>
                ))}
              </div>
            ) : <p className="muted">Chưa có tài khoản liên kết.</p>}
            <p className="form-hint">Trang Admin chỉ hiển thị thông tin tài khoản cần quản lý; không trả về hoặc hiển thị mật khẩu đã mã hóa.</p>
          </section>
        </main>
      )}

      <footer><span>HENDY CYBERTECH</span><small>Phiên đăng nhập được xác minh bởi Telegram</small></footer>
      <Notice message={notice} onClose={() => setNotice('')} />
    </div>
  );
}
