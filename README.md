# Hendy Bot Tele — Cloudflare Platform

Hạ tầng đích: Cloudflare Workers + Pages + D1 + R2. Giao diện mặc định tiếng Việt.

## Cấu trúc

- apps/web-user: Pages dành cho người dùng.
- apps/web-admin: Pages dành cho quản trị viên.
- workers/edge-router: định tuyến hostname và chuyển API bằng Service Binding.
- workers/backend-api: REST API, Telegram webhook, xác thực Telegram Mini App, D1 và R2.
- workers/self-healing: Cron health checks và cảnh báo theo rules; không tự sửa mã hoặc tự deploy.
- packages/db-schema: D1 migrations.
- packages/crypto: mã hóa AES-256-GCM bằng Web Crypto API.

## Trạng thái và giới hạn quan trọng

Nhánh main đã được chuyển sang cấu trúc Cloudflare. Các endpoint nền tảng gồm health, Telegram webhook, hồ sơ, danh mục, tổng quan admin, cấu hình admin và tải tệp riêng tư. Đây chưa phải bản parity đầy đủ với mọi nghiệp vụ cũ của bot (đơn hàng, thanh toán, giftcode, referral, ticket và quản lý tài khoản liên kết). Những nghiệp vụ đó cần được port và kiểm thử từng module trước khi nhận traffic production.

Dữ liệu cũ trong database.json không tự chuyển sang D1. Giữ bản sao lưu gốc và không xóa dịch vụ/disk Render cũ cho tới khi export, nhập, đối chiếu dữ liệu và kiểm thử xong. Nếu dữ liệu nhạy cảm đã mã hóa bằng khóa cũ, cần decrypt bằng khóa cũ rồi encrypt lại bằng khóa mới trong quy trình an toàn; không log plaintext và không đổi khóa trước khi chuyển đổi xong.

## Yêu cầu

- Node.js 22+
- Tài khoản Cloudflare có Workers, Pages, D1 và R2
- Wrangler CLI: npm install rồi npx wrangler login
- Nên có domain riêng cho app, admin và API.

## 1. Tạo D1 và R2

Tạo D1:

    npx wrangler d1 create hendy-production

Thay REPLACE_WITH_D1_DATABASE_ID trong workers/backend-api/wrangler.toml bằng database_id trả về.

Tạo R2:

    npx wrangler r2 bucket create hendy-app-files

Chạy migration local:

    npx wrangler d1 migrations apply hendy-production --local --config workers/backend-api/wrangler.toml

Chạy migration production chỉ sau khi xác nhận đúng account/database và có backup:

    npx wrangler d1 migrations apply hendy-production --remote --config workers/backend-api/wrangler.toml

## 2. Thiết lập secrets backend

APP_ENCRYPTION_KEY phải là base64 của đúng 32 byte ngẫu nhiên. Dùng trình tạo mật mã an toàn; không dùng mật khẩu thường.

    npx wrangler secret put TELEGRAM_BOT_TOKEN --config workers/backend-api/wrangler.toml
    npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config workers/backend-api/wrangler.toml
    npx wrangler secret put TELEGRAM_ADMIN_IDS --config workers/backend-api/wrangler.toml
    npx wrangler secret put APP_ENCRYPTION_KEY --config workers/backend-api/wrangler.toml

Thiết lập TELEGRAM_WEBAPP_URL và ALLOWED_ORIGINS trong cấu hình backend sau khi tạo domain thật. Không đặt token/khóa mã hóa trong vars hoặc Pages.

Self-healing:

    npx wrangler secret put SELF_HEALING_TOKEN --config workers/self-healing/wrangler.toml
    npx wrangler secret put ALERT_WEBHOOK_URL --config workers/self-healing/wrangler.toml

## 3. Deploy Workers

Sau khi đã điền D1 ID và secrets:

    npm run deploy:api
    npm run deploy:router
    npm run deploy:healing

Backend phải deploy trước edge router vì router dùng Service Binding tới hendy-backend-api.

## 4. Tạo Pages

Trong Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git, tạo hai project:

| Project | Root directory | Build command | Output |
|---|---|---|---|
| hendy-web-user | apps/web-user | để trống (static) | apps/web-user |
| hendy-web-admin | apps/web-admin | để trống (static) | apps/web-admin |

Hoặc deploy thủ công:

    npm run deploy:user
    npm run deploy:admin

## 5. Domain và API

- app.example.com → Pages project hendy-web-user.
- admin.example.com → Pages project hendy-web-admin.
- api.example.com → Worker edge-router.
- Thay api.example.com trong apps/web-user/app.js và apps/web-admin/app.js bằng API domain thật.
- Cập nhật ALLOWED_ORIGINS, USER_PAGES_ORIGIN và ADMIN_PAGES_ORIGIN trong wrangler.toml.

Pages custom domains có thể trỏ trực tiếp tới Pages. Chỉ cần router cho HTML nếu thật sự muốn một điểm vào tập trung; không dùng User-Agent như cơ chế bảo mật.

## 6. Telegram webhook

Sau khi API domain hoạt động và secrets đã được cấu hình, gọi Telegram Bot API setWebhook với URL https://api.example.com/telegram/webhook và secret_token trùng TELEGRAM_WEBHOOK_SECRET. Dừng long polling cũ trước khi bật webhook; không chạy getUpdates đồng thời trên cùng bot token.

## 7. GitHub Actions

Thêm repository secrets CLOUDFLARE_API_TOKEN và CLOUDFLARE_ACCOUNT_ID. Cấp quyền tối thiểu cần thiết cho Workers Scripts, Pages, D1 và R2. Workflow deploy được để manual dispatch cho tới khi đã provision resource và điền ID/domain; CI vẫn chạy tự động khi push/PR.

## 8. Phát triển

- Backend: thêm endpoint vào workers/backend-api/src/index.ts; xác thực, validate payload, giới hạn kích thước và audit thao tác admin.
- D1: mỗi thay đổi schema tạo migration SQL mới; không sửa migration đã chạy production.
- R2: object key không đoán được, xác thực trước tải, giới hạn content-type/kích thước, không bật public write.
- Crypto: dùng ciphertext có version; không đổi APP_ENCRYPTION_KEY nếu chưa re-encrypt dữ liệu cũ.
- Pages: chỉ chứa public config; không nhúng secret.
- Self-healing: chỉ health checks, cảnh báo và rules idempotent đã phê duyệt.

## 9. Di trú và cutover

1. Export database.json và file QR/app cũ thành backup bất biến.
2. Viết importer map users, appData, orders, deposits và linked accounts sang schema D1.
3. Chuyển đổi ciphertext bằng khóa cũ rồi mã hóa bằng khóa mới; tuyệt đối không ghi log plaintext.
4. Đối chiếu số user, tổng số dư, trạng thái giao dịch, VIP và tham chiếu file.
5. Kiểm thử staging bằng Bot test token.
6. Dừng long polling Render, bật webhook trên Cloudflare, theo dõi lỗi và delivery.
7. Chỉ tắt Render sau khi toàn bộ chức năng và dữ liệu đã được xác nhận.

## API hiện có

- GET /healthz
- POST /telegram/webhook
- GET /api/v1/me (Telegram Mini App initData)
- GET /api/v1/packages
- GET /api/v1/admin/overview
- GET/PUT /api/v1/admin/settings
- GET /api/v1/files/:key (xác thực Telegram Mini App)

Đây là nền tảng Cloudflare ban đầu, chưa thay thế đầy đủ toàn bộ nghiệp vụ bot cũ.