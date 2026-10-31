# Hendy Bot Telegram

Hendy Bot Telegram gồm Telegram Bot (Telegraf), API Express và Telegram Mini App (React/Vite), với menu nhiều màu theo thiết kế Hendy.

## Tính năng đã xây dựng
- Bot Telegram: menu điều hướng, nút mở Mini App, trạng thái, danh sách yêu cầu nạp chờ và broadcast quản trị.
- Mini App: trang tổng quan, hồ sơ, ví, tạo yêu cầu nạp, lịch sử nạp, quản lý tài khoản liên kết và gửi yêu cầu hỗ trợ.
- Xác thực Telegram.WebApp.initData tại máy chủ.
- Mật khẩu tài khoản liên kết mã hóa AES-256-GCM trước khi lưu.
- Lưu dữ liệu nguyên tử trên persistent disk; health check tại /healthz.
- CI kiểm tra cú pháp, test và build.

## Chạy local
Yêu cầu Node.js 20+. Sao chép .env.example thành .env, điền BOT_TOKEN và tạo APP_ENCRYPTION_KEY ngẫu nhiên tối thiểu 32 ký tự.

    npm install
    npm run check
    npm test
    npm run build
    npm start

Bot có thể không khởi chạy khi thiếu BOT_TOKEN; API và Mini App vẫn chạy. Mini App chỉ xác thực khi mở từ Telegram.

## Render
Blueprint render.yaml tạo Node Web Service và Persistent Disk tại /var/data. Cấu hình BOT_TOKEN, ADMIN_ID, MINI_APP_URL và APP_ENCRYPTION_KEY trong Render Dashboard. Tùy chọn: BANK_BIN, BANK_ACCOUNT, BANK_ACCOUNT_NAME, BANK_NAME, MIN_DEPOSIT_VND, SUPPORT_USERNAME, WS_URL, WS_TOKEN. Sau khi có URL Render, đặt MINI_APP_URL chính xác và cấu hình Main Mini App/Web App URL trong BotFather trỏ tới URL HTTPS đó.

## Tệp .env công khai
Tệp .env được giữ lại nhưng chỉ chứa giá trị giữ chỗ. Không commit token, mật khẩu, khóa mã hóa hoặc dữ liệu ngân hàng thật. Bí mật từng xuất hiện trong lịch sử Git phải được thu hồi và tạo lại.

## Giới hạn tích hợp phải lưu ý
- Yêu cầu nạp tiền tạo ở trạng thái pending. QR chỉ hiển thị nếu cấu hình tài khoản ngân hàng. Ứng dụng không tự cộng số dư khi tạo QR; cần webhook/đối soát ngân hàng có chữ ký và bước phê duyệt kế toán trước khi tự động ghi có.
- Thuê tool, code, OTP, proxy, VIP, REF và giftcode chưa có nhà cung cấp/dữ liệu thật nên hiện trạng thái chưa kết nối, không tạo sản phẩm hoặc đơn hàng giả.
- WebSocket điều phối chỉ chạy khi có cả WS_URL và WS_TOKEN; lệnh khởi chạy từ xa dùng BOT_TOKEN trên máy chủ.
- Dữ liệu users.json và app-data.json nằm trong DATA_DIR. Trên Render thư mục này gắn với Persistent Disk. Cần sao lưu định kỳ. Mất APP_ENCRYPTION_KEY đồng nghĩa không thể giải mã mật khẩu đã lưu.

## Kiểm thử
    npm run check
    npm test
    npm run build
