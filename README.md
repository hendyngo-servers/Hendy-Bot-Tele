# Hendy Bot Tele — Cloudflare Edition

Monorepo triển khai trên Cloudflare: hai ứng dụng Pages độc lập, một Worker API/Webhook, D1 lưu dữ liệu nghiệp vụ và R2 lưu tệp phát hành.

## Kiến trúc
- apps/web-user: Telegram Mini App thành viên với 14 lối chức năng, menu màu theo ảnh, hồ sơ/số dư, Mini Game Live, Thuê Tool, Mua Code, Nạp tiền, OTP & Proxy, VIP, Trung tâm khách hàng, Ghép đôi, REF, Nhóm chat, Kênh thông báo, Giftcode và CSKH.
- apps/web-admin: bảng quản trị riêng gồm tổng quan, hàng đợi đơn/báo giá, duyệt nạp, danh mục dịch vụ, tạo Giftcode, ticket hỗ trợ, hoa hồng REF, phát hành ứng dụng và Telegram webhook.
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

Worker variables trong `backend/wrangler.toml`:
- `WEBAPP_URL`: URL Pages của web-user.
- `ADMIN_WEBAPP_URL`: URL Pages của web-admin, nút /admin mở trang này.
- `ADMIN_IDS`: danh sách Telegram ID quản trị, phân cách bằng dấu phẩy.
- `GROUP_CHAT_URL`, `NEWS_CHANNEL_URL`: URL HTTPS cho nút Nhóm chat và Kênh thông báo.
- `SUPPORT_URL` hoặc `SUPPORT_USERNAME`: liên kết CSKH; username Telegram được xác thực định dạng trước khi tạo URL.
- `BANK_NAME`, `BANK_BIN`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`: thông tin tài khoản nhận chuyển khoản. Để trống thì không hiện form tạo yêu cầu nạp.
- `REFERRAL_COMMISSION_BPS`: tỷ lệ hoa hồng theo basis points; ví dụ `500` = 5%. Giá trị mặc định `0` tắt tính hoa hồng cho tới khi chủ hệ thống chọn chính sách.
- `ALLOWED_ORIGINS`: origin Pages được phép gọi API.

Webhook ở /telegram/webhook xác minh X-Telegram-Bot-Api-Secret-Token; không nhúng secret vào URL path.

## GitHub Actions
Repository secrets:
- CLOUDFLARE_API_TOKEN: Cloudflare API token có quyền Workers Scripts:Edit, D1:Edit, R2:Edit, Pages:Edit.
- CLOUDFLARE_ACCOUNT_ID: Cloudflare Account ID.

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
- GET /api/v1/home — hồ sơ thành viên, số dư và số liệu tổng hợp đơn hàng.
- GET /api/v1/me — hồ sơ cơ bản.
- GET /api/v1/public-config — chỉ trả về URL nhóm chat, kênh thông báo và CSKH đã được cấu hình.
- GET /api/v1/wallet — số dư, thông tin chuyển khoản, lịch sử nạp và wallet ledger.
- POST /api/v1/deposits — tạo yêu cầu nạp thủ công có tham chiếu/QR, bắt buộc `Idempotency-Key`.
- POST /api/v1/orders/:id/pay — thanh toán đơn đã được xác nhận bằng số dư ví; bắt buộc `Idempotency-Key`.
- GET /api/v1/catalog?module=... — danh mục đang mở bán, giá và tồn kho từ D1.
- GET /api/v1/vip và GET/POST /api/v1/referral — cấp bậc, mã giới thiệu và ghi nhận người mời.
- POST /api/v1/giftcodes/redeem — đổi Giftcode sang voucher; mỗi lượt đổi được kiểm soát tại D1.
- GET/POST /api/v1/support/tickets và các route detail/messages — tạo ticket, xem lịch sử và trao đổi với CSKH.
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
- GET/POST /api/v1/admin/catalog và POST /api/v1/admin/catalog/:id/activate|deactivate — quản lý danh mục, giá, thời hạn và tồn kho.
- GET/POST /api/v1/admin/giftcodes — tạo Giftcode, danh sách chỉ hiển thị metadata; mã gốc chỉ trả một lần khi tạo.
- GET/POST /api/v1/admin/support/tickets — xem ticket, chi tiết, gửi phản hồi và cập nhật trạng thái.
- GET /api/v1/admin/referrals/commissions và POST /api/v1/admin/referrals/commissions/:id/settle — duyệt, chi trả vào ví hoặc hủy hoa hồng.
- GET /api/v1/admin/orders — hàng đợi, tìm kiếm và lọc đơn; POST /:id/quote gửi báo giá; POST /:id/status chuyển trạng thái có nhật ký.
- GET /api/v1/admin/deposits?status=pending — danh sách yêu cầu nạp.
- POST /api/v1/admin/deposits/:id/review — duyệt/từ chối; chỉ duyệt sau khi xác minh tiền vào ngân hàng.
- POST /api/v1/admin/releases — Bearer ADMIN_API_TOKEN hoặc Telegram admin allowlist.
- GET /api/v1/admin/stats — quản trị đã xác thực.
- POST /api/v1/admin/webhook/setup — quản trị đã xác thực và X-Webhook-Setup-Key.

## Dữ liệu đơn hàng và giao dịch

Migration 0003 tạo:
- orders: đơn thuộc user_id, trạng thái, nội dung yêu cầu, request hash và unique(user_id, idempotency_key).
- order_events: nhật ký trạng thái append-only, unique(order_id, event_key).
- wallet_transactions và wallet_ledger: schema nền cho kết nối ví ở giai đoạn sau; chưa có API ghi nhận tiền khi chưa tích hợp và xác minh nhà cung cấp.

Worker tạo đơn bằng D1 batch gồm kiểm tra/giữ tồn kho (nếu sản phẩm có giới hạn), đơn hàng và sự kiện "created"; cùng một Idempotency-Key + payload trả lại đơn cũ, còn dùng lại key cho payload khác nhận HTTP 409. Người dùng không thể xem đơn của tài khoản Telegram khác. Sản phẩm lấy giá từ D1; đơn không có giá chờ Admin báo giá.

## Bảo mật

Mini App chỉ gửi raw Telegram.WebApp.initData; Worker xác minh HMAC và auth_date. Không dùng initDataUnsafe để xác thực. initData có thời hạn tối đa 1 giờ trong cấu hình mặc định.

Webhook xác minh X-Telegram-Bot-Api-Secret-Token. CORS chỉ cấp Access-Control-Allow-Origin cho origin được allowlist. Admin API yêu cầu ADMIN_API_TOKEN hoặc Telegram initData thuộc ADMIN_IDS; mở URL Pages không tự cấp quyền.

Mã nguồn không thu thập/lưu mật khẩu, OTP, cookie hoặc secret tài khoản bên thứ ba. Phần liên kết chỉ lưu mã/tên tài khoản để người dùng quản lý. Chỉ tích hợp OAuth/API chính thức của nhà cung cấp khi bổ sung dịch vụ ngoài.

Rate limit KV hiện là best-effort vì KV không có phép tăng nguyên tử. Với lưu lượng lớn, chuyển sang Durable Object rate limiter.


## Menu Telegram và ví nạp thủ công

Lệnh `/start` hiển thị menu nút nhiều hàng theo bố cục ảnh tham chiếu: Mini Game Live, Thuê Tool, Mua Code, Nạp tiền, OTP & Proxy, Kho VIP, Trung tâm khách hàng, Ghép đôi, REF, VIP, Nhóm chat, Kênh thông báo, Giftcode và CSKH. Các nút mở Mini App theo module. Lệnh `/admin` chỉ hiển thị trang quản trị khi Telegram ID thuộc `ADMIN_IDS`.

Migration `0007_manual_deposits.sql` bổ sung yêu cầu nạp thủ công. Người dùng tạo yêu cầu với số tiền và mã tham chiếu; Admin kiểm tra giao dịch ngân hàng rồi duyệt hoặc từ chối. Duyệt dùng D1 batch để cập nhật số dư và ghi `wallet_ledger` một lần. Không có webhook ngân hàng tự động nên không được bật tự cộng tiền dựa trên nội dung người dùng gửi.

Sau khi deploy Worker, cấu hình thông tin nhận tiền bằng Wrangler variables (không commit thông tin riêng tư vào mã nguồn):
Thiết lập `BANK_NAME`, `BANK_BIN`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME` trong `backend/wrangler.toml` hoặc Worker Variables trên Cloudflare Dashboard, sau đó deploy lại Worker.


## Telegram Bot và ví nạp thủ công

Lệnh `/start` hiển thị menu nhiều hàng theo ảnh tham chiếu: Mini Game Live, Thuê Tool, Mua Code, Nạp tiền, OTP & Proxy, Kho công cụ VIP, Trung tâm khách hàng, Ghép đôi, REF, VIP, Nhóm chat, Kênh thông báo, Giftcode và CSKH. Các nút Mini App truyền module qua query string. Lệnh `/admin` chỉ hoạt động với Telegram ID nằm trong `ADMIN_IDS` và mở `ADMIN_WEBAPP_URL`.

Ví hỗ trợ tạo yêu cầu nạp bằng chuyển khoản thủ công, xem lịch sử và Admin duyệt/từ chối. Khi duyệt, Worker dùng D1 batch để cập nhật số dư và ghi `wallet_ledger`; lặp thao tác không cộng tiền lần hai. Không có bank webhook tự động, không có rút tiền. Admin phải kiểm tra giao dịch thật trước khi duyệt.


## Backup và TLS
    node scripts/db-backup.js

Script xuất D1 remote và upload SQL vào prefix backups/d1 trong R2. Cloudflare tự quản lý chứng chỉ edge; scripts/cert-renewer.js chỉ kiểm tra HTTPS/TLS, không thay thế quy trình cấp/renew certificate của Cloudflare.

## Triển khai và giới hạn

Trước khi deploy cần thay `database_id` và KV namespace ID trong `backend/wrangler.toml`; tạo R2 bucket và hai Pages project; cấu hình secrets/variables trong GitHub và Cloudflare. Không commit `.dev.vars` hoặc token thật.

GitHub Actions chỉ tự deploy khi có `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, D1 ID, KV ID và `VITE_API_BASE_URL`. Nếu thiếu, CI vẫn chạy tests/build nhưng tự bỏ qua bước deploy để tránh triển khai sai cấu hình.

Áp dụng toàn bộ migration D1 theo thứ tự trước khi sử dụng API đơn hàng và ví:

    pnpm exec wrangler d1 migrations apply DB --remote --config backend/wrangler.toml

Ví hỗ trợ nạp chuyển khoản thủ công, QR/tham chiếu, lịch sử nạp và wallet ledger; Admin phải xác minh tiền vào ngân hàng trước khi duyệt. Không có webhook ngân hàng tự động hoặc rút tiền. Đơn hàng dùng giá danh mục hoặc báo giá Admin; thanh toán ví có idempotency, trừ tiền và ghi ledger; hủy đơn đã trả tiền sẽ hoàn lại ví. Giftcode được tạo bởi Admin, mã gốc chỉ trả một lần và đổi voucher được giới hạn tại D1. REF ghi nhận giới thiệu và có thể phát sinh hoa hồng sau khi đơn của người được mời đã thanh toán + hoàn tất; Admin duyệt rồi chi hoa hồng về ví. Tỷ lệ cần cấu hình bằng `REFERRAL_COMMISSION_BPS`; mặc định 0 (tắt). OTP/Proxy, Mini Game Live và Ghép đôi có hàng đợi yêu cầu, danh mục/đơn và Admin xử lý; tự động cấp OTP/proxy hoặc tự động ghép đôi cần tích hợp nhà cung cấp/quy tắc nghiệp vụ mà hệ thống chưa được cung cấp.


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

Đơn có giá phải được khách chấp nhận báo giá (nếu có) và thanh toán qua ví trước khi Admin chuyển sang `processing`. Khi hủy đơn đã thanh toán, hệ thống hoàn số tiền vào ví và ghi ledger; khi hủy đơn gắn tồn kho, số lượng đã giữ được trả lại.

Migration 0004 bổ sung loại người thực hiện và nhãn admin vào nhật ký, không xóa đơn cũ. D1 batch thực hiện cập nhật trạng thái + ghi event trong cùng transaction; câu UPDATE có điều kiện theo trạng thái hiện tại để tránh hai nhân viên ghi đè lẫn nhau. Cùng một Idempotency-Key chỉ có thể phát lại đúng thao tác đã ghi.

Admin web có hàng đợi, lọc trạng thái/module, tìm kiếm, chi tiết đơn, lịch sử và nút xác nhận/đang xử lý/hoàn tất/hủy. Admin không thể chỉnh tiền ở màn hình này; báo giá, thanh toán, đối soát và tích hợp nhà cung cấp nằm ở giai đoạn tiếp theo.
