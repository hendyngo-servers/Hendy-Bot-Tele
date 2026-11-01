# Hendy-Bot-Tele

Hendy-Bot-Tele gồm Telegram Bot (Telegraf), REST API (Express) và Admin Mini App (React/Vite), chạy trong một Render Web Service. Toàn bộ dữ liệu ứng dụng được lưu trong **một tệp `database.json`** bằng Node.js `fs.writeFile`; ảnh QR lưu trong thư mục `qr` cùng Data Directory. Dự án không còn MongoDB, PostgreSQL, Cloudflare D1 hoặc Cloudflare R2.

## Kiến trúc

- Telegram Bot xử lý menu thành viên bằng inline keyboard và callback.
- Admin Mini App chỉ cho tài khoản Telegram khớp `ADMIN_ID` truy cập.
- REST API xác thực Telegram `initData`, kiểm tra quyền Admin và giới hạn tốc độ.
- `src/services/jsonDatabase.js` quản lý `database.json`, ghi tuần tự qua hàng đợi và ghi file tạm rồi đổi tên nguyên tử để hạn chế file JSON bị hỏng khi tiến trình dừng giữa lúc ghi.
- `database.json` chứa `users` (hồ sơ, số dư, VIP) và `appData` (tài khoản liên kết, nạp tiền, ticket, danh mục, đơn hàng, giftcode, giới thiệu và cấu hình).
- Ảnh QR lưu trong `DATA_DIR/qr`; file JSON và ảnh QR đều được đặt trên Render Persistent Disk.

## Chức năng

### Telegram Bot
- Hồ sơ thành viên, số dư, VIP và lịch sử hoạt động.
- Liên kết/xóa tài khoản; mật khẩu liên kết được mã hóa AES-256-GCM.
- Danh mục dịch vụ, tạo và theo dõi đơn hàng.
- Yêu cầu nạp tiền, QR ngân hàng và lịch sử giao dịch.
- Giftcode, giới thiệu, hoa hồng và ticket hỗ trợ.

### Admin Mini App
- Tổng quan thành viên, tài khoản liên kết, yêu cầu nạp, đơn hàng và ticket.
- Cấu hình thông tin ngân hàng, QR, mức nạp tối thiểu, thông tin Bot và hỗ trợ.
- Duyệt/từ chối nạp tiền và đơn hàng.
- Quản lý danh mục, giftcode, thành viên và yêu cầu hỗ trợ.

Không có dữ liệu demo hoặc tài khoản Admin mặc định. Nạp tiền hiện được Admin đối soát thủ công; dự án chưa tích hợp webhook ngân hàng. Tự động cung cấp dịch vụ từ nhà cung cấp bên ngoài cần API và thông tin tích hợp thực tế.

## Cấu trúc lưu trữ và di trú

Khi khởi động, ứng dụng đọc `DATA_DIR/database.json`. Nếu tệp này chưa tồn tại, chương trình tự nhập dữ liệu từ hai tệp cũ nếu có:
- `users.json` → section `users`
- `app-data.json` → section `appData`

Các tệp cũ chỉ được đổi tên thành bản sao lưu sau khi `database.json` đã ghi thành công. Nếu `database.json` tồn tại nhưng JSON hỏng hoặc sai schema, ứng dụng **dừng khởi động và giữ nguyên file lỗi** thay vì ghi đè bằng dữ liệu rỗng. Hãy sao lưu file trước khi chỉnh sửa thủ công.

Cấu trúc tổng quát:

```json
{
  "schemaVersion": 1,
  "users": {},
  "appData": {
    "linkedAccounts": [],
    "deposits": [],
    "tickets": [],
    "catalog": [],
    "orders": [],
    "giftcodes": [],
    "referrals": [],
    "paymentSettings": {}
  },
  "updatedAt": "ISO-8601"
}
```

Đường dẫn mặc định local là `./data/database.json`. Trên Render Blueprint, `DATA_DIR=/var/data`, vì vậy file thực tế là `/var/data/database.json`.

## Chạy local

Yêu cầu Node.js 24.x.

1. Sao chép `.env.example` thành `.env`.
2. Điền `BOT_TOKEN`, `ADMIN_ID` và `APP_ENCRYPTION_KEY`.
3. Cài đặt, kiểm tra và khởi động:

```bash
npm install
npm run check
npm test
npm run build
npm start
```

Tạo khóa mới nếu đây là cài đặt mới:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Giữ nguyên khóa đã dùng trước đó nếu `database.json` đang chứa mật khẩu đã mã hóa. Thay khóa có thể làm dữ liệu cũ không thể giải mã.

## Triển khai Render

`render.yaml` định nghĩa một Node Web Service tại Singapore, một instance và Persistent Disk 1 GB gắn tại `/var/data`.

- Build: `npm install --no-audit --no-fund && npm run check && npm test && npm run build`
- Start: `npm start`
- Health check: `/healthz` (đồng thời hỗ trợ `/health`)
- Database file: `/var/data/database.json`
- QR images: `/var/data/qr/`

Biến môi trường bắt buộc:
| Biến | Mô tả |
|---|---|
| `BOT_TOKEN` | Token Telegram Bot từ @BotFather |
| `ADMIN_ID` | Telegram numeric user ID của Admin |
| `APP_ENCRYPTION_KEY` | Khóa bí mật cố định, tối thiểu 32 ký tự |
| `DATA_DIR` | Thư mục dữ liệu; Blueprint đặt `/var/data` |

Biến tùy chọn: `BOT_USERNAME`, `WEBAPP_URL`, `MINI_APP_URL`, `BANK_BIN`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`, `BANK_NAME`, `MIN_DEPOSIT_VND`, `SUPPORT_USERNAME`.

**Quan trọng:** Render Free không hỗ trợ Persistent Disk. Nếu chạy trên filesystem tạm của gói Free, `database.json` có thể mất khi instance được thay thế hoặc deploy lại. Để lưu trữ lâu dài, phải gắn Persistent Disk vào Web Service (Blueprint hiện khai báo gói `0.5c-512mb` và disk 1 GB). Không tăng số instance vì JSON file không phải hệ quản trị cơ sở dữ liệu phân tán và chỉ hỗ trợ một tiến trình ghi.

## Sao lưu và vận hành

- Sao lưu định kỳ toàn bộ `/var/data`, gồm `database.json` và thư mục `qr`, ra nơi lưu trữ độc lập.
- Không commit `.env`, token Telegram hoặc khóa mã hóa.
- Không chạy nhiều instance hoặc nhiều tiến trình cùng ghi vào cùng database file.
- Ghi file được tuần tự hóa trong một tiến trình; thay thế file dùng rename nguyên tử. Đây không phải cơ chế giao dịch đa tiến trình.
- Nếu cần hàng triệu bản ghi, nhiều instance hoặc ghi đồng thời phân tán, nên chuyển sang một database server thay vì JSON file.

## Kiểm thử

CI chạy `npm run check`, `npm test` và `npm run build`; không cần MongoDB hoặc credential database.
