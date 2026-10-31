# Hendy-Bot-Tele

Hendy-Bot-Tele là Telegram Bot Telegraf + REST API Express + Admin Mini App React/Vite. Bot/API/Mini App chạy trên một Render Web Service; dữ liệu nghiệp vụ quan hệ nằm trong Cloudflare D1 và tệp/ảnh nằm trong Cloudflare R2. Không sử dụng WebSocket hoặc worker riêng.

## Cấu trúc repository

```text
Hendy-Bot-Tele/
├── .github/workflows/ci.yml
├── mini-app/
│   ├── src/App.jsx
│   ├── src/main.jsx
│   ├── src/style.css
│   ├── index.html
│   └── vite.config.mjs
├── public/                         # Vite tự sinh khi npm run build; không commit
├── migrations/d1/
│   ├── 0001_hendy_users.sql
│   └── 0002_hendy_app_data.sql
├── src/
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── security/
│   ├── services/
│   │   ├── cloudflareD1Service.js
│   │   ├── r2StorageService.js
│   │   ├── userService.js
│   │   └── appDataService.js
│   ├── utils/keyboards.js
│   └── server.js
├── .env.example
├── .gitignore
├── .node-version
├── package.json
├── render.yaml
└── README.md
```

## Menu thành viên — Telegram Bot native

14 nút thành viên là Telegram Inline Keyboard callback, được xử lý trực tiếp trong `src/controllers/botController.js` và `src/utils/keyboards.js`. Menu thành viên không mở Mini App và không gọi REST API Mini App.

- **Mini Game Live:** thêm/xóa tài khoản liên kết theo nhà cung cấp; mật khẩu được mã hóa AES-256-GCM.
- **Thuê Tool, Mua Code, OTP & Proxy, VIP, Ghép đối đầu:** đọc danh mục từ D1 và tạo đơn trực tiếp từ Bot.
- **Ví điện tử:** tạo yêu cầu nạp, QR VietQR hoặc ảnh QR đã lưu ở R2, xem lịch sử giao dịch.
- **Trung tâm khách hàng:** hồ sơ, số dư, VIP và lịch sử hoạt động.
- **REF:** mã/link giới thiệu, thống kê và hoa hồng.
- **Giftcode:** nhập ngay trong cuộc trò chuyện.
- **Nhóm chat, kênh thông báo, CSKH:** liên kết cấu hình được lấy từ D1; yêu cầu hỗ trợ được lưu thành ticket.

Lệnh thành viên: `/start`, `/menu` mở menu và `/cancel` hủy bước nhập liệu.

## Mini App — chỉ dành cho Admin

Mini App React/Vite chỉ phục vụ quản trị. Người không có quyền Admin sẽ thấy hướng dẫn quay lại Bot và không tải dữ liệu nghiệp vụ thành viên. Admin được xác thực bằng chữ ký `Telegram.WebApp.initData` và Telegram ID khớp `ADMIN_ID` tại máy chủ.

Admin dashboard có tổng quan, trạng thái D1/R2, QR/thanh toán, duyệt nạp, danh mục, đơn hàng, giftcode, thành viên, hỗ trợ và broadcast.

## Cloudflare D1 — dữ liệu quan hệ

Ứng dụng sử dụng D1 qua Cloudflare REST API:
`POST /accounts/{account_id}/d1/database/{database_id}/query`.
Token API chỉ được lưu trong Render Environment, không gửi xuống Mini App.

D1 là kho chính của:
- Hồ sơ thành viên (`hendy_users`): Telegram ID, tên, username, số dư, VIP và ngày tạo.
- Tài khoản liên kết, yêu cầu nạp, catalog, đơn hàng, ticket, giftcode, referral.
- Cấu hình thanh toán và liên kết Bot.

Các bảng được tạo lúc ứng dụng khởi động. SQL migration tương ứng nằm tại `migrations/d1/`.

### Di chuyển dữ liệu cũ

Khi khởi động lần đầu với D1:
1. Code tạo bảng/index nếu chưa có.
2. Import `users.json` và `app-data.json` hiện có vào D1, dùng ID làm khóa và không ghi đè bản ghi đã có.
3. Nếu Render PostgreSQL cũ còn được kết nối, hồ sơ từ bảng `hendy_users` cũng được nhập vào D1 bằng `ON CONFLICT DO NOTHING`.
4. Chỉ sau khi import thành công, các file JSON cũ được đổi tên thành `*.migrated-d1-<timestamp>`; bản sao lưu vẫn nằm trên Persistent Disk.
5. Sau migration, D1 là nguồn chính cho hồ sơ và dữ liệu nghiệp vụ.

Render PostgreSQL đang được giữ trong Blueprint để làm nguồn di chuyển/rollback cho dữ liệu cũ. Không xóa database đó trước khi kiểm tra số lượng hồ sơ và sao lưu D1 thành công. Sau khi xác nhận migration, có thể đánh giá riêng việc ngừng database Render để tránh chi phí không cần thiết.

## Cloudflare R2 — ảnh và object storage

R2 được dùng cho ảnh QR thanh toán:
- Admin tải PNG/JPEG/WebP tối đa 2 MB lên từ trang **QR & Thanh toán**.
- Backend lưu object vào bucket riêng theo prefix `private/qr/`.
- Bucket không cần public; Bot và giao diện Admin dùng presigned GET URL có thời hạn 1 giờ.
- S3 Access Key/Secret chỉ tồn tại ở backend Render; không đưa vào browser hoặc database.

Muốn thêm loại tệp khác, nên bổ sung namespace, MIME allowlist, giới hạn kích thước và quyền tải riêng trước khi bật chức năng.

## Tạo tài nguyên Cloudflare

Cloudflare account ID lấy từ đường dẫn Dashboard mà bạn đã cung cấp:
`918ff2f016938fc978ed23b96505b21e`.

1. **Tạo D1 database:** trong Cloudflare Dashboard → Storage & databases → D1 SQL Database → Create database. Đặt tên gợi ý `hendy-bot-data`; sao chép Database ID (UUID).
2. **Tạo R2 bucket:** Storage & databases → R2 object storage → Create bucket. Dùng đúng tên `hendy-bot-assets` để khớp Blueprint.
3. **Tạo Cloudflare API Token cho D1:** cấp quyền `D1 Read` và `D1 Write`, giới hạn đúng account cần dùng. Lưu token một lần vào Render Environment.
4. **Tạo R2 API Token:** tại R2 → Manage R2 API Tokens, cấp `Object Read & Write` và giới hạn bucket `hendy-bot-assets`. Lưu riêng Access Key ID và Secret Access Key. Đây là cặp credential S3, khác với Cloudflare API Token của D1.

Không dùng Global API Key cho ứng dụng.

## Chạy local

Yêu cầu Node.js 24.22.1 (được khóa trong `.node-version`).

```bash
cp .env.example .env
# Điền Telegram BOT_TOKEN, ADMIN_ID và APP_ENCRYPTION_KEY.
# Khi chưa cấu hình Cloudflare, có thể để trống CLOUDFLARE_* / R2_* để chạy JSON local.
npm install
npm run check
npm test
npm run build
npm start
```

Khi bật D1 local, phải điền đủ `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`. Khi bật R2, phải điền đủ `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; `CLOUDFLARE_ACCOUNT_ID` dùng chung endpoint R2.

## Render Web Service

`render.yaml` khai báo:
- Một Node Web Service tại Singapore, một instance.
- Một Persistent Disk tại `/var/data` để giữ backup migration và dùng cho local/legacy adapter.
- Render PostgreSQL hiện hữu được giữ trong Blueprint làm nguồn migration dự phòng.
- Cloudflare D1 và R2 cấu hình bằng Render Environment; không nhúng API token/secret trong YAML.
- Build: `npm install --no-audit --no-fund && npm run check && npm test && npm run build`.
- Start: `npm start`; health check: `/healthz`.

### Biến môi trường cần có trên Render

| Biến | Giá trị / nguồn |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Đã điền từ Cloudflare Dashboard |
| `CLOUDFLARE_D1_DATABASE_ID` | Database ID của D1 `hendy-bot-data` |
| `CLOUDFLARE_API_TOKEN` | Secret token có D1 Read + D1 Write |
| `R2_BUCKET_NAME` | `hendy-bot-assets` |
| `R2_ACCESS_KEY_ID` | R2 S3 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Access Key |
| `BOT_TOKEN` | Token mới từ BotFather |
| `ADMIN_ID` | Telegram numeric user ID của Admin |
| `APP_ENCRYPTION_KEY` | Chuỗi ngẫu nhiên riêng, tối thiểu 32 ký tự |
| `DATABASE_URL` | Được Render nối từ PostgreSQL cũ trong Blueprint để hỗ trợ migration |

Ứng dụng kiểm tra D1 và R2 khi khởi động production. Nếu D1 ID/token, R2 bucket/keys hoặc bucket thực tế không tồn tại/không truy cập được, tiến trình sẽ dừng để tránh chạy với một phần dữ liệu không được lưu bền vững.

## CI

GitHub Actions `.github/workflows/ci.yml`:
1. Cài dependencies theo Node version trong `.node-version`.
2. Kiểm tra cú pháp.
3. Chạy test D1 bằng mock API, migration JSON/Postgres, R2 validation và nghiệp vụ.
4. Build Mini App vào `public/`.
5. Kiểm tra `public/index.html`.

CI không cần Cloudflare token thật và không truy cập tài khoản Cloudflare của bạn.

## Bảo mật và vận hành

- `.env` bị Git ignore; chỉ commit `.env.example` với secrets trống.
- Bot Token từng xuất hiện trong Git history phải được thu hồi tại BotFather và thay bằng token mới.
- D1 REST token và R2 S3 keys chỉ lưu trong Render Environment.
- R2 bucket giữ private; URL tải ảnh là presigned URL ngắn hạn.
- Ảnh upload được whitelist PNG/JPEG/WebP và giới hạn 2 MB.
- Nạp tiền chỉ cộng sau khi Admin đối soát giao dịch thực tế và duyệt. Chưa có webhook ngân hàng tự động.
- Các dịch vụ Tool/OTP/Proxy/Code muốn tự động cấp cần API nhà cung cấp thực tế.

## Kiểm tra local

```bash
npm run check
npm test
npm run build
```
