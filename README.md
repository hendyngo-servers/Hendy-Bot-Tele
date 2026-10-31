# Hendy Bot Telegram

Hendy Bot Telegram là hệ thống Node.js gồm Telegram Bot (Telegraf), API Express và Mini App React/Vite, chạy trong **một Render Web Service**. Hệ thống không dùng WebSocket hoặc worker riêng, dữ liệu JSON được lưu trên Render Persistent Disk.

## Menu thành viên

Mini App dùng tiếng Việt mặc định, thiết kế menu nhiều màu theo giao diện Hendy:

- **Trang chủ:** hồ sơ Telegram, số dư, cấp VIP và số liệu hoạt động.
- **Mini Game Live:** thêm, xem và xóa tài khoản liên kết QQ88, 78WIN, SC88, C168, CM88, F8BET. Mật khẩu được mã hóa AES-256-GCM.
- **Thuê Tool:** danh sách dịch vụ, thời hạn, giá, tồn kho và lịch sử đơn.
- **Mua Code:** danh mục code/sản phẩm, yêu cầu mua và trạng thái xử lý.
- **Ví điện tử:** tạo yêu cầu nạp, QR VietQR theo số tiền/nội dung, thông tin tài khoản nhận tiền và lịch sử giao dịch.
- **OTP & Proxy:** danh mục dịch vụ và yêu cầu đơn; cần cấu hình nhà cung cấp/nhân sự xử lý.
- **VIP:** cấp bậc hiện tại, quyền lợi và gói nâng cấp VIP được Admin cấu hình.
- **Trung tâm khách hàng:** hồ sơ, yêu cầu hỗ trợ, phản hồi của Admin và liên hệ CSKH.
- **REF:** mã/link giới thiệu, thống kê lượt giới thiệu và hoa hồng theo cấu hình.
- **Giftcode:** nhập mã, nhận tiền vào ví hoặc nâng cấp VIP theo phần thưởng được Admin cấp.
- **Ghép đối đầu, nhóm chat, kênh thông báo:** menu có sẵn; liên kết cộng đồng được Admin cấu hình, còn ghép đối đầu cần danh mục/nhà cung cấp và quy trình riêng.

Người dùng chỉ quản lý tài khoản liên kết của chính Telegram ID đã xác thực. API luôn xác minh chữ ký `Telegram.WebApp.initData` tại máy chủ.

## Bảng điều khiển Admin

Chỉ Telegram ID được đặt trong `ADMIN_ID` mới mở được Admin Mini App. Máy chủ kiểm tra quyền ở từng API quản trị, không dựa vào việc ẩn nút ở giao diện.

Admin có thể:
- **QR & Thanh toán:** đổi BIN, ngân hàng, số tài khoản, chủ tài khoản, ảnh QR HTTPS tĩnh, hướng dẫn chuyển khoản và mức nạp tối thiểu.
- **Duyệt nạp:** xem yêu cầu, duyệt hoặc từ chối; chỉ khi Admin duyệt, hệ thống mới cộng tiền vào ví.
- **Danh mục:** thêm, sửa, bật/tắt và xóa sản phẩm Thuê Tool, Mua Code, OTP & Proxy, VIP, Ghép đối đầu; thiết lập giá, thời hạn, tồn kho và cấp VIP nhận được.
- **Đơn hàng:** xem yêu cầu, duyệt hoặc từ chối. Khi duyệt đơn, hệ thống kiểm tra số dư và tồn kho, sau đó trừ số dư; đơn VIP còn cập nhật cấp VIP tương ứng.
- **Giftcode:** tạo mã thưởng tiền hoặc VIP, giới hạn lượt và ngày hết hạn, bật/tắt mã.
- **Thành viên:** xem số dư, cấp VIP, liên kết; điều chỉnh số dư và cấp VIP.
- **Hỗ trợ:** xem ticket, phản hồi khách qua Telegram hoặc đóng yêu cầu.
- **Thông báo:** gửi broadcast tới các thành viên đã từng mở bot.
- **REF và liên kết cộng đồng:** cấu hình username bot, nhóm chat, kênh thông báo, CSKH và tỷ lệ hoa hồng giới thiệu.

Các lệnh Telegram dành cho Admin: `/admin`, `/status`, `/user ID`, `/addmoney ID SỐ_TIỀN`, `/broadcast NỘI_DUNG`.

## Cấu hình thanh toán và phạm vi tích hợp

- Hệ thống tạo yêu cầu nạp và mã VietQR dựa trên cấu hình ngân hàng. Có thể dùng URL ảnh QR tĩnh HTTPS nếu bạn tự lưu trữ ảnh QR.
- **Hệ thống chưa tự đọc biến động ngân hàng.** Admin phải đối soát khoản chuyển thực tế rồi mới bấm Duyệt. Không tự cộng tiền chỉ vì người dùng đã mở QR hoặc tạo yêu cầu.
- Thuê Tool, Code, OTP, Proxy và Ghép đối đầu hiển thị danh mục do Admin nhập. Đơn được quản lý ở trạng thái chờ duyệt; để tự động cấp dịch vụ cần tích hợp API nhà cung cấp thực tế.
- Gói VIP được duyệt bằng đơn hàng hoặc giftcode. Cấu hình cấp VIP trên sản phẩm trước khi bán gói nâng cấp.
- Hoa hồng REF chỉ được ghi nhận khi Admin duyệt một yêu cầu nạp của người được giới thiệu và tỷ lệ hoa hồng lớn hơn 0.

## Chạy local

Yêu cầu Node.js 22 hoặc 24. Sao chép `.env.example` thành `.env` và tự điền cấu hình local. Không commit secret thật.

```bash
npm install
npm run check
npm test
npm run build
npm start
```

Mini App phải được mở từ Telegram để có `initData` hợp lệ. Mở URL trực tiếp trên trình duyệt không tạo phiên đăng nhập.

## Triển khai Render Web Service

1. Kết nối repository `hendyngo-servers/Hendy-Bot-Tele`, nhánh `main` trong Render.
2. Dùng Blueprint `render.yaml` hoặc cấu hình Web Service Node:
   - Build: `npm install && npm run check && npm test && npm run build`
   - Start: `npm start`
   - Health check: `/healthz`
   - Region: Singapore; một instance; Persistent Disk tại `/var/data`.
3. Cấu hình Environment trong Render:
   - `BOT_TOKEN`: token mới từ BotFather.
   - `ADMIN_ID`: Telegram numeric user ID của Admin.
   - `MINI_APP_URL`: URL HTTPS của Web Service.
   - `APP_ENCRYPTION_KEY`: khóa riêng tối thiểu 32 ký tự.
   - `BOT_USERNAME`: tùy chọn; cũng có thể đặt trong Admin → QR & Thanh toán để tạo link REF.
   - `BANK_BIN`, `BANK_NAME`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`: giá trị khởi tạo tùy chọn; có thể thay trong Admin.
4. Cấu hình Mini App URL cho bot trong BotFather.
5. Sau deploy, kiểm tra `https://<service>.onrender.com/healthz`; endpoint trả HTTP 200 khi bot đã sẵn sàng, nếu không sẽ trả HTTP 503.

## Lưu trữ và giới hạn mở rộng

Render Persistent Disk chỉ gắn với một instance. Không tăng số instance trong khi dữ liệu vẫn ở JSON cục bộ; khi cần scale nhiều instance, chuyển người dùng và dữ liệu nghiệp vụ sang Render Postgres. Disk cũng ảnh hưởng đến chiến lược zero-downtime deploy.

## Bảo mật

- `.env` và `.env.example` trong repository chỉ giữ placeholder trống.
- Không đưa Bot Token, khóa mã hóa, thông tin ngân hàng hoặc secret vào GitHub.
- Một Bot Token từng xuất hiện trong lịch sử repository phải được thu hồi tại BotFather và thay bằng token mới; xóa khỏi commit hiện tại không xóa lịch sử Git.
- Mật khẩu tài khoản liên kết được mã hóa AES-256-GCM; API thành viên không trả mật khẩu hoặc ciphertext.
- Admin API kiểm tra `ADMIN_ID` tại máy chủ và dữ liệu cá nhân được đặt `Cache-Control: no-store`.

## Kiểm thử

```bash
npm run check
npm test
npm run build
```
