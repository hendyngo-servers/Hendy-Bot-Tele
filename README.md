# Hendy Bot Telegram

Hendy Bot Telegram là hệ thống Node.js gồm Telegram Bot (Telegraf), API Express và Mini App React/Vite, chạy trong **một Render Web Service**. Không sử dụng WebSocket hoặc worker riêng. Dữ liệu JSON được lưu trên Render Persistent Disk.

## Menu thành viên — xử lý trực tiếp trong Telegram Bot

Toàn bộ menu thành viên dùng **Telegram Inline Keyboard và callback của Bot**. Các nút thành viên không mở Mini App và không gọi API Mini App. Các thao tác được xử lý trực tiếp trong `src/controllers/botController.js` bằng service lưu trữ hiện có.

- **Trang chủ:** tên thành viên, Telegram ID, số dư, cấp VIP và số tài khoản liên kết.
- **Mini Game Live:** chọn nhà cung cấp, thêm và xóa tài khoản liên kết. Mật khẩu được mã hóa AES-256-GCM; tin nhắn chứa mật khẩu được Bot xóa sau khi nhận nếu Telegram cho phép.
- **Thuê Tool:** xem danh mục, giá, thời hạn và tạo yêu cầu đơn.
- **Mua Code:** xem danh mục Code và tạo yêu cầu mua.
- **Ví điện tử:** tạo yêu cầu nạp, hiển thị QR VietQR/thông tin chuyển khoản, tra cứu lịch sử giao dịch.
- **OTP & Proxy:** xem danh mục và tạo yêu cầu đơn.
- **VIP:** xem cấp hiện tại, các gói VIP và yêu cầu nâng cấp.
- **Trung tâm khách hàng:** hồ sơ thành viên, lịch sử đơn và hoạt động gần đây.
- **REF:** mã/link giới thiệu, thống kê thành viên đã mời và hoa hồng.
- **Giftcode:** nhập mã ngay trong cuộc trò chuyện Bot và nhận phần thưởng theo cấu hình.
- **Ghép đối đầu, nhóm chat, kênh thông báo, CSKH:** menu mở trực tiếp trong Bot; các liên kết cộng đồng được lấy từ cấu hình Admin, yêu cầu hỗ trợ được lưu thành ticket và gửi thông báo tới Admin.

Người dùng có thể dùng lệnh `/menu` để mở lại menu và `/cancel` để hủy bước nhập liệu đang thực hiện. Phiên nhập liệu có thời hạn 10 phút.

## Mini App — chỉ dành cho Admin

Mini App không còn là cổng thành viên. Người không có quyền Admin sẽ thấy thông báo hướng dẫn quay lại Telegram Bot và không tải trang nghiệp vụ thành viên. Admin được xác thực bằng chữ ký `Telegram.WebApp.initData` và Telegram ID khớp `ADMIN_ID` ở máy chủ.

Admin dashboard đã được thiết kế lại với sidebar điều hướng, trang tổng quan, thẻ chỉ số, khu vực thao tác nhanh và bố cục responsive cho máy tính/điện thoại.

## Bảng điều khiển Admin

- **QR & Thanh toán:** đổi BIN, ngân hàng, số tài khoản, chủ tài khoản, ảnh QR HTTPS, hướng dẫn chuyển khoản, mức nạp tối thiểu và cấu hình REF/nhóm/kênh/CSKH.
- **Duyệt nạp:** duyệt hoặc từ chối yêu cầu; chỉ khi Admin xác nhận mới cộng tiền vào ví.
- **Danh mục:** thêm, sửa, ẩn, xóa dịch vụ; cấu hình giá, thời hạn, tồn kho và cấp VIP.
- **Đơn hàng:** duyệt/từ chối; kiểm tra số dư và tồn kho trước khi xử lý, cập nhật VIP và thời hạn thuê khi được duyệt.
- **Giftcode:** tạo mã thưởng tiền hoặc VIP, giới hạn lượt và ngày hết hạn, bật/tắt.
- **Thành viên:** xem số dư, cấp VIP, liên kết; điều chỉnh số dư và cấp VIP.
- **Hỗ trợ:** xem ticket, gửi phản hồi về Telegram và đóng yêu cầu.
- **Thông báo:** gửi broadcast tới thành viên đã từng mở Bot.

Các lệnh Telegram dành cho Admin: `/admin`, `/status`, `/user ID`, `/addmoney ID SỐ_TIỀN`, `/broadcast NỘI_DUNG`.

## Cấu hình thanh toán và tích hợp

- Bot tạo yêu cầu nạp và mã VietQR theo cấu hình ngân hàng, số tiền và mã tham chiếu.
- **Chưa có webhook ngân hàng tự động.** Admin phải đối soát giao dịch thực tế rồi xác nhận thủ công. Không tự cộng tiền khi thành viên chỉ tạo yêu cầu hoặc mở QR.
- Tool, Code, OTP, Proxy, VIP và Ghép đối đầu hiển thị danh mục do Admin cấu hình. Đơn được ghi nhận và chờ duyệt. Muốn tự động giao dịch/cấp tài khoản cần API thật từ nhà cung cấp.
- REF được ghi nhận khi thành viên mới vào Bot qua link giới thiệu. Hoa hồng chỉ được cộng sau khi yêu cầu nạp của người được giới thiệu được Admin duyệt và tỷ lệ hoa hồng lớn hơn 0.

## Chạy local

Yêu cầu Node.js 22 hoặc 24. Sao chép `.env.example` thành `.env` và tự điền cấu hình local. Không commit secret thật.

```bash
npm install
npm run check
npm test
npm run build
npm start
```

Bot hoạt động qua Telegram long polling. Mini App chỉ mở cho Admin đã xác thực.

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
   - `BOT_USERNAME`: tùy chọn; có thể cấu hình trong Admin để tạo link REF.
   - `BANK_BIN`, `BANK_NAME`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`: giá trị khởi tạo tùy chọn, có thể chỉnh trong Admin.
4. Cấu hình URL Mini App cho bot trong BotFather nếu muốn dùng Admin Mini App.
5. Sau deploy, kiểm tra `https://<service>.onrender.com/healthz`; endpoint trả HTTP 200 khi Bot đã sẵn sàng, nếu không sẽ trả HTTP 503.

## Lưu trữ và giới hạn mở rộng

Render Persistent Disk chỉ gắn với một instance. Không tăng số instance khi dữ liệu vẫn ở JSON cục bộ; nếu cần scale nhiều instance, chuyển dữ liệu sang Render Postgres. Disk cũng ảnh hưởng đến chiến lược zero-downtime deploy.

## Bảo mật

- `.env` và `.env.example` trong repository chỉ giữ placeholder trống.
- Không đưa Bot Token, khóa mã hóa, thông tin ngân hàng hoặc secret vào GitHub.
- Một Bot Token từng xuất hiện trong lịch sử repository phải được thu hồi tại BotFather và thay bằng token mới; xóa khỏi commit hiện tại không xóa lịch sử Git.
- Mật khẩu tài khoản liên kết được mã hóa AES-256-GCM. Bot xóa tin nhắn nhập mật khẩu sau khi nhận nếu Telegram cho phép; không nên dùng Bot trong nhóm chat để nhập mật khẩu.
- Các API quản trị kiểm tra `ADMIN_ID` tại máy chủ và dữ liệu nhạy cảm được đặt `Cache-Control: no-store`.

## Kiểm thử

```bash
npm run check
npm test
npm run build
```
