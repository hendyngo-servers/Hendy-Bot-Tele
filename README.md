# Hendy-Bot-Tele

Hendy-Bot-Tele là Telegram Bot Telegraf + REST API Express + Admin Mini App React/Vite. Bot, API và Mini App chạy trên một Render Web Service. **MongoDB Atlas là database chính**; Cloudflare R2 tiếp tục lưu ảnh QR riêng tư. Không sử dụng WebSocket hoặc worker riêng.

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
├── migrations/d1/                  # SQL migration cũ, dùng để đối chiếu dữ liệu legacy
├── src/
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── security/
│   ├── services/
│   │   ├── mongoService.js         # Kết nối MongoDB Atlas
│   │   ├── userService.js          # Hồ sơ, số dư, VIP
│   │   └── appDataService.js       # Đơn hàng, nạp tiền, giftcode, REF...
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

Các nút thành viên là Telegram Inline Keyboard callback, xử lý trực tiếp trong `src/controllers/botController.js` và `src/utils/keyboards.js`. Menu thành viên không mở Mini App và không gọi REST API Mini App.

- Mini Game Live: quản lý tài khoản liên kết; mật khẩu được mã hóa AES-256-GCM.
- Thuê Tool, Mua Code, OTP & Proxy, VIP, Ghép đối đầu: danh mục và đơn hàng.
- Ví điện tử: tạo yêu cầu nạp, QR VietQR/ảnh QR và lịch sử.
- Trung tâm khách hàng: hồ sơ, số dư, VIP và lịch sử.
- REF: mã/link giới thiệu và hoa hồng.
- Giftcode: nhập mã trong Telegram.
- Nhóm chat, kênh thông báo và CSKH.

## Mini App — chỉ dành cho Admin

Mini App React/Vite chỉ phục vụ Admin. Người không có quyền Admin không truy cập được dữ liệu quản trị. Máy chủ xác thực chữ ký `Telegram.WebApp.initData` và Telegram ID khớp `ADMIN_ID`.

Dashboard gồm tổng quan, QR/thanh toán, duyệt nạp, danh mục, đơn hàng, giftcode, thành viên, hỗ trợ và broadcast.

## MongoDB Atlas — database chính

Backend dùng official MongoDB Node.js driver. Khi khởi động, ứng dụng:
1. Kết nối `MONGODB_URI`, ping database và tạo index cần thiết.
2. Tải hồ sơ thành viên từ collection `users`.
3. Tải dữ liệu nghiệp vụ từ các collection `linkedAccounts`, `deposits`, `tickets`, `catalog`, `orders`, `giftcodes`, `referrals` và cấu hình từ `settings`.
4. Ghi mọi thay đổi từ Bot/Admin về MongoDB; MongoDB là nguồn dữ liệu chính trên Render.

### Tạo MongoDB Atlas

1. Mở [MongoDB Atlas](https://cloud.mongodb.com/), tạo Project và Cluster.
2. Chọn AWS Singapore (`ap-southeast-1`) để gần Render Singapore.
3. Tạo **Database User** riêng cho ứng dụng, chỉ cấp quyền đọc/ghi trên database `hendy_bot`; không dùng tài khoản Atlas đăng nhập Dashboard.
4. Vào **Network Access** và cho phép các outbound IP ranges được Render hiển thị cho Web Service. Không mở `0.0.0.0/0` lâu dài nếu có thể giới hạn theo IP.
5. Chọn **Connect → Drivers → Node.js**, sao chép URI `mongodb+srv://...`, thay placeholder bằng mật khẩu Database User đã URL-encode nếu có ký tự đặc biệt.
6. Đặt tên database là `hendy_bot` qua biến `MONGODB_DB_NAME`.

Tài liệu chính thức:
- [MongoDB Atlas — Connect to a cluster](https://www.mongodb.com/docs/atlas/driver-connection/)
- [MongoDB Node.js Driver — Connection targets](https://www.mongodb.com/docs/drivers/node/current/connect/connection-targets/)
- [Render — Connect to MongoDB Atlas](https://render.com/docs/connect-to-mongodb-atlas)

### Tự động di chuyển dữ liệu cũ

Khi khởi động với MongoDB:
- `users.json` được nhập vào collection `users`.
- `app-data.json` được nhập vào các collection nghiệp vụ.
- Nếu cung cấp đủ biến D1 legacy (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`), dữ liệu D1 được nhập theo ID và không ghi đè bản ghi đã tồn tại trong MongoDB.
- Nếu cung cấp `DATABASE_URL` legacy, hồ sơ từ PostgreSQL `hendy_users` được nhập theo Telegram ID và không ghi đè bản ghi đã tồn tại.
- Các file JSON chỉ được đổi tên thành bản sao lưu sau khi nhập thành công.

**Không xóa D1/PostgreSQL cũ hoặc Persistent Disk trước khi xác nhận số lượng hồ sơ, đơn hàng, số dư, giftcode và cấu hình trong MongoDB.** Nên giữ backup ít nhất một bản ngoài hệ thống.

## Cloudflare R2 — lưu ảnh QR

R2 vẫn được dùng để lưu ảnh QR tải lên từ Admin. Bucket giữ private; backend sử dụng S3 Access Key/Secret và presigned URL có thời hạn. Không đưa R2 credentials xuống Mini App.

Tạo bucket riêng, ví dụ `hendy-bot-assets`, rồi cấp R2 Object Read & Write giới hạn đúng bucket.

## Chạy local

Yêu cầu Node.js 24.22.1.

```bash
cp .env.example .env
# Điền BOT_TOKEN, ADMIN_ID, APP_ENCRYPTION_KEY và MONGODB_URI.
npm install
npm run check
npm test
npm run build
npm start
```

Ví dụ định dạng URI (không dùng nguyên văn):
`mongodb+srv://<database-user>:<encoded-password>@<cluster-host>/hendy_bot?retryWrites=true&w=majority`

## Render Web Service

Blueprint `render.yaml` cấu hình:
- Một Node Web Service tại Singapore, một instance.
- Persistent Disk tại `/var/data` để giữ backup JSON cũ trong giai đoạn migration.
- MongoDB Atlas là database chính qua `MONGODB_URI`.
- Cloudflare R2 tiếp tục lưu ảnh QR.
- D1 và PostgreSQL chỉ là nguồn migration cũ nếu bạn chủ động cấu hình các biến tương ứng.
- Build: `npm install --no-audit --no-fund && npm run check && npm test && npm run build`.
- Start: `npm start`; health check: `/healthz`.

### Secrets cần cấu hình trong Render Environment

| Biến | Cách cấu hình |
|---|---|
| `MONGODB_URI` | Secret URI từ Atlas → Connect → Drivers |
| `MONGODB_DB_NAME` | `hendy_bot` |
| `BOT_TOKEN` | Token mới tạo từ BotFather |
| `ADMIN_ID` | Telegram numeric user ID Admin |
| `APP_ENCRYPTION_KEY` | Khóa ngẫu nhiên riêng, tối thiểu 32 ký tự |
| `R2_BUCKET_NAME` | Tên bucket R2 |
| `R2_ACCESS_KEY_ID` | R2 S3 Access Key ID mới |
| `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Access Key mới |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID; chỉ cần cho R2 và migration D1 |
| `CLOUDFLARE_D1_DATABASE_ID` | Tùy chọn, chỉ khi import D1 cũ |
| `CLOUDFLARE_API_TOKEN` | Tùy chọn, chỉ khi import D1 cũ; D1 Read + D1 Write |
| `DATABASE_URL` | Tùy chọn tạm thời, chỉ khi import PostgreSQL cũ |

`WEBAPP_URL` / `MINI_APP_URL` có thể dùng `RENDER_EXTERNAL_URL` làm mặc định; nếu dùng domain riêng, cấu hình URL HTTPS tương ứng.

Production sẽ dừng nếu MongoDB, Bot Token, Admin ID, khóa mã hóa hoặc R2 không được cấu hình hợp lệ. Không commit bất kỳ secret thật nào vào GitHub.

## CI

GitHub Actions khởi chạy MongoDB và PostgreSQL tạm thời, kiểm tra cú pháp, chạy test adapter local/D1/PostgreSQL/MongoDB, build Mini App và xác nhận `public/index.html`.

CI dùng credential test nội bộ của service container, không cần secret Atlas hoặc Cloudflare thật.

## Bảo mật & vận hành

- `.env` bị Git ignore; chỉ commit `.env.example` với giá trị secret trống.
- Credential đã từng lộ trong Git history phải được thu hồi và thay mới. Chỉ sửa file mới nhất không xóa lịch sử commit cũ.
- Dùng database user riêng cho ứng dụng, giới hạn quyền đúng database.
- Giới hạn Atlas Network Access theo outbound IP của Render.
- R2 bucket giữ private; presigned URL có thời hạn.
- Nạp tiền chỉ cộng sau khi Admin đối soát giao dịch thực tế và duyệt; chưa có webhook ngân hàng tự động.
- Tool/OTP/Proxy/Code muốn tự động cấp cần API nhà cung cấp thực tế.

## Kiểm tra local

```bash
npm run check
npm test
npm run build
```
