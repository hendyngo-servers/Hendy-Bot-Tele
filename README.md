# Hendy Bot Tele — Cloudflare Edition

Monorepo triển khai trên Cloudflare: hai ứng dụng Pages độc lập, một Worker API/Webhook, D1 lưu dữ liệu nghiệp vụ và R2 lưu tệp phát hành.

## Kiến trúc
- apps/web-user: Telegram Mini App và khu vực thành viên, dashboard 9 module, danh sách đơn hàng, liên kết tài khoản và tải bản phát hành.
- apps/web-admin: bảng quản trị riêng, upload bản phát hành và đồng bộ Telegram webhook.
- backend: một Cloudflare Worker cho REST API và Telegram webhook.
- D1: hồ sơ người dùng, metadata bản phát hành, đơn hàng, nhật ký trạng thái và schema nền cho giao dịch ví.
- R2: APK/AAB/IPA/EXE/MSI/DMG và các tệp phát hành.
- KV: rate limit mức cơ bản.
- packages/db-schema: migration SQL; packages/shared-types: kiểu dữ liệu chung.

Không cần Render server. Backend dùng Fetch API và Telegram Bot HTTP API, không cần tiến trình bot chạy nền.

## Yêu cầu
Node.js 20+, pnpm 9, tài khoản Cloudflare có quyền Workers, Pages, D1, R2, KV và Telegram bot token.

## Tạo tài nguyên Cloudflare lần đầu
Ở thư mục gốc repository:

    pnpm install
    pnpm exec wrangler login
    pnpm exec wrangler d1 create hendy_bot_db
    pnpm exec wrangler r2 bucket create hendy-bot-assets
    pnpm exec wrangler kv namespace create RATE_LIMITER

Sao chép database_id và KV id vào backend/wrangler.toml, thay REPLACE_WITH_D1_DATABASE_ID và REPLACE_WITH_KV_NAMESPACE_ID bằng ID thật. Không commit token hoặc secret.

Tạo hai Pages project một lần:

    pnpm exec wrangler pages project create hendy-web-user --production-branch main
    pnpm exec wrangler pages project create hendy-web-admin --production-branch main

## Secrets cho Worker
    pnpm exec wrangler secret put BOT_TOKEN --config backend/wrangler.toml
    pnpm exec wrangler secret put WEBHOOK_SECRET_TOKEN --config backend/wrangler.toml
    pnpm exec wrangler secret put WEBHOOK_SETUP_KEY --config backend/wrangler.toml
    pnpm exec wrangler secret put ADMIN_API_TOKEN --config backend/wrangler.toml

BOT_TOKEN: token Telegram.
WEBHOOK_SECRET_TOKEN: chuỗi 1–256 ký tự chữ/số/gạch dưới/gạch ngang, xác minh header Telegram.
WEBHOOK_SETUP_KEY: khóa riêng gọi endpoint đăng ký webhook.
ADMIN_API_TOKEN: bearer token bảng quản trị.
ADMIN_IDS: Worker variable tùy chọn, danh sách Telegram ID quản trị phân tách bằng dấu phẩy.

Worker variables:
- PUBLIC_API_BASE_URL: URL HTTPS public của Worker.
- WEBAPP_URL: URL Pages của web-user.
- ALLOWED_ORIGINS: hai origin Pages, phân cách bằng dấu phẩy.
- ADMIN_IDS: danh sách Telegram ID quản trị, nếu dùng Telegram initData cho admin.

Webhook ở /telegram/webhook xác minh X-Telegram-Bot-Api-Secret-Token; không nhúng secret vào URL path.

## GitHub Actions
Repository secrets:
- CF_API_TOKEN: Cloudflare API token có quyền Workers Scripts:Edit, D1:Edit, R2:Edit, Pages:Edit.
- CF_ACCOUNT_ID: Cloudflare Account ID.

Repository variable:
- VITE_API_BASE_URL: URL HTTPS Worker, không có dấu slash cuối.

Pages project phải được tạo trước, tên hendy-web-user và hendy-web-admin. Workflow backend chạy test, apply D1 migrations rồi deploy Worker.

## Chạy local và kiểm tra
    pnpm install
    pnpm db:migrate:local
    pnpm --filter backend dev

Frontend (terminal riêng):
    pnpm --filter web-user dev
    pnpm --filter web-admin dev

Build và test:
    pnpm build
    pnpm test

## API đã triển khai

Public:
- GET /healthz
- GET /api/v1/health
- GET /api/v1/releases
- GET /api/v1/releases/:id/download

Yêu cầu Telegram Mini App; mọi request gửi header Authorization: tma <Telegram initData>:
- GET /api/v1/home — hồ sơ thành viên, số dư đọc-only và số liệu tổng hợp đơn hàng.
- GET /api/v1/me — hồ sơ cơ bản.
- GET /api/v1/orders?limit=20&offset=0 — danh sách đơn của chính Telegram user.
- GET /api/v1/orders/:id — chi tiết một đơn thuộc chính user.
- POST /api/v1/orders — tạo yêu cầu dịch vụ, bắt buộc header Idempotency-Key (8–128 ký tự an toàn).

Ví dụ tạo đơn (không truyền số tiền; hệ thống chờ nhân viên báo giá):

    curl -X POST "$VITE_API_BASE_URL/api/v1/orders" \
      -H "Authorization: tma $TELEGRAM_INIT_DATA" \
      -H "Idempotency-Key: order-form-session-001" \
      -H "Content-Type: application/json" \
      -d '{"module":"app_tool","title":"Yêu cầu thuê công cụ","description":"Gói 7 ngày","quantity":1}'

Module tạo đơn ở giai đoạn này: mini_game_live, app_tool, buy_code, otp_proxy, vip. Giá trị tiền do server/admin/provider quyết định ở giai đoạn sau; payload phía trình duyệt không thể thiết lập giá.

Admin:
- POST /api/v1/admin/releases — Bearer ADMIN_API_TOKEN hoặc Telegram admin allowlist.
- GET /api/v1/admin/stats — quản trị đã xác thực.
- POST /api/v1/admin/webhook/setup — quản trị đã xác thực và X-Webhook-Setup-Key.

## Dữ liệu đơn hàng và giao dịch

Migration 0003 tạo:
- orders: đơn thuộc user_id, trạng thái, nội dung yêu cầu, request hash và unique(user_id, idempotency_key).
- order_events: nhật ký trạng thái append-only, unique(order_id, event_key).
- wallet_transactions và wallet_ledger: schema nền cho kết nối ví ở giai đoạn sau; chưa có API ghi nhận tiền khi chưa tích hợp và xác minh nhà cung cấp.

Worker tạo đơn bằng D1 batch gồm đơn hàng và sự kiện "created"; cùng một Idempotency-Key + payload trả lại đơn cũ, còn dùng lại key cho payload khác nhận HTTP 409. Người dùng không thể xem đơn của tài khoản Telegram khác. Đơn mới luôn là pending / awaiting_quote và không trừ số dư.

## Bảo mật

Mini App chỉ gửi raw Telegram.WebApp.initData; Worker xác minh HMAC và auth_date. Không dùng initDataUnsafe để xác thực. initData có thời hạn tối đa 1 giờ trong cấu hình mặc định.

Webhook xác minh X-Telegram-Bot-Api-Secret-Token. CORS chỉ cấp Access-Control-Allow-Origin cho origin được allowlist. Admin API yêu cầu ADMIN_API_TOKEN hoặc Telegram initData thuộc ADMIN_IDS; mở URL Pages không tự cấp quyền.

Mã nguồn không thu thập/lưu mật khẩu, OTP, cookie hoặc secret tài khoản bên thứ ba. Phần liên kết chỉ lưu mã/tên tài khoản để người dùng quản lý. Chỉ tích hợp OAuth/API chính thức của nhà cung cấp khi bổ sung dịch vụ ngoài.

Rate limit KV hiện là best-effort vì KV không có phép tăng nguyên tử. Với lưu lượng lớn, chuyển sang Durable Object rate limiter.

## Backup và TLS
    node scripts/db-backup.js

Script xuất D1 remote và upload SQL vào prefix backups/d1 trong R2. Cloudflare tự quản lý chứng chỉ edge; scripts/cert-renewer.js chỉ kiểm tra HTTPS/TLS, không thay thế quy trình cấp/renew certificate của Cloudflare.

## Triển khai và giới hạn

Trước khi deploy cần thay database_id và KV namespace ID trong backend/wrangler.toml; tạo R2 bucket và hai Pages project; cấu hình secrets/variables trong GitHub và Cloudflare. Không commit .dev.vars hoặc token thật.

Migration 0003 phải được áp dụng trước khi sử dụng API đơn hàng:

    pnpm exec wrangler d1 migrations apply DB --remote --config backend/wrangler.toml

Ví điện tử, xác nhận thanh toán, nạp/rút, OTP/proxy thực tế, Giftcode và hoa hồng REF chưa được bật. Các bảng giao dịch trong migration chỉ là nền dữ liệu; cần xác minh chữ ký webhook, đối soát và idempotency của nhà cung cấp trước khi xử lý tiền thật.


## Hàng đợi đơn hàng trong Admin

Admin API yêu cầu Bearer `ADMIN_API_TOKEN` hoặc Telegram initData thuộc `ADMIN_IDS`; không có API nào cấp quyền chỉ dựa vào URL Pages.

- `GET /api/v1/admin/orders?status=pending&module=all&limit=100` — danh sách có lọc trạng thái/module và tìm kiếm mã đơn, tiêu đề, Telegram ID hoặc tên.
- `GET /api/v1/admin/orders/:id` — chi tiết đơn và nhật ký xử lý.
- `POST /api/v1/admin/orders/:id/status` — chuyển trạng thái, cần `Idempotency-Key`.

Ví dụ chuyển đơn từ chờ tiếp nhận sang đã xác nhận:

    curl -X POST "$VITE_API_BASE_URL/api/v1/admin/orders/ORDER_UUID/status" \
      -H "Authorization: Bearer $ADMIN_API_TOKEN" \
      -H "Idempotency-Key: admin-action-001" \
      -H "Content-Type: application/json" \
      -d '{"expectedStatus":"pending","status":"confirmed","note":"Đã kiểm tra thông tin yêu cầu"}'

Luồng trạng thái được giới hạn:
- pending → confirmed hoặc cancelled
- confirmed → processing hoặc cancelled
- processing → completed hoặc cancelled
- completed / cancelled là trạng thái cuối.

Migration 0004 bổ sung loại người thực hiện và nhãn admin vào nhật ký, không xóa đơn cũ. D1 batch thực hiện cập nhật trạng thái + ghi event trong cùng transaction; câu UPDATE có điều kiện theo trạng thái hiện tại để tránh hai nhân viên ghi đè lẫn nhau. Cùng một Idempotency-Key chỉ có thể phát lại đúng thao tác đã ghi.

Admin web có hàng đợi, lọc trạng thái/module, tìm kiếm, chi tiết đơn, lịch sử và nút xác nhận/đang xử lý/hoàn tất/hủy. Admin không thể chỉnh tiền ở màn hình này; báo giá, thanh toán, đối soát và tích hợp nhà cung cấp nằm ở giai đoạn tiếp theo.
