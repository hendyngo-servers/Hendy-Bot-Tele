# Hendy Bot Telegram

Hendy Bot Telegram là một ứng dụng Node.js đơn máy chủ gồm Telegram Bot (Telegraf), API Express và Telegram Mini App (React/Vite). Ứng dụng chạy như **một Render Web Service** và không sử dụng WebSocket, background worker hoặc dịch vụ điều phối bên ngoài.

## Chức năng đang có
- Telegram Bot: menu màu, mở Mini App, lệnh trạng thái, danh sách yêu cầu nạp chờ và broadcast quản trị.
- Mini App: trang tổng quan, hồ sơ, số dư, lịch sử yêu cầu nạp, quản lý tài khoản liên kết và gửi yêu cầu hỗ trợ.
- Xác thực chữ ký `Telegram.WebApp.initData` tại máy chủ; dữ liệu API cá nhân được đặt `Cache-Control: no-store`.
- Mật khẩu tài khoản liên kết mã hóa AES-256-GCM trước khi ghi xuống ổ đĩa.
- Lưu dữ liệu bền vững trong Render Persistent Disk tại `/var/data`.
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
   - `BANK_BIN`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`, `BANK_NAME`: tùy chọn để tạo QR.
   - `MIN_DEPOSIT_VND`: mức nạp tối thiểu, mặc định 10.000.
   - `SUPPORT_USERNAME`: username hỗ trợ Telegram, không gồm @.
6. Trong BotFather, cấu hình Main Mini App/Web App URL trỏ tới cùng URL HTTPS.
7. Sau deploy, kiểm tra `https://<service>.onrender.com/healthz`, sau đó mở Bot và nhấn nút Mini App.

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
