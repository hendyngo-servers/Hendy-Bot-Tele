# Hendy Bot Tele — Cloudflare Platform

Nền tảng triển khai trên **Cloudflare Workers + Pages + D1 + R2**. Ngôn ngữ giao diện mặc định: tiếng Việt.

## Thành phần

| Thành phần | Vai trò |
|---|---|
| apps/web-user | Telegram Mini App cho thành viên: hồ sơ, số dư, danh mục, tạo đơn, yêu cầu nạp, hỗ trợ |
| apps/web-admin | Trung tâm quản trị: thống kê, duyệt nạp, xử lý đơn, tạo dịch vụ, cấu hình và phản hồi hỗ trợ |
| workers/backend-api | API, xác thực Telegram Mini App, webhook, D1 và R2 |
| workers/edge-router | Chuyển API qua Service Binding đến backend; các hostname khác được chuyển đến Pages tương ứng |
| workers/self-healing | Cron kiểm tra sức khỏe 5 phút/lần và gửi cảnh báo |
| packages/db-schema | Migration D1 có version |
| packages/crypto | Mã hóa AES-256-GCM bằng Web Crypto API |

## Chức năng đã có trong mã nguồn

- Xác thực Telegram Mini App bằng HMAC initData, giới hạn tuổi phiên 24 giờ và kiểm tra Telegram admin ID ở backend.
- Webhook Telegram có kiểm tra secret_token, lưu dấu update để tránh xử lý lặp, hỗ trợ /start, /admin, /id, /help.
- Hồ sơ thành viên, số dư, danh mục dịch vụ và lịch sử đơn hàng.
- Tạo đơn trừ số dư có điều kiện; đơn bị từ chối/hủy sẽ được hoàn tiền trong transaction D1.
- Tạo yêu cầu nạp tiền; admin duyệt hoặc từ chối, tránh cộng số dư lặp khi API bị gọi lại.
- Tạo gói dịch vụ; quản lý trạng thái đơn, yêu cầu nạp và vé hỗ trợ.
- Tài khoản liên kết được mã hóa trước khi lưu D1; API danh sách không trả ciphertext.
- Cấu hình giao diện, thông tin chuyển khoản, chế độ bảo trì được lưu trong D1; audit log cho thao tác quan trọng.
- API tải object R2 yêu cầu xác thực; người dùng chỉ đọc được key nằm dưới thư mục Telegram ID của mình.
- CI kiểm tra TypeScript và chạy thử toàn bộ migration bằng SQLite trước khi deploy.

## Giới hạn nghiệp vụ cần biết

Đây là nền tảng Cloudflare có các luồng lõi hoạt động được sau khi cấu hình tài nguyên, **không phải bản sao đầy đủ mọi chức năng của bot cũ**:

- Yêu cầu nạp tiền hiện là quy trình thủ công: admin đối soát giao dịch ngoài hệ thống rồi bấm duyệt. Chưa tích hợp cổng thanh toán/bank webhook.
- Đơn hàng được tạo, trừ số dư và quản trị cập nhật trạng thái; chưa tích hợp nhà cung cấp để tự động giao tool/code.
- Chưa triển khai gift code, referral, game live tự động, thuê tool có bộ đếm hạn và nhập dữ liệu cũ từ Render/JSON.
- R2 có luồng đọc tệp riêng tư; chưa có API upload file cho người dùng.
- Self-healing chỉ giám sát và cảnh báo; không tự sửa mã hoặc tự phát hành phiên bản mới.

Không bật nhận traffic production cho nghiệp vụ tiền thật cho tới khi hoàn tất tích hợp thanh toán, kiểm thử đối soát và quy trình vận hành.

## 1. Chuẩn bị

- Node.js 22 trở lên.
- Tài khoản Cloudflare bật Workers, Pages, D1 và R2.
- Domain đã thêm vào Cloudflare DNS (khuyến nghị ba hostname app, admin, api).
- Từ thư mục repository, chạy:

    npm install
    npm run check
    npm run validate:config
    npm run test:db

## 2. Tạo tài nguyên Cloudflare

Đăng nhập Wrangler:

    npx wrangler login

Tạo D1:

    npx wrangler d1 create hendy-production

Sao chép database_id được trả về và thay giá trị REPLACE_WITH_D1_DATABASE_ID trong workers/backend-api/wrangler.toml. Không dùng ID của database khác account.

Tạo R2:

    npx wrangler r2 bucket create hendy-app-files

Tên bucket phải khớp bucket_name trong backend Wrangler config.

## 3. Tạo Pages projects và cấu hình domain API

Tạo hai Pages project:

    npx wrangler pages project create hendy-web-user --production-branch main
    npx wrangler pages project create hendy-web-admin --production-branch main

Cập nhật apiBase trong cả hai tệp:
- apps/web-user/config.js
- apps/web-admin/config.js

Ví dụ giá trị sau khi bạn sở hữu domain:

    window.HENDY_CONFIG = Object.freeze({ apiBase: "https://api.ten-mien-cua-ban.vn" });

Gắn custom domain trực tiếp vào Pages:
- Pages project hendy-web-user → app.ten-mien-cua-ban.vn
- Pages project hendy-web-admin → admin.ten-mien-cua-ban.vn

Trong workers/backend-api/wrangler.toml, sửa ALLOWED_ORIGINS, TELEGRAM_WEBAPP_URL thành domain thật. Trong phần [vars], thêm:

    TELEGRAM_ADMIN_WEBAPP_URL = "https://admin.ten-mien-cua-ban.vn"

Trong workers/edge-router/wrangler.toml, sửa USER_PAGES_ORIGIN và ADMIN_PAGES_ORIGIN thành hai hostname .pages.dev thực tế. Worker edge-router chỉ cần được gắn route api.ten-mien-cua-ban.vn/* trong Cloudflare Dashboard → Workers & Pages → hendy-edge-router → Settings → Domains & Routes. Không gắn route API vào backend trực tiếp vì edge-router dùng Service Binding.

Trong workers/self-healing/wrangler.toml, sửa HEALTH_TARGETS sang URL health thật, ví dụ https://api.ten-mien-cua-ban.vn/healthz.

## 4. Secrets runtime

Không đặt token hoặc khóa mã hóa trong wrangler.toml, Pages config hay GitHub source. Dùng Wrangler secrets:

    npx wrangler secret put TELEGRAM_BOT_TOKEN --config workers/backend-api/wrangler.toml
    npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config workers/backend-api/wrangler.toml
    npx wrangler secret put TELEGRAM_ADMIN_IDS --config workers/backend-api/wrangler.toml
    npx wrangler secret put APP_ENCRYPTION_KEY --config workers/backend-api/wrangler.toml

    npx wrangler secret put SELF_HEALING_TOKEN --config workers/self-healing/wrangler.toml
    npx wrangler secret put ALERT_WEBHOOK_URL --config workers/self-healing/wrangler.toml

- TELEGRAM_ADMIN_IDS: một hoặc nhiều Telegram numeric ID, ngăn cách bằng dấu phẩy.
- TELEGRAM_WEBHOOK_SECRET: chuỗi ngẫu nhiên chỉ chứa chữ/số/_/-, dùng cùng giá trị khi đăng ký Telegram webhook.
- APP_ENCRYPTION_KEY: base64 của đúng 32 byte ngẫu nhiên. Có thể tạo bằng Node.js: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))".
- SELF_HEALING_TOKEN: token ngẫu nhiên dài; dùng để bảo vệ endpoint kiểm tra thủ công.
- ALERT_WEBHOOK_URL: tùy chọn, URL webhook nhận cảnh báo.

**Quan trọng:** nếu đã có ciphertext được mã hóa bằng khóa cũ, phải giải mã bằng khóa cũ và mã hóa lại bằng khóa mới trước khi đổi APP_ENCRYPTION_KEY. Mất khóa cũ đồng nghĩa không giải mã được dữ liệu cũ.

## 5. Đăng ký Telegram webhook

Chỉ thực hiện sau khi backend deploy thành công, secrets đã được cấu hình và API domain hoạt động:
- Webhook URL: https://api.ten-mien-cua-ban.vn/telegram/webhook
- secret_token: đúng giá trị đã đặt cho TELEGRAM_WEBHOOK_SECRET.

Dừng long polling/getUpdates trên bot cũ trước khi bật webhook. Telegram không cho chạy đồng thời hai phương thức nhận update trên cùng bot token. Đặt domain Mini App trong cấu hình Telegram BotFather. Thành viên dùng /start; admin dùng /admin.

## 6. Deploy

### Cách thủ công

Sau khi thay D1 ID và domain thật:

    npm run check
    npm run test:db
    npx wrangler d1 migrations apply hendy-production --remote --config workers/backend-api/wrangler.toml

    npm run deploy:api
    npm run deploy:router
    npm run deploy:healing
    npm run deploy:user
    npm run deploy:admin

Backend phải deploy trước edge-router vì router sử dụng Service Binding tới service hendy-backend-api. Pages projects cần được tạo trước lần deploy đầu tiên.

### GitHub Actions

Trong repository Settings → Secrets and variables → Actions, tạo:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID

Cloudflare API token nên cấp quyền tối thiểu cần thiết cho Workers Scripts, D1, R2 và Pages trên đúng account. Không dùng Global API Key.

Mở tab Actions và chạy thủ công:
- **Deploy Cloudflare Workers**: áp migration D1 rồi deploy backend, edge-router, self-healing.
- **Deploy Cloudflare Pages**: deploy song song hai giao diện.

Workflow Workers sẽ từ chối chạy nếu còn D1 ID/domain placeholder hoặc thiếu GitHub secrets. Workflow Pages sẽ từ chối nếu apiBase còn trỏ example.com.

## 7. API

| Method | Endpoint | Quyền |
|---|---|---|
| GET | /healthz | Công khai |
| POST | /telegram/webhook | Telegram webhook secret |
| GET | /api/v1/packages | Công khai |
| GET | /api/v1/me | Telegram user |
| GET | /api/v1/me/orders | Telegram user |
| POST | /api/v1/orders | Telegram user |
| POST | /api/v1/deposits | Telegram user |
| GET | /api/v1/me/deposits | Telegram user |
| POST | /api/v1/tickets | Telegram user |
| GET | /api/v1/me/tickets | Telegram user |
| GET/POST/DELETE | /api/v1/accounts | Telegram user |
| GET | /api/v1/files/:key | Telegram user; kiểm tra quyền sở hữu key |
| GET | /api/v1/admin/overview | Telegram admin |
| GET/PUT | /api/v1/admin/settings | Telegram admin |
| GET/PATCH | /api/v1/admin/orders | Telegram admin |
| GET/PATCH | /api/v1/admin/deposits | Telegram admin |
| GET | /api/v1/admin/users | Telegram admin |
| GET/POST/PUT | /api/v1/admin/packages | Telegram admin |
| GET/PATCH | /api/v1/admin/tickets | Telegram admin |

Các endpoint cần Telegram auth nhận header X-Telegram-Init-Data. Không tự gửi user ID từ trình duyệt thay cho bước xác thực HMAC.

## 8. Chuyển dữ liệu và cutover

1. Export và lưu backup bất biến từ Render/JSON cũ.
2. Viết và chạy importer map user, số dư, VIP, đơn, nạp tiền, tài khoản liên kết và object files sang D1/R2.
3. Đối chiếu số lượng bản ghi, tổng số dư, tổng giao dịch, trạng thái từng đơn và ciphertext.
4. Kiểm thử bằng bot test và D1 staging trước production.
5. Dừng bot long polling cũ, chuyển webhook và quan sát logs/health.
6. Chỉ tắt Render khi dữ liệu và nghiệp vụ đã được đối chiếu đầy đủ.

Không có dữ liệu Render cũ nào được tự động nhập vào D1 trong lần deploy này. Giữ dịch vụ cũ và backup cho tới khi hoàn tất đối soát.
