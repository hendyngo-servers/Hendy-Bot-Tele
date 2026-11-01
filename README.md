# Hendy-Bot-Tele — Cloudflare Platform

Nền tảng đích sử dụng Cloudflare Workers, Pages, D1 và R2. Đây là bản chuyển đổi kiến trúc từ ứng dụng Node.js/Express/Telegraf + JSON file trên Render sang mô hình serverless. Telegram Bot được chuyển sang webhook; không chạy long polling trên Workers.

## Kiến trúc và trách nhiệm

| Thành phần | Tên tài nguyên | Trách nhiệm |
|---|---|---|
| Pages | hendy-web-user | Chợ ứng dụng, hồ sơ, dịch vụ, đơn hàng, nạp tiền và hỗ trợ |
| Pages | hendy-web-admin | CMS quản trị, duyệt nạp/đơn, quản lý dịch vụ, thành viên, tệp và cấu hình |
| Worker | hendy-edge-router | Điều hướng domain/path và gọi backend bằng Service Binding |
| Worker | hendy-backend-api | REST API, Telegram webhook, auth, nghiệp vụ, D1/R2 |
| Worker | hendy-self-healing | Cron health checks, cảnh báo và sao lưu DB sang R2 |
| D1 | hendy-production | Dữ liệu quan hệ, trạng thái, giao dịch, audit log |
| R2 | hendy-app-files | Tệp cài đặt, media, QR và snapshot backup |

### Lưu ý kiến trúc bảo mật

- User-Agent không được dùng làm căn cứ phân quyền hoặc quyết định bảo mật. Router ưu tiên hostname và path.
- API kiểm tra chữ ký Telegram Mini App initData ở server. Không tin initDataUnsafe hoặc cờ quyền từ trình duyệt.
- Webhook kiểm tra header X-Telegram-Bot-Api-Secret-Token và chống xử lý lặp update_id.
- Admin ID nằm trong Worker Secret TELEGRAM_ADMIN_IDS (danh sách ID phân tách bằng dấu phẩy).
- Khóa mã hóa chỉ được cấu hình dưới dạng Worker Secret APP_ENCRYPTION_KEY. Không lưu khóa trong D1, Pages hay GitHub source.
- Mã hóa tài khoản liên kết hiện giữ định dạng AES-256-GCM version 1 để tương thích ciphertext cũ của Render; triển khai dùng Web Crypto của Workers. Đây **chưa phải libsodium**. Không đổi thuật toán/khóa trước khi giải mã và tái mã hóa dữ liệu cũ. Có thể nâng cấp sang libsodium ở phiên bản ciphertext mới sau migration có kiểm thử.
- Không cho self-healing tự sửa source hoặc tự deploy. Mọi thay đổi mã nguồn phải qua Pull Request và CI.
- R2 bucket không bật public write. File download cần phiên Telegram hợp lệ.
- Cấu hình CORS phải chỉ định đúng các origin thực tế.

## Cấu trúc repository

- apps/web-user: Pages người dùng (React + Vite, tiếng Việt).
- apps/web-admin: Pages quản trị (React + Vite, tiếng Việt).
- workers/backend-api: API, xác thực Telegram, Bot webhook, D1, R2.
- workers/edge-router: router biên với Service Binding.
- workers/self-healing: Cron health checks và daily backup.
- packages/db-schema: migrations D1.
- packages/crypto: mã hóa/giải mã dữ liệu bí mật.
- packages/shared: types và validators.
- scripts: cấu hình webhook và import dữ liệu JSON cũ.

## Yêu cầu công cụ

- Node.js 22 LTS hoặc mới hơn.
- npm 10+.
- Git.
- Tài khoản Cloudflare có quyền Workers, Pages, D1, R2.
- Telegram Bot Token.
- Custom domain đã được thêm vào Cloudflare DNS (khuyến nghị).

Cài dependencies:

    npm install
    npm run typecheck
    npm test
    npm run build

Trên Windows PowerShell cũng sử dụng các lệnh npm như trên. Các ví dụ dưới đây dùng cú pháp PowerShell và không ghi secret vào file mã nguồn.

## 1. Tạo tài nguyên Cloudflare

Đăng nhập:

    npx wrangler login

Tạo D1 database:

    npx wrangler d1 create hendy-production

Chép database_id Cloudflare trả về vào workers/backend-api/wrangler.jsonc, thay UUID placeholder 00000000-0000-4000-8000-000000000000.

Tạo R2 bucket:

    npx wrangler r2 bucket create hendy-app-files

Áp dụng migration trước ở local:

    npm run db:local

Sau khi kiểm tra schema local, áp dụng production:

    npm run db:remote

Không chạy import dữ liệu cho tới khi schema remote đã được tạo. Không ghi đè DB đang có dữ liệu.

## 2. Thiết lập Worker Secrets

Đặt secrets cho backend API:

    npx wrangler secret put TELEGRAM_BOT_TOKEN --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put TELEGRAM_ADMIN_IDS --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put TELEGRAM_BOT_USERNAME --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put WEB_APP_URL --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put WEB_USER_URL --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put WEB_ADMIN_URL --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put APP_ENCRYPTION_KEY --config workers/backend-api/wrangler.jsonc
    npx wrangler secret put BACKUP_SECRET --config workers/backend-api/wrangler.jsonc

TELEGRAM_WEBHOOK_SECRET phải dài 32-256 ký tự và chỉ gồm chữ/số/_/-. APP_ENCRYPTION_KEY phải tối thiểu 32 ký tự. Nếu import dữ liệu mã hóa từ Render, phải sử dụng chính xác APP_ENCRYPTION_KEY cũ. Không xoay khóa trước khi di trú và xác minh giải mã thành công.

Đặt BACKUP_SECRET giống nhau cho backend và self-healing:

    npx wrangler secret put BACKUP_SECRET --config workers/self-healing/wrangler.jsonc

Nếu dùng cảnh báo webhook:

    npx wrangler secret put ALERT_WEBHOOK_URL --config workers/self-healing/wrangler.jsonc

## 3. Deploy Workers

Thứ tự triển khai:

    npm run deploy:api
    npm run deploy:router
    npm run deploy:healing

Backend cần D1/R2 bindings. Router cần Service Binding BACKEND trỏ tới hendy-backend-api. Self-healing cần Service Binding BACKEND trỏ cùng Worker.

Trong Dashboard → Workers & Pages → từng Worker → Settings → Variables and Secrets, xác minh bindings/secrets đã hiện diện.

## 4. Tạo Pages

Tạo trước hai Pages project bằng Dashboard → Workers & Pages → Create → Pages → Direct Upload, hoặc Wrangler:

    npx wrangler pages project create hendy-web-user --production-branch main
    npx wrangler pages project create hendy-web-admin --production-branch main

Sau đó tạo deployments bằng Wrangler (khuyến nghị trong pipeline CI):

| Project | Source | Build command | Output |
|---|---|---|---|
| hendy-web-user | apps/web-user | npm run build:user | apps/web-user/dist |
| hendy-web-admin | apps/web-admin | npm run build:admin | apps/web-admin/dist |

Direct Upload project không thể đổi sang Git integration sau khi đã tạo; nếu muốn Cloudflare tự build từ GitHub, hãy tạo project bằng Git integration ngay từ đầu.

Nếu deploy bằng Wrangler:

    npm run build
    npm run deploy:user
    npm run deploy:admin

Pages cần biến build `VITE_API_BASE_URL` trỏ tới API origin (ví dụ https://api.example.com). Đặt GitHub Repository Variable cùng tên `VITE_API_BASE_URL` để workflow build có thể nhúng API origin vào asset tĩnh; đây là địa chỉ công khai, không phải secret. Cũng có thể dùng cùng origin app/admin và route /api qua edge-router để tránh CORS. Nếu dùng api.example.com, cập nhật ALLOWED_ORIGINS trên backend.

## 5. Domain và Edge Router

Trong Cloudflare Dashboard, thêm custom domains/routes cho Worker hendy-edge-router:
- app.example.com/*
- admin.example.com/*
- api.example.com/*

Thay example.com bằng domain thật. Router gửi các path /api/, /telegram/, /internal/ và /healthz tới backend qua Service Binding; các path giao diện được proxy sang hai Pages origins trong workers/edge-router/wrangler.jsonc.

Cập nhật USER_PAGES_ORIGIN, ADMIN_PAGES_ORIGIN trong config sau khi tạo Pages projects. DNS/TLS phải Active trước khi kiểm thử.

Nếu muốn đơn giản hơn, có thể gắn trực tiếp custom domain riêng cho hai Pages projects và domain API cho backend; khi đó router là tùy chọn. Sơ đồ hiện tại giữ edge-router để gom định tuyến.

## 6. Thiết lập Telegram Webhook

Sau khi API domain hoạt động và đã dừng tiến trình long polling Render, chạy lệnh từ máy phát triển. Không đưa token vào Git hoặc commit. Trên Windows PowerShell:

    $env:TELEGRAM_BOT_TOKEN = Read-Host "Nhập Telegram Bot Token"
    $env:TELEGRAM_WEBHOOK_SECRET = Read-Host "Nhập Webhook Secret"
    $env:TELEGRAM_WEBHOOK_URL = "https://api.example.com/telegram/webhook"
    node scripts/set-telegram-webhook.mjs

Trên macOS/Linux:

    TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... TELEGRAM_WEBHOOK_URL=https://api.example.com/telegram/webhook node scripts/set-telegram-webhook.mjs

Telegram gửi update dưới dạng HTTPS POST và kèm secret header. Không chạy getUpdates/long polling cùng token khi webhook đã được bật.

## 7. Di trú dữ liệu JSON từ Render sang D1

1. Sao lưu nguyên bản DATA_DIR/database.json từ Render Persistent Disk. Không sửa file nguồn.
2. Sao chép file về máy phát triển trong thư mục riêng, không commit.
3. Chạy thử mapping:

    node scripts/import-json-to-d1.mjs ./database.json --dry-run

4. Chạy import vào D1 production chỉ khi D1 mới/đã backup.

Windows PowerShell:

    $env:CLOUDFLARE_ACCOUNT_ID = "ACCOUNT_ID"
    $env:CLOUDFLARE_D1_DATABASE_ID = "D1_DATABASE_ID"
    $env:CLOUDFLARE_API_TOKEN = Read-Host "Nhập Cloudflare API Token"
    node scripts/import-json-to-d1.mjs .\database.json

macOS/Linux:

    CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_D1_DATABASE_ID=... CLOUDFLARE_API_TOKEN=... node scripts/import-json-to-d1.mjs ./database.json

Script sẽ dừng nếu bảng users đã có dữ liệu. Flag --force chỉ dùng khi đã có backup và chủ động chấp nhận INSERT OR REPLACE. Kiểm tra số lượng users, packages, deposits, orders, linked accounts, tickets và giftcodes trước/sau khi import. Mật khẩu liên kết được giữ nguyên ciphertext AES-GCM; phải giữ khóa cũ và kiểm tra giải mã trên staging.

Nếu Render không có Persistent Disk hoặc database.json rỗng, cần tìm bản sao lưu thực tế trước khi chuyển đổi. R2 chỉ nhận file ứng dụng, không tự động nhập dữ liệu từ Render.

Ảnh/tệp trong thư mục qr cũ cần upload riêng lên R2 và cập nhật key tương ứng; script JSON không thể tự lấy những file nhị phân không nằm trong database.json.

## 8. Backup và tự giám sát

Self-healing có Cron:
- */5 * * * *: kiểm tra HEALTH_URLS.
- 0 2 * * * UTC: gọi backend internal backup và lưu JSON snapshot vào R2 backups/.

Cron chạy theo UTC. Kiểm tra Workers → hendy-self-healing → Triggers → Cron Triggers và Observability. Cấu hình vòng đời R2 để xóa backup quá hạn sau khi đã xác minh chính sách lưu trữ. Đây là logical backup ở cấp bảng, không thay thế export định kỳ/kiểm tra restore.

## 9. GitHub Actions CI/CD

Repository Settings → Secrets and variables → Actions, tạo:
- CLOUDFLARE_API_TOKEN: token có đúng quyền Workers Scripts:Edit, Pages:Edit, D1:Edit và quyền cần cho deployment.
- CLOUDFLARE_ACCOUNT_ID.

Workflow CI chạy typecheck, test và build hai Pages. Workflow deploy Workers/Pages chỉ tự động từ main sau khi merge. Nhánh cloudflare-platform-v1 là nhánh chuyển đổi; chưa tự động deploy production.

## 10. Kiểm thử trước khi chuyển production

- /healthz của backend trả success và database=true.
- Telegram getWebhookInfo cho thấy webhook URL đúng, không còn polling process cũ.
- /api/v1/me từ Telegram Mini App trả thông tin người đăng nhập; request giả mạo bị 401.
- tài khoản không nằm trong TELEGRAM_ADMIN_IDS bị 403 với admin APIs.
- tạo đơn/nạp/ticket và thao tác duyệt chạy chính xác.
- secrets tài khoản liên kết được mã hóa, giải mã được với khóa cũ.
- tải file lên/download R2 yêu cầu auth; không có public-write.
- backup xuất hiện trong R2 và thử restore vào database staging.
- kiểm tra số lượng dữ liệu và đối soát số dư trước/sau.
- chỉ sau khi tất cả đạt mới chuyển domain, ngừng Render, rồi mới xóa tài nguyên/secret cũ.

## Tình trạng triển khai

Nhánh Cloudflare chứa nền tảng kiến trúc và các luồng lõi ban đầu. Cần thay D1 database_id và các domain placeholder bằng thông tin Cloudflare thực tế, cấu hình secrets, chạy migrations, import dữ liệu và kiểm thử end-to-end. Không xem deploy xanh là bằng chứng dữ liệu đã di trú hoặc toàn bộ nghiệp vụ cũ đã được thay thế.


## 11. Quy tắc phát triển và phát hành

- Mỗi Worker có thư mục, config và quy trình deploy riêng; không import mã Node.js-only (Express, Telegraf polling, fs) vào Worker.
- Mọi route backend phải đặt dưới \`/api/v1\`, xác thực server-side, validate đầu vào và giới hạn tốc độ.
- Không dùng \`initDataUnsafe\` làm bằng chứng đăng nhập. Gửi nguyên \`Telegram.WebApp.initData\` lên backend để xác minh chữ ký và thời gian.
- D1 schema thay đổi bằng migration mới; không chỉnh migration đã chạy trên production.
- R2 object keys dùng UUID, file download phải kiểm tra quyền sở hữu đơn hàng hoặc vai trò Admin.
- Pages user/admin chỉ chứa UI và API origin; không nhúng Bot Token, webhook secret, Admin ID private list hoặc encryption key vào biến \`VITE_*\`.
- Mọi thay đổi chạy \`npm run typecheck\`, \`npm test\`, \`npm run build\` trước Pull Request.
- Merge vào \`main\` chỉ sau khi đã có Cloudflare secrets trong GitHub, Pages projects và Workers bindings đúng.
