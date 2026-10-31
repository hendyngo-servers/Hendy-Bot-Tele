# Hendy Bot Telegram

Hendy Bot Telegram là một ứng dụng Node.js đơn máy chủ gồm Telegram Bot (Telegraf), API Express và Telegram Mini App (React/Vite). Ứng dụng chạy như **một Render Web Service** và không sử dụng WebSocket, background worker hoặc dịch vụ điều phối bên ngoài.

## Chức năng hiện tại
- Telegram Bot giữ luồng chào mừng, menu truy cập Mini App và các lệnh quản trị `/admin`, `/status`, `/user`, `/addmoney`, `/broadcast`.
- Mini App chỉ có hai khu vực đăng nhập: **TRUNG TÂM QUẢN LÝ TÀI KHOẢN** cho thành viên và **ĐĂNG NHẬP ADMIN** cho tài khoản quản trị.
- Trung tâm thành viên cho phép thêm, xem và xóa tài khoản liên kết theo từng nhà cung cấp.
- Admin dashboard chỉ hiển thị tổng số thành viên, số tài khoản liên kết, danh sách thành viên và các liên kết mới nhất; không trả về mật khẩu.
- Xác thực bằng chữ ký `Telegram.WebApp.initData` ở máy chủ. Quyền Admin được xác minh bằng `ADMIN_ID` tại API, không tin cậy trạng thái giao diện.
- Mật khẩu tài khoản liên kết được mã hóa AES-256-GCM trước khi ghi xuống ổ đĩa.
- Lưu dữ liệu trong Render Persistent Disk tại `/var/data`; không dùng WebSocket hoặc worker riêng.
- Health check tại `/healthz` và GitHub Actions kiểm tra cú pháp, test, build.

## Chạy local
Yêu cầu Node.js 22 hoặc 24. Sao chép `.env.example` thành `.env`, sau đó điền token Bot và khóa mã hóa thử nghiệm của riêng bạn.

```bash
npm install
npm run check
npm test
npm run build
npm start
```

Mở Mini App từ Telegram để có `initData` hợp lệ. Mở URL web trực tiếp trong trình duyệt không tạo phiên đăng nhập giả.

## Triển khai Render Web Service
1. Vào Render Dashboard và chọn **New → Blueprint** hoặc **New → Web Service**.
2. Kết nối repository `hendyngo-servers/Hendy-Bot-Tele`, nhánh `main`.
3. Nếu tạo Web Service thủ công, đặt:
   - Runtime: Node
   - Build Command: `npm install && npm run check && npm test && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/healthz`
4. Nếu dùng Blueprint, cấu hình đã có trong `render.yaml`: một Web Service, một instance, Node 24.22.1, Persistent Disk gắn tại `/var/data`.
5. Điền các biến môi trường trong Render Dashboard:
   - `BOT_TOKEN`: token mới lấy từ BotFather.
   - `ADMIN_ID`: Telegram numeric user ID của quản trị viên.
   - `MINI_APP_URL`: URL HTTPS của chính Web Service sau khi tạo.
   - `APP_ENCRYPTION_KEY`: khóa ngẫu nhiên riêng, ít nhất 32 ký tự.
6. Trong BotFather, cấu hình Main Mini App/Web App URL trỏ tới cùng URL HTTPS.
7. Sau deploy, kiểm tra `https://<service>.onrender.com/healthz`, sau đó mở Bot và nhấn nút Mini App.


## Đăng nhập Mini App

- Thành viên mở bot và chọn **TRUNG TÂM QUẢN LÝ TÀI KHOẢN**. Mini App xác minh phiên Telegram rồi mở trang quản lý liên kết của chính ID Telegram đó.
- Quản trị viên chọn **ĐĂNG NHẬP ADMIN**. Nút này chỉ hiện cho ID Admin, nhưng API vẫn tự kiểm tra `ADMIN_ID` trước khi trả dữ liệu quản trị.
- Không sử dụng mật khẩu Admin tĩnh. Danh tính Admin được xác thực bằng chữ ký `initData` hợp lệ của Telegram kết hợp với danh sách cho phép `ADMIN_ID`.
- Mở Mini App trực tiếp trên trình duyệt ngoài Telegram sẽ không tạo phiên đăng nhập hợp lệ.

## Khắc phục lỗi Telegram Bot không khởi chạy

- Khi gặp lỗi mạng tạm thời, bot sẽ thử kết nối `getMe` tối đa 5 lần; log nêu nguyên nhân/cấp lỗi nhưng che token.
- HTTP 401/Unauthorized nghĩa là `BOT_TOKEN` không hợp lệ hoặc đã bị thu hồi. Tạo token mới bằng BotFather và cập nhật biến `BOT_TOKEN` trong Render Dashboard → Environment.
- HTTP 409/Conflict thường cho biết một tiến trình khác đang dùng long polling với cùng bot token. Đảm bảo chỉ có một Render service/instance chạy bot đó.
- `/healthz` chỉ trả HTTP 200 khi bot đã xác thực được với Telegram; nếu bot chưa sẵn sàng, endpoint trả HTTP 503 để Render không đánh dấu deploy khỏe giả.
- Sau khi cập nhật token trong Render, lưu thay đổi và redeploy service. Không gửi token trong chat, issue hoặc commit GitHub.

## Lưu ý dữ liệu trên Render
Render filesystem mặc định là ephemeral. Blueprint gắn Persistent Disk tại `/var/data`, nên `DATA_DIR` đã được đặt tới mount path này. Disk chỉ được gắn với một instance; cấu hình một instance trong Blueprint và không tăng số instance khi còn dùng lưu trữ JSON cục bộ. Khi có nhiều người dùng hoặc cần scale, nên chuyển hai tệp JSON sang Render Postgres. Gắn Persistent Disk cũng có ảnh hưởng đến zero-downtime deploy; xem tài liệu Render trước khi đổi chiến lược dữ liệu.

## Bảo mật và tệp .env công khai
Tệp `.env` được giữ trong repository theo yêu cầu nhưng chỉ chứa giá trị trống/placeholder. Không commit Bot Token, API key, mật khẩu, khóa mã hóa hoặc thông tin ngân hàng thật. Các giá trị thật chỉ đặt trong Render Environment. Một Bot Token đã từng xuất hiện trong repository công khai phải được thu hồi ở BotFather và thay bằng token mới; xóa khỏi commit hiện tại không xóa lịch sử Git.

## Thanh toán và dịch vụ chưa cấu hình
- Tạo yêu cầu nạp chỉ đặt trạng thái `pending`; tạo QR không có nghĩa là đã nhận tiền. Hệ thống không tự cộng số dư. Muốn tự động ghi có phải tích hợp webhook/đối soát ngân hàng có chữ ký, chống xử lý trùng và quy trình kiểm toán.
- Thuê tool, code, OTP, proxy, VIP, REF và giftcode cần nhà cung cấp cùng nghiệp vụ thực tế. Khi chưa cấu hình, Mini App hiển thị chưa kết nối và không tạo đơn hàng giả.

## Kiểm thử
```bash
npm run check
npm test
npm run build
```
