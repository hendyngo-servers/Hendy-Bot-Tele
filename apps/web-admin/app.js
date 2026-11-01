(() => {
  const API = (window.HENDY_CONFIG?.apiBase || "").replace(/\/$/, "");
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || "";
  const notice = document.querySelector("#notice");
  const headers = () => ({ "content-type": "application/json", ...(initData ? { "X-Telegram-Init-Data": initData } : {}) });
  async function api(path, options = {}) {
    if (!API || API.includes("example.com")) throw new Error("Chưa cấu hình domain API trong config.js.");
    const response = await fetch(API + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Yêu cầu không thành công.");
    return body.data;
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(label, className, callback) {
    const element = node("button", className, label);
    element.type = "button"; element.addEventListener("click", callback); return element;
  }
  async function loadOverview() {
    const data = await api("/api/v1/admin/overview");
    document.querySelector("#users").textContent = data.users;
    document.querySelector("#orders-count").textContent = data.pendingOrders;
    document.querySelector("#deposits-count").textContent = data.pendingDeposits;
    document.querySelector("#tickets-count").textContent = data.openTickets;
  }
  async function loadOrders() {
    const items = await api("/api/v1/admin/orders?status=pending");
    const root = document.querySelector("#order-list"); root.replaceChildren();
    if (!items.length) { root.append(node("p", "muted", "Không có đơn chờ xử lý.")); return; }
    items.forEach(item => {
      const row = node("div", "row-item");
      const detail = node("div", "");
      detail.append(node("strong", "", item.package_name || "Dịch vụ"));
      detail.append(node("small", "muted", (item.display_name || item.telegram_id) + " · " + new Intl.NumberFormat("vi-VN").format(item.total_vnd) + " đ"));
      row.append(detail);
      row.append(button("Đang xử lý", "secondary", async () => { await api("/api/v1/admin/orders/" + item.id, { method: "PATCH", body: JSON.stringify({ status: "processing" }) }); await reload(); }));
      row.append(button("Hoàn tất", "", async () => { await api("/api/v1/admin/orders/" + item.id, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }); await reload(); }));
      row.append(button("Từ chối / hoàn tiền", "danger", async () => { await api("/api/v1/admin/orders/" + item.id, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }); await reload(); }));
      root.append(row);
    });
  }
  async function loadDeposits() {
    const items = await api("/api/v1/admin/deposits?status=pending");
    const root = document.querySelector("#deposit-list"); root.replaceChildren();
    if (!items.length) { root.append(node("p", "muted", "Không có yêu cầu nạp tiền.")); return; }
    items.forEach(item => {
      const row = node("div", "row-item");
      const detail = node("div", "");
      detail.append(node("strong", "", new Intl.NumberFormat("vi-VN").format(item.amount_vnd) + " đ"));
      detail.append(node("small", "muted", (item.display_name || item.telegram_id) + " · Nội dung: " + item.reference));
      row.append(detail);
      row.append(button("Duyệt nạp", "", async () => { await api("/api/v1/admin/deposits/" + item.id, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }); await reload(); }));
      row.append(button("Từ chối", "danger", async () => { await api("/api/v1/admin/deposits/" + item.id, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }); await reload(); }));
      root.append(row);
    });
  }
  async function loadSettings() {
    const items = await api("/api/v1/admin/settings");
    const values = Object.fromEntries(items.map(item => [item.key, item.value]));
    document.querySelector("#site-name").value = values.site_name || "";
    document.querySelector("#support").value = values.support_username || "";
    document.querySelector("#news").value = values.news_channel_url || "";
    document.querySelector("#group").value = values.group_chat_url || "";
    document.querySelector("#bank-info").value = values.bank_transfer_info || "";
    document.querySelector("#maintenance").checked = values.maintenance_mode === true;
  }
  async function loadTickets() {
    const items = await api("/api/v1/admin/tickets");
    const root = document.querySelector("#ticket-list"); root.replaceChildren();
    if (!items.length) { root.append(node("p", "muted", "Chưa có yêu cầu hỗ trợ.")); return; }
    items.forEach(item => {
      const row = node("div", "ticket-item");
      row.append(node("strong", "", item.subject));
      row.append(node("p", "muted", (item.display_name || item.telegram_id) + " · " + item.message));
      const reply = document.createElement("textarea"); reply.rows = 2; reply.maxLength = 4000;
      reply.placeholder = "Nội dung trả lời…"; reply.value = item.admin_reply || "";
      const status = document.createElement("select");
      ["open", "answered", "closed"].forEach(value => {
        const option = document.createElement("option"); option.value = value; option.textContent = value; status.append(option);
      });
      status.value = item.status;
      row.append(reply, status, button("Lưu phản hồi", "secondary", async () => {
        await api("/api/v1/admin/tickets/" + item.id, { method: "PATCH", body: JSON.stringify({ reply: reply.value, status: status.value }) });
        notice.textContent = "Đã cập nhật yêu cầu hỗ trợ.";
      }));
      root.append(row);
    });
  }
  async function reload() {
    try {
      await Promise.all([loadOverview(), loadOrders(), loadDeposits(), loadSettings(), loadTickets()]);
      notice.textContent = "Đã kết nối. Tài khoản quản trị được xác thực qua Telegram.";
      notice.classList.remove("error");
    } catch (error) { notice.textContent = error.message; notice.classList.add("error"); }
  }
  document.querySelector("#package-form").addEventListener("submit", async event => {
    event.preventDefault();
    const result = document.querySelector("#package-result");
    try {
      await api("/api/v1/admin/packages", { method: "POST", body: JSON.stringify({
        name: document.querySelector("#pkg-name").value, slug: document.querySelector("#pkg-slug").value,
        category: document.querySelector("#pkg-category").value, priceVnd: Number(document.querySelector("#pkg-price").value),
        description: document.querySelector("#pkg-description").value
      }) });
      result.textContent = "Đã tạo dịch vụ."; event.target.reset();
    } catch (error) { result.textContent = error.message; }
  });
  document.querySelector("#settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const result = document.querySelector("#settings-result");
    try {
      await api("/api/v1/admin/settings", { method: "PUT", body: JSON.stringify({ settings: {
        site_name: document.querySelector("#site-name").value,
        support_username: document.querySelector("#support").value,
        news_channel_url: document.querySelector("#news").value,
        group_chat_url: document.querySelector("#group").value,
        bank_transfer_info: document.querySelector("#bank-info").value,
        maintenance_mode: document.querySelector("#maintenance").checked
      } }) });
      result.textContent = "Đã lưu cấu hình.";
    } catch (error) { result.textContent = error.message; }
  });
  document.querySelector("#refresh").addEventListener("click", reload);
  if (!initData) notice.textContent = "Hãy mở trang quản trị bên trong Telegram Mini App bằng tài khoản admin.";
  else { telegram?.ready(); telegram?.expand(); reload(); }
})();
