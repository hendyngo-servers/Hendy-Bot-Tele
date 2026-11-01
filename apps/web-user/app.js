(() => {
  const API = (window.HENDY_CONFIG?.apiBase || "").replace(/\/$/, "");
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || "";
  const statusNode = document.querySelector("#status");
  const packagesNode = document.querySelector("#packages");
  const ordersNode = document.querySelector("#orders");
  const money = value => new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " đ";
  const headers = () => ({ "content-type": "application/json", ...(initData ? { "X-Telegram-Init-Data": initData } : {}) });
  async function api(path, options = {}) {
    if (!API || API.includes("example.com")) throw new Error("Chưa cấu hình domain API trong config.js.");
    const response = await fetch(API + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Không thể kết nối máy chủ.");
    return body.data;
  }
  function setStatus(message, bad = false) { statusNode.textContent = message; statusNode.classList.toggle("error", bad); }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function renderPackages(items) {
    packagesNode.replaceChildren();
    if (!items.length) { packagesNode.append(make("p", "muted", "Chưa có dịch vụ được mở bán.")); return; }
    items.forEach(item => {
      const card = make("article", "product-card");
      card.append(make("small", "category", item.category), make("h3", "", item.name));
      card.append(make("p", "muted", item.description || "Dịch vụ thuộc hệ sinh thái Hendy."));
      const bottom = make("div", "product-bottom");
      bottom.append(make("strong", "", money(item.price_vnd)));
      const button = make("button", "", "Đặt dịch vụ");
      button.type = "button"; button.disabled = !initData;
      button.addEventListener("click", async () => {
        if (!initData) return;
        try {
          await api("/api/v1/orders", { method: "POST", body: JSON.stringify({ packageId: item.id, quantity: 1 }) });
          setStatus("Đã tạo đơn thành công. Đơn đang chờ xử lý.");
          await Promise.all([loadProfile(), loadOrders()]);
        } catch (error) { setStatus(error.message, true); }
      });
      bottom.append(button); card.append(bottom); packagesNode.append(card);
    });
  }
  async function loadProfile() {
    if (!initData) { setStatus("Hãy mở Mini App từ Telegram bot để đăng nhập."); return; }
    const profile = await api("/api/v1/me");
    document.querySelector("#member-name").textContent = profile.display_name || profile.username || "Thành viên Hendy";
    document.querySelector("#member-id").textContent = "Telegram ID: " + profile.telegram_id;
    document.querySelector("#balance").textContent = money(profile.balance_vnd);
    setStatus("Đã xác thực Telegram thành công.");
  }
  async function loadOrders() {
    if (!initData) return;
    const items = await api("/api/v1/me/orders");
    ordersNode.replaceChildren();
    if (!items.length) { ordersNode.append(make("p", "muted", "Bạn chưa có đơn hàng nào.")); return; }
    items.forEach(item => {
      const row = make("div", "order-row");
      const detail = make("div", "");
      detail.append(make("strong", "", item.package_name || "Đơn hàng"));
      detail.append(make("small", "muted", new Date(item.created_at + "Z").toLocaleString("vi-VN")));
      row.append(detail, make("b", "order-status", item.status + " · " + money(item.total_vnd)));
      ordersNode.append(row);
    });
  }
  document.querySelector("#deposit-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const amountVnd = Number(document.querySelector("#deposit-amount").value);
      const result = await api("/api/v1/deposits", { method: "POST", body: JSON.stringify({ amountVnd }) });
      document.querySelector("#deposit-result").textContent = "Mã tham chiếu: " + result.reference + " • " + money(result.amountVnd) + ". " + result.instruction;
    } catch (error) { document.querySelector("#deposit-result").textContent = error.message; }
  });
  document.querySelector("#ticket-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await api("/api/v1/tickets", { method: "POST", body: JSON.stringify({
        subject: document.querySelector("#ticket-subject").value,
        message: document.querySelector("#ticket-message").value
      }) });
      document.querySelector("#ticket-result").textContent = "Đã gửi yêu cầu hỗ trợ.";
      event.target.reset();
    } catch (error) { document.querySelector("#ticket-result").textContent = error.message; }
  });
  document.querySelector("#refresh").addEventListener("click", async () => {
    try { await Promise.all([loadProfile(), loadOrders()]); } catch (error) { setStatus(error.message, true); }
  });
  if (telegram) { telegram.ready(); telegram.expand(); }
  api("/api/v1/packages").then(renderPackages).catch(error => packagesNode.replaceChildren(make("p", "error", error.message)));
  loadProfile().then(loadOrders).catch(error => setStatus(error.message, true));
})();
