# Hendy-Bot-Tele

Hendy-Bot-Tele là Telegram Bot Telegraf + REST API Express + Admin Mini App React/Vite, triển khai trên một Render Web Service. Menu thành viên chạy trực tiếp trong Telegram Bot; Mini App chỉ dành cho Admin. Không dùng WebSocket hoặc worker riêng.

## Cấu trúc repository

```text
Hendy-Bot-Tele/
├── .github/
│   └── workflows/
│       └── ci.yml
├── mini-app/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── style.css
│   ├── index.html
│   └── vite.config.mjs
├── public/                       # Vite tự sinh khi npm run build; không commit
├── src/
│   ├── controllers/
│   │   ├── botController.js
│   │   └── botController.test.js
│   ├── middlewares/
│   │   └── errorHandler.js
│   ├── routes/
│   │   └── api.js
│   ├── security/
│   │   ├── cryptoService.js
│   │   ├── cryptoService.test.js
│   │   ├── telegramAuth.js
│   │   └── telegramAuth.test.js
│   ├── services/
│   │   ├── appDataService.js
│   │   ├── appDataService.test.js
│   │   ├── telegramStartup.js
│   │   ├── telegramStartup.test.js
│   │   ├── userService.js
│   │   └── userService.test.js
│   ├── utils/
│   │   └── keyboards.js
│   └── server.js
├── .env                          # Tạo local từ .env.example; không commit
├── .env.example
├── .gitignore
├── .node-version
├── package.json
├── render.yaml
└── README.md
```

## Menu thành viên: Telegram Bot native

14 nút thành viên là Telegram Inline Keyboard callback, được xử lý trực tiếp trong `src/controllers/botController.js` và `src/utils/keyboards.js`. Menu thành viên không mở Mini App và không gọi REST API Mini App.

- **Mini Game Live:** thêm/xóa tài khoản liên kết theo nhà cung cấp; mật khẩu mã hóa AES-256-GCM.
- **Thuê Tool, Mua Code, OTP & Proxy, VIP, Ghép đối đầu:** đọc catalog từ service dữ liệu và tạo đơn trực tiếp từ Bot.
- **Ví điện tử:** tạo yêu cầu nạp, QR VietQR và mã tham chiếu; xem lịch sử giao dịch.
- **Trung tâm khách hàng:** hồ sơ, số dư, VIP và lịch sử hoạt động.
- **REF:** mã/link giới thiệu, thống kê và hoa hồng.
- **Giftcode:** nhập ngay trong cuộc trò chuyện.
- **Nhóm chat, kênh thông báo, CSKH:** liên kết cấu hình được lấy từ dữ liệu Admin; gửi yêu cầu CSKH sẽ tạo ticket.

Lệnh thành viên:
- `/start` hoặc `/menu`: mở menu.
- `/cancel`: hủy bước nhập liệu đang chờ.

Lệnh Admin:
- `/admin`: mở hướng dẫn Admin.
- `/status`: trạng thái Bot, số thành viên và yêu cầu đang chờ.
- `/user ID`: xem thành viên.
- `/addmoney ID SỐ_TIỀN`: điều chỉnh số dư.
- `/broadcast NỘI_DUNG`: gửi thông báo.

## Admin Mini App

Mini App React/Vite chỉ phục vụ quản trị. Máy chủ kiểm tra Telegram `initData` và `ADMIN_ID` trước khi trả dữ liệu Admin. Nếu tài khoản thường mở URL Mini App, ứng dụng chỉ hiện hướng dẫn quay lại Bot và không tải giao diện/dữ liệu thành viên.

Admin dashboard gồm:
- Tổng quan và thống kê vận hành.
- Cấu hình ngân hàng, QR, số tiền nạp tối thiểu, nhóm/kênh, username Bot và CSKH.
- Duyệt hoặc từ chối yêu cầu nạp.
- Quản lý sản phẩm/dịch vụ, giá, thời hạn, tồn kho và cấp VIP.
- Xử lý đơn hàng.
- Tạo/bật/tắt Giftcode.
- Quản lý thành viên, điều chỉnh số dư và VIP.
- Phản hồi ticket CSKH và gửi broadcast.

## PostgreSQL và di chuyển dữ liệu

`src/services/userService.js` dùng PostgreSQL khi có `DATABASE_URL`. Service tạo bảng `hendy_users` và index khi khởi động, đọc dữ liệu người dùng từ PostgreSQL và lưu các thay đổi trong transaction.

Nếu tìm thấy `users.json` cũ trong `DATA_DIR`, lần khởi động đầu tiên sẽ:
1. Đọc và kiểm tra từng hồ sơ.
2. Import bằng `INSERT ... ON CONFLICT DO NOTHING`, không ghi đè người dùng đã có trong Postgres.
3. Chỉ sau khi transaction thành công mới đổi tên tệp JSON cũ thành `users.json.migrated-<timestamp>` để giữ bản sao lưu.
4. Tải người dùng từ PostgreSQL vào cache tiến trình.

Khi chạy local không có `DATABASE_URL`, userService dùng JSON adapter để thuận tiện phát triển. **Render production yêu cầu DATABASE_URL và dừng khởi động nếu thiếu PostgreSQL.**

Dữ liệu phụ trợ như liên kết tài khoản, đơn, ticket, catalog và cấu hình thanh toán trong `appDataService` hiện vẫn lưu trong `DATA_DIR`; vì vậy Persistent Disk của Web Service vẫn được giữ. Chuyển toàn bộ dữ liệu phụ trợ sang PostgreSQL là bước migration riêng, không bị xóa trong thay đổi này.

## Chạy local

Yêu cầu Node.js 24.22.1 (được khóa trong `.node-version`).

```bash
cp .env.example .env
# Điền BOT_TOKEN, ADMIN_ID, APP_ENCRYPTION_KEY.
# Có thể để DATABASE_URL trống để dùng JSON adapter local,
# hoặc dùng PostgreSQL local/external URL.
npm install
npm run check
npm test
npm run build
npm start
```

Sau `npm run build`, Vite xuất `public/index.html` và `public/assets/*`. Thư mục `public/` được Git ignore; CI và Render đều build lại từ source trước khi chạy. Express phục vụ Mini App từ `public/`.

Nếu kết nối PostgreSQL bên ngoài Render, đặt `PGSSLMODE=require`. Kết nối nội bộ Render dùng URL nội bộ do `fromDatabase` cung cấp, không cần cấu hình TLS bổ sung.

## Render Web Service

`render.yaml` khai báo:
- Một Node Web Service tại Singapore, Node.js 24.22.1, một instance.
- Một Persistent Disk tại `/var/data` để giữ dữ liệu phụ trợ hiện còn là JSON.
- Một Render Postgres tên `hendy-bot-db`, cùng region Singapore, plan `0.1c-256mb`, kết nối nội bộ qua `DATABASE_URL` bằng `fromDatabase.connectionString`.
- Build: `npm install --no-audit --no-fund && npm run check && npm test && npm run build`.
- Start: `npm start`; health check: `/healthz`.

Cấu hình các secret sau trong Render Dashboard:
- `BOT_TOKEN`: token mới tạo từ BotFather.
- `ADMIN_ID`: Telegram numeric user ID của Admin.
- `APP_ENCRYPTION_KEY`: chuỗi ngẫu nhiên riêng tối thiểu 32 ký tự.
- `WEBAPP_URL` hoặc `MINI_APP_URL`: URL HTTPS của Web Service. Nếu bỏ trống, ứng dụng sẽ thử dùng `RENDER_EXTERNAL_URL` do Render cung cấp.

`DATABASE_URL` được Render nối tự động từ Postgres trong Blueprint. Không tự chép database password vào GitHub.

**Chi phí Postgres:** Blueprint chọn plan `0.1c-256mb` (không phải Free). Kiểm tra giá hiện tại trong Render Dashboard trước khi Apply/Sync.

## CI

GitHub Actions `.github/workflows/ci.yml` dùng Node version từ `.node-version`, rồi chạy:
1. `npm install`
2. `npm run check`
3. `npm test`
4. `npm run build`
5. Kiểm tra `public/index.html` đã được sinh.

## Bảo mật quan trọng

- `.env` được Git ignore; chỉ commit `.env.example` với giá trị secret để trống.
- Một Bot Token từng xuất hiện trong các tệp mẫu/commit trước đây phải được thu hồi tại BotFather và thay token mới. Xóa tệp trong commit mới không xóa giá trị khỏi Git history.
- Không gửi Bot Token, database password hoặc encryption key trong chat/GitHub.
- Admin API kiểm tra `ADMIN_ID` tại máy chủ; người dùng thường không có quyền Admin.
- Tiền nạp chỉ cộng sau khi Admin đối soát giao dịch thực tế và duyệt. Chưa có webhook ngân hàng tự động.
- Tự động cấp Tool/OTP/Proxy/Code cần tích hợp API nhà cung cấp thật; catalog và trạng thái đơn hiện được quản lý trong hệ thống.
- Render chạy một instance vì dữ liệu phụ trợ vẫn dùng Persistent Disk; không scale nhiều instance cho đến khi chuyển phần dữ liệu phụ trợ này sang Postgres.

## Kiểm tra local

```bash
npm run check
npm test
npm run build
```
