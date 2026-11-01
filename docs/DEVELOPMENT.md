# Hướng dẫn phát triển từng ứng dụng và Worker

Tài liệu này mô tả luồng làm việc của nhánh Cloudflare cloudflare-platform-v1. Tài nguyên production chỉ nên được tạo bằng tài khoản Cloudflare của chủ dự án.

## 1. Thiết lập máy phát triển

Yêu cầu:
- Node.js 22 LTS trở lên và npm.
- Git.
- Tài khoản Cloudflare với quyền Workers, Pages, D1 và R2.
- Telegram bot thử nghiệm riêng. Không nên dùng bot production khi phát triển.

~~~bash
git clone https://github.com/hendyngo-servers/Hendy-Bot-Tele.git
cd Hendy-Bot-Tele
git checkout cloudflare-platform-v1
npm install
npm run typecheck
npm test
npm run build
npx wrangler login
~~~

## 2. Tạo tài nguyên cho môi trường dev/staging

Không sử dụng trực tiếp database và bucket production trong local development.

~~~bash
npx wrangler d1 create hendy-staging
npx wrangler r2 bucket create hendy-staging-files
~~~

Ghi lại database_id và đặt bindings riêng cho môi trường staging trong Wrangler configuration. Chạy migration local trước:

~~~bash
npm run db:local
~~~

Khi staging đã được kiểm tra mới chạy migration --remote trỏ đúng D1 staging.

## 3. Backend API Worker

Thư mục: workers/backend-api

Trách nhiệm:
- Xác minh Telegram Mini App initData và quyền Admin.
- Nhận Telegram webhook và chống xử lý trùng update_id.
- Xử lý nghiệp vụ người dùng, nạp, đơn hàng, giftcode, giới thiệu, tài khoản liên kết, ticket.
- Đọc/ghi D1; quản lý file ở R2.
- Ghi nhật ký thao tác nhạy cảm và giới hạn tốc độ.

Phát triển:
1. Thêm route dưới workers/backend-api/src/index.ts hoặc tách sang module riêng.
2. Mỗi payload phải được giới hạn độ dài/kiểu dữ liệu và xác thực ở backend.
3. Thao tác tiền phải nằm trong DB.batch() có kiểm tra trạng thái/idempotency.
4. Không nhận userId hoặc isAdmin do client tự khai báo làm căn cứ cấp quyền.
5. Thêm unit/integration tests cho từng nghiệp vụ.

Chạy local:

~~~bash
npm run dev:api
~~~

Secrets runtime cấu hình bằng wrangler secret put; không lưu trong source. API_PUBLIC_URL là origin công khai (ví dụ https://api.example.com), đặt trong vars của wrangler.jsonc, không phải secret.

## 4. Edge Router Worker

Thư mục: workers/edge-router

Trách nhiệm:
- Gửi /api/*, /telegram/*, /internal/*, /healthz tới hendy-backend-api qua Service Binding.
- Sử dụng hostname admin.* để chọn Pages Admin; hostname còn lại mặc định sang Pages User.
- Không phân quyền dựa vào User-Agent.
- Không chuyển tiếp cookie không cần thiết.

Phát triển:
1. Thêm quy tắc route rõ ràng theo host/path.
2. Không cho phép client chọn origin proxy.
3. Kiểm tra HTTPS origin trước khi proxy.
4. Dùng Service Binding cho backend nội bộ, không gọi public API qua Internet khi không cần thiết.

Chạy local:

~~~bash
npm run dev:router
~~~

## 5. Self-healing Worker

Thư mục: workers/self-healing

Trách nhiệm:
- Cron 5 phút gọi health endpoints.
- Cron hằng ngày lưu snapshot D1 sang R2.
- Gửi cảnh báo khi health/backup lỗi.

Worker này không được phép tự sửa mã nguồn, thay secret, đổi D1 schema hoặc tự deploy. Hãy mở Pull Request và chạy CI để thay đổi mã nguồn.

Chạy local:

~~~bash
npm run dev:healing
~~~

Lịch Cron của Cloudflare sử dụng UTC; 0 2 * * * là 02:00 UTC.

## 6. Pages User

Thư mục: apps/web-user

Trách nhiệm:
- Giao diện thành viên tiếng Việt.
- Hồ sơ/số dư/VIP, catalog, đơn hàng, nạp tiền, tài khoản liên kết, giftcode, giới thiệu và hỗ trợ.
- Gửi Telegram.WebApp.initData lên backend ở mỗi API request.
- Không lưu token/khóa bí mật trong bundle.

Chạy local:

~~~bash
npm run dev:user
~~~

Build:

~~~bash
npm run build:user
~~~

## 7. Pages Admin

Thư mục: apps/web-admin

Trách nhiệm:
- Dashboard tổng quan.
- Duyệt/từ chối nạp tiền và đơn hàng.
- Quản lý danh mục/sản phẩm, thành viên, ticket, giftcode.
- Quản lý cài đặt thanh toán.
- Tải file lên R2, sao chép key và gắn file key cho sản phẩm.
- Mọi lệnh admin phải được kiểm tra lại ở Worker API.

Chạy local:

~~~bash
npm run dev:admin
~~~

Build:

~~~bash
npm run build:admin
~~~

## 8. D1 và migration

Thư mục: packages/db-schema/migrations

Quy tắc:
- Mỗi thay đổi schema tạo một migration số mới.
- Không sửa/xóa migration đã áp dụng vào production.
- Thử local, test dữ liệu mẫu không nhạy cảm, rồi mới áp dụng staging/production.
- Tạo backup trước các migration có xóa/đổi cấu trúc cột.
- Dùng foreign keys, unique constraints và indexes cho nghiệp vụ cần bảo đảm.

## 9. R2

Binding: FILES

Prefix khuyến nghị:
- applications/: package APK/EXE/DMG/ZIP và ảnh QR.
- backups/: snapshot database.

Bucket không public-write. Ảnh QR có thể upload dưới prefix applications/payments/; sao chép object key vào trường qrImageKey trong Cấu hình thanh toán. Backend chỉ phát URL QR có chữ ký HMAC tồn tại 5 phút, kiểm tra content-type và không bật public bucket. Với file ứng dụng, chỉ người dùng có đơn approved liên kết tới file key mới được phép tải. Đối với loại file mới, phải cập nhật allowlist content type và kiểm soát size ở Worker.

## 10. Quy trình pull request và deploy

~~~bash
npm run typecheck
npm test
npm run build
~~~

Sau đó tạo nhánh feature và Pull Request:
1. CI chạy typecheck, unit tests, Pages build và security audit.
2. Reviewer xem diff và migration.
3. Merge vào main chỉ sau khi đã có Cloudflare secrets trong GitHub, Pages projects và Workers bindings đúng.
4. Workflow deploy-workers.yml triển khai ba Workers.
5. Workflow deploy-pages.yml build và triển khai hai Pages projects.

GitHub Actions repository settings cần có:
- Secret CLOUDFLARE_API_TOKEN.
- Secret CLOUDFLARE_ACCOUNT_ID.
- Variable VITE_API_BASE_URL (ví dụ https://api.example.com).

## 11. Cutover production

Không dừng Render hoặc thay bot webhook trước khi:
- D1 migration hoàn tất và số lượng bản ghi đã được đối chiếu.
- Ciphertext tài khoản liên kết giải mã được bằng đúng khóa cũ.
- R2 chứa các file cần thiết.
- Pages/Workers đã được kiểm thử với tài khoản Telegram staging.
- Backup chạy thành công và đã thử restore.
- Tất cả chức năng thiết yếu đã qua kiểm tra đầu-cuối.

Cutover:
1. Dừng tiến trình Telegram long polling trên Render.
2. Lấy snapshot JSON cuối cùng, khóa dữ liệu cũ để không có ghi mới.
3. Import snapshot cuối vào D1 và đối chiếu số dư/giao dịch.
4. Thiết lập Telegram webhook sang Cloudflare Worker.
5. Kiểm tra getWebhookInfo, /healthz, đăng nhập user/admin, tạo và duyệt giao dịch thử.
6. Chuyển DNS/custom domains tới Cloudflare.
7. Theo dõi lỗi/backup trong thời gian ổn định rồi mới tắt Render.
8. Chỉ xóa dữ liệu/secret/dịch vụ cũ sau khi bản backup độc lập đã được xác minh.


## 12. Mã hóa Libsodium và dữ liệu legacy

Ciphertext mới sử dụng Libsodium XChaCha20-Poly1305 version 2. Ciphertext AES-256-GCM version 1 từ Node.js cũ vẫn được đọc bằng APP_ENCRYPTION_KEY cũ. Importer không đổi ciphertext; không xoay khóa. Trước khi muốn chuyển toàn bộ dữ liệu v1 sang v2, phải có export backup, chạy migration offline trên bản sao, giải mã/đối chiếu và chỉ thay thế khi số lượng + kết quả xác thực đều đạt.
