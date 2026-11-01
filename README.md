# Hendy Bot Telegram — Render + Cloudflare

Mã nguồn vận hành bot Telegram và Mini App theo hướng production. Render chạy HTTP/API và tiếp nhận Telegram webhook; Cloudflare D1 là nguồn dữ liệu nghiệp vụ chính; Cloudflare Worker cung cấp cổng API, xử lý tệp R2 và sao lưu CSV; Cloudflare Pages lưu trữ Mini App.

> **Lưu ý bảo mật quan trọng:** repository từng có thông tin xác thực thật trong `.env.example`. Việc thay nội dung file không xoá bí mật khỏi Git history. Hãy thu hồi Bot Token cũ trong BotFather và thay toàn bộ webhook / API secrets đã từng công khai trước khi triển khai. Không đưa bí mật vào README, source code, GitHub Variables hoặc commit.

## 1. Kiến trúc và luồng chạy

```text
Telegram
   │ HTTPS Webhook (secret header)
   ▼
Render Web Service — src/server.js
   ├── Telegram webhook + Bot API
   ├── Express REST API + Telegram initData auth
   ├── Admin allowlist: ADMIN_TELEGRAM_IDS
   └── Cloudflare D1 REST API
          │
          ├── users, wallet, orders, deposits, catalog
          ├── settings, bot_events, audit logs
          └── backup_runs

Cloudflare Pages — mini-app/
   │ VITE_API_BASE_URL
   ▼
Cloudflare Worker — cloudflare/worker.js
   ├── /api/* → proxy tới Render
   ├── /api/storage/* → Cloudflare R2
   ├── /api/backups/run → xuất D1 thành CSV vào R2
   └── Cron 02:00 UTC hằng ngày

Cloudflare R2
   ├── hendy-bot-backups  (private CSV backups + manifest)
   └── hendy-bot-assets   (release files)
```

**Runtime Render duy nhất:** `npm start` chạy `src/server.js`. Service dùng Telegram webhook, không chạy long polling đồng thời. Không cấu hình thêm một service polling riêng cho cùng Bot Token.

## 2. Thành phần đã có trong repository

- `src/server.js`: Express API, health check, static fallback và đăng ký webhook khi bật `SET_WEBHOOK_ON_START`.
- `src/routes/productionApi.js`: API thành viên, API quản trị, thống kê D1, chế độ bảo trì, quản lý cấu hình và kích hoạt backup thủ công.
- `src/security/telegramAuth.js` và `src/middlewares/telegramAuth.js`: xác minh chữ ký Telegram Web App `initData` và quyền quản trị.
- `migrations/`: schema D1, referral và voucher ledger.
- `cloudflare/worker.js`: API proxy, R2 upload/download, CSV backup và cron.
- `mini-app/`: React/Vite Telegram Mini App và dashboard quản trị.
- `render.yaml`: Render Blueprint.
- `.github/workflows/deploy-cloudflare.yml`: triển khai Worker, migrations và Pages.

Dashboard lấy số liệu từ D1 qua `/api/admin/stats`, làm mới mỗi 15 giây trong phiên Mini App. Các thao tác quản trị yêu cầu Telegram `initData` hợp lệ và ID phải thuộc `ADMIN_TELEGRAM_IDS`.

## 3. Chuẩn bị Cloudflare

### 3.1 Tạo D1

Trong Cloudflare Dashboard → **Workers & Pages → D1 SQL Database**, tạo database tên:

`hendy-bot-db`

Sao chép Database ID. Không đưa ID bí mật vào source; workflow nhận giá trị từ GitHub Repository Variable `CLOUDFLARE_D1_DATABASE_ID`.

### 3.2 Tạo hai bucket R2

Trong Cloudflare Dashboard → **R2 Object Storage**, tạo đúng hai bucket:

- `hendy-bot-backups`
- `hendy-bot-assets`

Không bật public access cho bucket backup. Bucket assets chỉ nên được truy cập qua Worker đã kiểm soát đường dẫn.

### 3.3 Cấu hình GitHub Actions

Mở repository → **Settings → Secrets and variables → Actions**.

Tạo các **Repository Secrets**:

| Secret | Mục đích |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token triển khai Cloudflare; chỉ cấp quyền cần thiết |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID Cloudflare |
| `BACKUP_TRIGGER_SECRET` | Bảo vệ endpoint chạy backup |
| `R2_UPLOAD_SECRET` | Bảo vệ endpoint tải release lên R2 |
| `WEBHOOK_SECRET` | Bí mật Telegram webhook; phải trùng với Render |

Tạo các **Repository Variables**:

| Variable | Giá trị |
|---|---|
| `CLOUDFLARE_D1_DATABASE_ID` | Database ID của `hendy-bot-db` |
| `VITE_API_BASE_URL` | URL gốc của Worker, ví dụ `https://hendy-bot-tele-edge.<subdomain>.workers.dev`; không thêm `/api` |

Tạo ba chuỗi bí mật ngẫu nhiên độc lập (không dùng chung một giá trị):

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Lần lượt dùng cho `WEBHOOK_SECRET`, `BACKUP_TRIGGER_SECRET`, `R2_UPLOAD_SECRET`. Telegram webhook secret chỉ nên dùng ký tự chữ/số, dấu gạch dưới hoặc gạch nối; chuỗi hex ở trên đáp ứng định dạng đó.

Tách token theo nguyên tắc quyền tối thiểu: GitHub Secret `CLOUDFLARE_API_TOKEN` dùng để triển khai Worker/Pages/D1/R2; Render chỉ nhận `CLOUDFLARE_D1_API_TOKEN` với quyền đọc/ghi đúng D1 database. Không dùng Global API Key.

Workflow triển khai sẽ:
1. Kiểm tra các secrets/variables bắt buộc.
2. Gắn Database ID vào `wrangler.toml`.
3. Đảm bảo hai R2 bucket tồn tại.
4. Áp dụng các migration D1.
5. Đồng bộ secrets vào Worker.
6. Deploy Worker và build/deploy Mini App lên Pages.

Sau lần deploy đầu tiên, lấy URL thực tế của Worker và Pages để hoàn thiện các biến Render ở phần kế tiếp.

## 4. Triển khai Render từ GitHub

### 4.1 Tạo Web Service từ Blueprint

Trong Render Dashboard:
1. Chọn **New → Blueprint**.
2. Kết nối GitHub và chọn `hendyngo-servers/Hendy-Bot-Tele`.
3. Chọn nhánh `main` hoặc nhánh release bạn đã kiểm duyệt.
4. Render đọc `render.yaml` và tạo Web Service `hendy-bot-tele`.

Build command đã cài cả devDependencies vì Vite là công cụ build, kể cả khi runtime dùng `NODE_ENV=production`. Start command là `npm start`.

### 4.2 Thiết lập Environment Variables trong Render

Điền các giá trị sau trong **Environment** của Web Service:

| Biến | Giá trị |
|---|---|
| `BOT_TOKEN` | Bot Token mới lấy từ BotFather |
| `WEBHOOK_SECRET` | Cùng giá trị GitHub Secret `WEBHOOK_SECRET` |
| `ADMIN_TELEGRAM_IDS` | Telegram numeric ID quản trị, nhiều ID phân cách bằng dấu phẩy |
| `WEBAPP_URL` | URL production Cloudflare Pages |
| `ADMIN_WEBAPP_URL` | URL dashboard/Mini App production |
| `ALLOWED_ORIGINS` | Origin Pages, ví dụ `https://hendy-bot-miniapp.pages.dev`; nhiều origin phân cách bằng dấu phẩy |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 Database ID |
| `CLOUDFLARE_D1_API_TOKEN` | Token riêng cho Render; chỉ cần quyền đọc/ghi D1 database này |
| `BACKUP_WORKER_URL` | URL gốc Worker |
| `BACKUP_TRIGGER_SECRET` | Cùng giá trị GitHub Secret `BACKUP_TRIGGER_SECRET` |
| `R2_UPLOAD_WORKER_URL` | URL gốc Worker |
| `R2_UPLOAD_SECRET` | Cùng giá trị GitHub Secret `R2_UPLOAD_SECRET` |
| `VIETQR_BANK_ID`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME` | Thông tin tài khoản nhận tiền đã xác minh |
| `GROUP_CHAT_URL`, `NEWS_CHANNEL_URL`, `SUPPORT_URL` | Link Telegram/chăm sóc khách hàng chính thức |

`BASE_URL` có thể đặt thành URL Render, nhưng nếu bỏ trống ứng dụng sẽ dùng `RENDER_EXTERNAL_URL` do Render cung cấp. Blueprint đặt `SET_WEBHOOK_ON_START=true`; khi service khởi động, ứng dụng tự đăng ký webhook tại `/api/telegram/webhook`.

**Không điền giá trị giả cho thông tin ngân hàng hoặc URL cộng đồng.** Nếu chưa cấu hình thanh toán, API tạo yêu cầu nạp tiền sẽ trả trạng thái chưa sẵn sàng thay vì tạo giao dịch giả.

### 4.3 Cấu hình URL Worker

Trong `wrangler.toml`, kiểm tra biến `RENDER_BACKEND_URL` trỏ tới đúng URL Web Service Render của bạn. Nếu service có domain riêng, cập nhật biến này rồi push để deploy lại Worker.

## 5. Triển khai và kiểm tra

Sau khi đã khai báo secrets và variables:
1. Chạy workflow **Deploy Cloudflare Worker and Pages** bằng `workflow_dispatch`, hoặc push thay đổi thuộc các đường dẫn được workflow theo dõi.
2. Chờ job migrations, Worker và Pages hoàn tất.
3. Kiểm tra `https://<worker-domain>/health`; kết quả phải có D1 `connected` và R2 binding sẵn sàng.
4. Kiểm tra Render `https://<render-domain>/health`; kết quả phải có `status: ok`, D1 `connected`.
5. Mở bot trên Telegram, gửi `/start`; dùng `/admin` để mở dashboard.
6. Kiểm tra bot nhận webhook trong Admin → Telegram Webhook.
7. Kiểm tra Mini App dùng đúng Worker URL qua `VITE_API_BASE_URL`.

Các endpoint health chỉ xác nhận dịch vụ và D1; chúng không thay thế việc kiểm thử luồng thanh toán, webhook và phân quyền trên một tài khoản test riêng trước khi mở cho người dùng thật.

## 6. Bảo trì và dashboard

- Dashboard chỉ cấp quyền cho ID nằm trong `ADMIN_TELEGRAM_IDS`.
- Thống kê `/api/admin/stats` được truy vấn trực tiếp từ D1 và Mini App làm mới theo chu kỳ 15 giây.
- Cấu hình công khai như lời chào, kênh hỗ trợ và thông tin VietQR được lưu trong `bot_settings`; secrets vận hành vẫn đặt trong Render/GitHub/Worker secrets, không lưu vào D1.
- Bật/tắt bảo trì trong dashboard. Khi bật, người dùng thường bị chặn các API thành viên và bot trả thông báo bảo trì; quản trị viên vẫn truy cập được dashboard.
- SQL console chỉ cho phép câu lệnh `SELECT` đơn, chỉ đọc và yêu cầu quyền admin. Không chia sẻ tài khoản quản trị.

## 7. Sao lưu D1 → CSV → R2

Worker có cron trong `wrangler.toml`:

```toml
[triggers]
crons = ["0 2 * * *"]
```

Lịch chạy lúc **02:00 UTC mỗi ngày** (09:00 giờ Việt Nam). Worker xuất từng bảng trong danh sách sao lưu sang CSV UTF-8, tạo `manifest.json` chứa số dòng, dung lượng và SHA-256, sau đó lưu trong bucket `hendy-bot-backups` theo cấu trúc:

```text
d1-csv-backups/YYYY/MM/DD/<backup-id>/
  users.csv
  bot_settings.csv
  orders.csv
  ...
  manifest.json
```

Các bảng nghiệp vụ quan trọng gồm users, settings, bot events, orders, deposits, wallet/voucher ledgers, catalog, giftcodes, support, referrals, audit logs và backup history.

Có thể chạy backup thủ công từ Dashboard → **Sao lưu ngay**. Endpoint Worker được bảo vệ bằng `BACKUP_TRIGGER_SECRET`; không mở endpoint sao lưu công khai.

**Giới hạn hiện tại:** chức năng này tạo bản xuất CSV và manifest; không tự động khôi phục D1 từ CSV. Cần thử nghiệm quy trình restore riêng trên database staging trước khi coi backup là phương án khôi phục thảm họa đã được xác nhận. Backup chứa Telegram ID, thông tin tài khoản và dữ liệu giao dịch; giới hạn quyền truy cập R2 và thiết lập retention phù hợp trong Cloudflare.

## 8. Chạy và kiểm tra cục bộ

Yêu cầu Node.js 22 trở lên.

```bash
cp .env.example .env
# Điền Bot Token, D1 credentials và URL cần thiết trong .env
npm install --include=dev
npm run build
npm test
npm run lint
npm start
```

Trong môi trường local, đặt `SET_WEBHOOK_ON_START=false` cho tới khi có một HTTPS URL công khai. Để chạy Mini App và API cùng Express trong chế độ phát triển:

```bash
npm run dev
```

Không dùng D1/R2 production cho kiểm thử phá huỷ. Nên tạo database/bucket staging riêng và chỉ mở quyền quản trị cho tài khoản test.

## 9. Checklist trước khi mở dịch vụ

- [ ] Bot Token đã được tạo mới sau sự cố lộ credential và chỉ lưu trong Render.
- [ ] Webhook, backup và upload secrets là ba giá trị ngẫu nhiên độc lập.
- [ ] D1 migrations đã áp dụng thành công.
- [ ] Worker bindings trỏ đúng D1 và R2 bucket.
- [ ] Pages build dùng đúng `VITE_API_BASE_URL`.
- [ ] Render `ALLOWED_ORIGINS` chứa đúng Pages production origin.
- [ ] `ADMIN_TELEGRAM_IDS` đã xác minh; tài khoản admin bật 2FA cho Telegram.
- [ ] Webhook được Telegram xác nhận, health check D1 thành công.
- [ ] Backup thủ công thành công và các CSV/manifest xuất hiện trong R2.
- [ ] Đã kiểm thử bảo trì, phân quyền, thanh toán và quy trình xử lý giao dịch trên staging.

