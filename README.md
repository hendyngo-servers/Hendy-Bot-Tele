# Hendy-Bot-Tele

Hendy-Bot-Tele là hệ thống Telegram Bot (Telegraf), REST API (Express) và Admin Mini App (React/Vite), chạy trong **một Render Web Service**. MongoDB Atlas là cơ sở dữ liệu duy nhất; ảnh QR được lưu trên Render Persistent Disk. Ứng dụng không sử dụng WebSocket, Cloudflare D1, Cloudflare R2 hoặc PostgreSQL.

## Kiến trúc triển khai

- **Telegram Bot:** xử lý menu thành viên trực tiếp bằng Telegram inline keyboard/callback; thành viên không phải mở Mini App.
- **Admin Mini App:** chỉ cho phép tài khoản Telegram khớp `ADMIN_ID` truy cập; máy chủ xác thực `Telegram.WebApp.initData`.
- **REST API:** cung cấp chức năng quản trị cho Mini App, được bảo vệ bằng xác thực Telegram, kiểm tra quyền Admin và giới hạn tốc độ.
- **MongoDB Atlas:** lưu hồ sơ thành viên, số dư, tài khoản liên kết, nạp tiền, danh mục, đơn hàng, giftcode, giới thiệu, ticket và cấu hình.
- **Render Persistent Disk:** lưu ảnh QR trong `DATA_DIR/qr` và giữ tệp JSON cũ trong giai đoạn nhập dữ liệu.

## Chức năng hiện có

### Menu thành viên trong Telegram

- Hồ sơ, số dư, cấp VIP và lịch sử hoạt động.
- Liên kết/xóa tài khoản; thông tin nhạy cảm được mã hóa AES-256-GCM.
- Danh mục dịch vụ và tạo đơn hàng.
- Tạo yêu cầu nạp tiền, hiển thị QR ngân hàng và theo dõi trạng thái.
- Giftcode, giới thiệu và hoa hồng giới thiệu.
- Ticket hỗ trợ và thông tin nhóm/kênh.

### Admin Mini App

- Tổng quan thành viên, tài khoản liên kết, yêu cầu nạp, đơn hàng và ticket.
- Cấu hình ngân hàng, ảnh QR, số tiền nạp tối thiểu, hướng dẫn chuyển khoản và liên kết Bot.
- Duyệt/từ chối yêu cầu nạp và đơn hàng.
- Quản lý danh mục, giftcode, thành viên và ticket hỗ trợ.
- Quản lý cấu hình ứng dụng qua giao diện quản trị.

**Không có dữ liệu demo hoặc tài khoản quản trị mặc định được tạo sẵn.** Khi triển khai lần đầu, Admin đăng nhập bằng Telegram và tự tạo danh mục, cấu hình thông tin nhận tiền và các tùy chọn vận hành. Yêu cầu nạp tiền được Admin đối soát thủ công; dự án chưa tích hợp webhook ngân hàng. Việc tự động cấp Tool/OTP/Proxy/Code từ nhà cung cấp bên ngoài cần API thật và thông tin tích hợp của nhà cung cấp tương ứng.

## MongoDB Atlas

Tạo cluster Atlas và database user riêng cho ứng dụng. Cấp quyền `readWrite` trên database `hendy_bot`; giới hạn Network Access theo địa chỉ outbound của Render. Lấy connection string tại **Connect → Drivers → Node.js** và đặt vào `MONGODB_URI`.

`MONGODB_DB_NAME` mặc định là `hendy_bot`. Ứng dụng tự tạo collection và index khi khởi động.

### Nhập dữ liệu JSON hiện có

Nếu Persistent Disk của Render có `users.json` hoặc `app-data.json`, ứng dụng nhập bản ghi vào MongoDB theo ID, không ghi đè bản ghi đã tồn tại. Chỉ đổi tên tệp JSON thành bản sao lưu sau khi ghi thành công.

Nếu dữ liệu hiện tại chỉ còn trong database hoặc kho tệp của dịch vụ cũ, hãy xuất và lưu bản sao trước khi gỡ dịch vụ đó. Bản phát hành này không kết nối hoặc tự động nhập dữ liệu từ dịch vụ bên ngoài đã bị loại bỏ. Ảnh QR cũ cần tải xuống từ kho cũ và tải lại trong Admin sau khi triển khai.

## Lưu ảnh QR

Admin tải ảnh PNG/JPEG/WebP (tối đa 2 MB) lên API. Máy chủ kiểm tra chữ ký tệp, tạo tên ngẫu nhiên và lưu vào `DATA_DIR/qr`. Ảnh được phục vụ qua endpoint `/uploads/qr/:filename`; không cần tài khoản lưu trữ bên ngoài. Trên Render, `DATA_DIR=/var/data` được gắn vào Persistent Disk nên ảnh tồn tại qua các lần deploy thông thường.

## Chạy local

Yêu cầu Node.js 24.x.

1. Sao chép `.env.example` thành `.env`.
2. Điền `BOT_TOKEN`, `ADMIN_ID`, `MONGODB_URI` và `APP_ENCRYPTION_KEY`.
3. Cài dependencies và kiểm tra:

```bash
npm install
npm run check
npm test
npm run build
npm start
```

Khi chạy local với `NODE_ENV=development`, nếu không có `MONGODB_URI`, ứng dụng dùng JSON trong `DATA_DIR` để hỗ trợ phát triển. Chế độ JSON không được phép chạy trên production.

## Render Blueprint

`render.yaml` định nghĩa một Node Web Service ở Singapore, một instance và Persistent Disk 1 GB tại `/var/data`.

- Build: `npm install --no-audit --no-fund && npm run check && npm test && npm run build`
- Start: `npm start`
- Health check: `/healthz`
- URL Mini App mặc định: `RENDER_EXTERNAL_URL` do Render cung cấp.

### Biến môi trường bắt buộc trong Render

| Biến | Giá trị |
|---|---|
| `MONGODB_URI` | URI bí mật từ MongoDB Atlas |
| `MONGODB_DB_NAME` | `hendy_bot` |
| `BOT_TOKEN` | Token Telegram Bot từ BotFather |
| `ADMIN_ID` | Telegram numeric user ID của Admin |
| `APP_ENCRYPTION_KEY` | Khóa bí mật riêng tối thiểu 32 ký tự |

### Biến cấu hình tùy chọn

| Biến | Ý nghĩa |
|---|---|
| `MONGO_MAX_POOL_SIZE` | Giới hạn kết nối MongoDB, mặc định 10 |
| `DATA_DIR` | Thư mục lưu tệp; Blueprint Render đặt `/var/data` |
| `BOT_USERNAME` | Username Bot, không có ký tự `@` |
| `MINI_APP_URL` / `WEBAPP_URL` | URL HTTPS của Mini App; mặc định dùng `RENDER_EXTERNAL_URL` |
| `BANK_BIN` | Mã BIN ngân hàng gồm 6 chữ số |
| `BANK_ACCOUNT` | Số tài khoản nhận tiền |
| `BANK_ACCOUNT_NAME` | Chủ tài khoản |
| `BANK_NAME` | Tên ngân hàng |
| `MIN_DEPOSIT_VND` | Số tiền nạp tối thiểu, mặc định 10.000 VNĐ |
| `SUPPORT_USERNAME` | Username CSKH, không có `@` |

Nhập secret trực tiếp trong **Render → Service → Environment**. Không gửi token, URI có mật khẩu hoặc khóa mã hóa vào chat và không commit chúng vào GitHub.

## CI và kiểm tra

GitHub Actions chạy MongoDB tạm thời, sau đó thực hiện `npm run check`, `npm test`, `npm run build` và xác nhận Mini App đã được tạo vào `public/`. CI không cần credential MongoDB Atlas hoặc tài khoản lưu trữ bên ngoài.

## Bảo mật và vận hành

- Giữ nguyên `APP_ENCRYPTION_KEY` khi nâng cấp để giải mã tài khoản liên kết đã lưu. Chỉ thay khóa khi đã có kế hoạch mã hóa lại dữ liệu.
- Dùng database user riêng với quyền đúng database; giới hạn IP trong MongoDB Atlas.
- Dùng HTTPS cho Telegram Mini App.
- Sao lưu MongoDB định kỳ và lưu bản backup ngoài Render.
- Persistent Disk được gắn với một instance; Blueprint giữ `numInstances: 1` để tránh nhiều tiến trình cùng ghi trạng thái.
- Thu hồi và tạo mới credential từng bị lộ trong lịch sử Git. Chỉ sửa file mới nhất không xóa secret khỏi commit cũ.

## Tài liệu tham khảo

- [MongoDB Atlas — Connect to a cluster](https://www.mongodb.com/docs/atlas/driver-connection/)
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/)
- [Render — Deploy Node.js applications](https://render.com/docs/deploy-node-express-app)
- [Render — Persistent Disks](https://render.com/docs/disks)
