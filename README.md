# HENDY BOT TELEGRAM — Cloudflare Edition

Hệ thống Telegram Bot + Mini App thành viên + Admin Console. Mã nguồn chạy trên **Cloudflare Workers + Pages + D1 + R2 + KV**; không cần Render, VPS hay WebSocket.

## 1. Giao diện và module

Telegram Bot có menu nhiều hàng, 14 nút theo bố cục ảnh tham chiếu; trong Mini App có các nhóm chức năng:

1. Mini Game Live — quản lý mã/tên tài khoản liên kết, tạo đơn dịch vụ và theo dõi tiến trình.
2. Thuê Tool — xem gói dịch vụ, thời hạn, giá/tồn kho từ danh mục D1 và tạo đơn.
3. Mua Code — danh mục code màn/code tele, đơn hàng và lịch sử.
4. Nạp tiền / Ví điện tử — tạo yêu cầu chuyển khoản có tham chiếu/QR, xem lịch sử và sổ cái ví.
5. OTP & Proxy — xem danh mục và tạo yêu cầu cung cấp dịch vụ.
6. Kho VIP — xem gói công cụ VIP và gửi đơn dịch vụ.
7. Trung tâm khách hàng — hồ sơ, tạo ticket, xem lịch sử và trao đổi với CSKH.
8. Hệ thống ghép đôi — tạo yêu cầu ghép đôi và theo dõi trong hàng đợi đơn.
9. Giới thiệu REF — mã mời, liên kết Telegram, người được mời và trạng thái hoa hồng.
10. Trung tâm VIP — cấp bậc, ngưỡng điểm và tiến trình tích điểm.
11. Nhóm chat, Kênh thông báo, Giftcode và Liên hệ CSKH — mở liên kết cấu hình, đổi voucher và tra cứu hỗ trợ.

Admin Console có các khu vực: Tổng quan, Hàng đợi đơn hàng, Duyệt nạp tiền, Danh mục dịch vụ, Giftcode, Trung tâm hỗ trợ, Hoa hồng REF, Phát hành ứng dụng và Telegram webhook.

## 2. Luồng nghiệp vụ

### Đơn hàng và danh mục

- Danh mục lấy trực tiếp từ D1. Admin có thể tạo, chỉnh sửa tên/mô tả/giá/thời hạn/tồn kho, bật hoặc ngừng bán.
- Giá của catalog do Worker đọc từ D1; API không tin giá gửi từ trình duyệt.
- Sản phẩm có tồn kho hữu hạn được giữ kho nguyên tử khi đơn được tạo; nếu đơn bị hủy, số lượng giữ được trả lại.
- Với dịch vụ chưa có giá, Admin tạo báo giá; thành viên chấp nhận hoặc từ chối.
- Đơn cần thanh toán phải được xác nhận, chấp nhận báo giá (nếu có) và thanh toán từ số dư ví trước khi Admin chuyển sang `processing`.
- Thanh toán ví có `Idempotency-Key`, kiểm tra số dư, trừ tiền và ghi `wallet_ledger`/giao dịch.
- Khi hủy đơn đã thanh toán, tiền được hoàn lại vào ví và ghi ledger; thao tác có khóa chống hoàn tiền lặp.
- Mọi chuyển trạng thái đơn có nhật ký D1, kiểm tra trạng thái hiện tại và chống ghi đè đồng thời.

### Ví và nạp tiền

- Người dùng tạo yêu cầu nạp, nhận mã tham chiếu và QR khi đã cấu hình thông tin ngân hàng.
- Admin chỉ được duyệt sau khi tự xác minh tiền thực sự vào tài khoản ngân hàng. Duyệt ghi tăng số dư và ledger trong một D1 batch; một yêu cầu không thể được cộng tiền hai lần.
- Đây là **nạp chuyển khoản thủ công**. Hệ thống hiện không có bank webhook/đối soát tự động và không có tính năng rút tiền.

### Giftcode

- Admin tạo mã với điểm voucher, giới hạn lượt đổi và ngày hết hạn.
- Mã gốc chỉ hiển thị một lần trong phản hồi tạo mã; D1 chỉ lưu hash.
- Admin có thể thu hồi hoặc kích hoạt lại mã. Thành viên đổi mỗi mã tối đa một lần; voucher được cộng vào ví voucher, không phải số dư tiền mặt.

### REF và VIP

- Mã REF tạo liên kết Telegram dạng `https://t.me/<BOT_USERNAME>?start=ref_CODE`. Bot ghi nhận người giới thiệu khi thành viên lần đầu mở bot bằng liên kết đó.
- Hoa hồng chỉ phát sinh sau khi đơn của người được mời đã **thanh toán và hoàn tất**; trạng thái đầu tiên là `pending`.
- Admin duyệt, sau đó chi trả vào ví người giới thiệu; người thao tác và ghi chú đối soát được lưu.
- VIP points chỉ được cộng khi đơn đã thanh toán và chuyển sang `completed`; tier tự cập nhật theo ngưỡng điểm trong D1.
- Hai chính sách tỷ lệ `REFERRAL_COMMISSION_BPS` và `VIP_POINTS_PER_10000_VND` mặc định bằng `0` (tắt). Chủ hệ thống phải đặt mức chính thức trước khi áp dụng; không có tỷ lệ kinh doanh tự đặt trong mã nguồn.

### Những tích hợp còn phụ thuộc bên ngoài

Các module Mini Game Live, OTP & Proxy và Ghép đôi hiện có tài khoản metadata/đơn hàng/hàng đợi Admin. Chúng **chưa tự đăng nhập vào website bên thứ ba, tự cấp OTP/proxy, điều khiển game hoặc tự ghép đôi**. Muốn tự động thực hiện phải cung cấp API/OAuth chính thức của nhà cung cấp, quy tắc, credential và điều khoản sử dụng. Không nhập mật khẩu, OTP, cookie hoặc mã khôi phục tài khoản bên thứ ba vào bot.

Thuê Tool/Mua Code/VIP chỉ hiển thị sản phẩm sau khi Admin cấu hình catalog thật. Nhóm chat, kênh thông báo và CSKH cần điền URL thật; khi chưa cấu hình, nút sẽ báo chưa khả dụng thay vì dẫn sang URL giả.

## 3. Kiến trúc

- `backend`: một Cloudflare Worker phục vụ REST API và Telegram webhook.
- `apps/web-user`: Telegram Mini App thành viên (React/Vite).
- `apps/web-admin`: trang quản trị độc lập (React/Vite).
- `packages/db-schema/migrations`: D1 schema migrations.
- D1 lưu người dùng, đơn hàng, sự kiện, danh mục, ví, ledger, ticket, Giftcode, REF và VIP.
- R2 lưu tệp phát hành.
- KV hỗ trợ rate limit best-effort.

Bot nhận update bằng webhook; không có WebSocket, long-polling server hoặc worker process riêng. Mini App chỉ xác thực bằng Telegram `initData` đã ký; `initDataUnsafe` không được dùng làm căn cứ cấp quyền.

## 4. Cấu hình Cloudflare

### Tạo tài nguyên lần đầu

Yêu cầu Node.js 20+, pnpm 9 và Wrangler.

```bash
pnpm install
pnpm exec wrangler login
pnpm exec wrangler d1 create hendy_bot_db
pnpm exec wrangler r2 bucket create hendy-bot-assets
pnpm exec wrangler kv namespace create RATE_LIMITER
pnpm exec wrangler pages project create hendy-web-user --production-branch main
pnpm exec wrangler pages project create hendy-web-admin --production-branch main
```

Sao chép D1 database ID và KV namespace ID vào `backend/wrangler.toml`; thay các giá trị `REPLACE_WITH_...`. Kiểm tra tên Pages project và domain `.pages.dev` theo tài khoản Cloudflare của bạn.

### Worker variables

Cấu hình trong `backend/wrangler.toml` hoặc Cloudflare Dashboard:

| Biến | Ý nghĩa |
|---|---|
| `WEBAPP_URL` | URL Pages của thành viên |
| `ADMIN_WEBAPP_URL` | URL Pages Admin |
| `BOT_USERNAME` | Username Bot, không có @, dùng cho link REF |
| `ADMIN_IDS` | Telegram numeric ID của Admin, phân cách dấu phẩy |
| `GROUP_CHAT_URL`, `NEWS_CHANNEL_URL` | URL HTTPS Nhóm chat/Kênh thông báo |
| `SUPPORT_URL` hoặc `SUPPORT_USERNAME` | URL hoặc username Telegram của CSKH |
| `BANK_NAME`, `BANK_BIN`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME` | Tài khoản nhận chuyển khoản |
| `REFERRAL_COMMISSION_BPS` | Hoa hồng theo basis points; ví dụ 500 = 5%; mặc định 0 |
| `VIP_POINTS_PER_10000_VND` | Số điểm VIP cho mỗi 10.000 VND đơn đã thanh toán + hoàn tất; mặc định 0 |
| `ALLOWED_ORIGINS` | Danh sách origin Pages được Worker cho phép gọi API |

Không đặt một mức hoa hồng/điểm VIP tùy ý. Chỉ bật sau khi chủ hệ thống phê duyệt chính sách.

### Worker secrets

```bash
pnpm exec wrangler secret put BOT_TOKEN --config backend/wrangler.toml
pnpm exec wrangler secret put WEBHOOK_SECRET_TOKEN --config backend/wrangler.toml
pnpm exec wrangler secret put WEBHOOK_SETUP_KEY --config backend/wrangler.toml
pnpm exec wrangler secret put ADMIN_API_TOKEN --config backend/wrangler.toml
```

- `BOT_TOKEN`: token Telegram Bot.
- `WEBHOOK_SECRET_TOKEN`: secret Telegram gửi trong header webhook.
- `WEBHOOK_SETUP_KEY`: secret dùng đăng ký webhook.
- `ADMIN_API_TOKEN`: bearer token riêng cho Admin Console.
- `ADMIN_IDS`: whitelist Telegram ID để nhận nút Admin/`/admin`.

Không commit token/secret trong repository, không gửi chúng vào issue/chat.

### GitHub Actions

Repository secrets:
- `CLOUDFLARE_API_TOKEN`: quyền Workers Scripts, D1, R2 và Pages phù hợp.
- `CLOUDFLARE_ACCOUNT_ID`.

Repository variable:
- `VITE_API_BASE_URL`: URL HTTPS Worker API, không có dấu slash cuối.

Tạo D1, R2, KV và hai Pages project trước khi bật deploy tự động. Workflow sẽ chạy tests/build; nếu thiếu secret hoặc ID thật, deploy sẽ bị bỏ qua chứ không giả lập thành công.

### Áp dụng migration và đăng ký webhook

```bash
pnpm exec wrangler d1 migrations apply DB --remote --config backend/wrangler.toml
pnpm exec wrangler deploy --config backend/wrangler.toml
```

Sau khi đã có Worker URL và secrets, mở Admin Console, vào Telegram webhook và nhập `WEBHOOK_SETUP_KEY` để đăng ký webhook. Kiểm tra `GET /healthz`, sau đó nhắn `/start` cho bot.

## 5. Chạy local và kiểm tra

```bash
pnpm install
pnpm db:migrate:local
pnpm --filter backend dev
```

Frontend trên terminal khác:

```bash
pnpm --filter web-user dev
pnpm --filter web-admin dev
```

Kiểm thử:

```bash
pnpm test
pnpm build
```

## 6. API nghiệp vụ chính

Tất cả API thành viên yêu cầu header `Authorization: tma <Telegram initData>`:

- `GET /api/v1/home`, `GET /api/v1/me`, `GET /api/v1/public-config`.
- `GET /api/v1/catalog?module=...`.
- `GET /api/v1/orders`, `GET /api/v1/orders/:id`, `POST /api/v1/orders`.
- `POST /api/v1/orders/:id/quotes/:quoteId/respond`.
- `POST /api/v1/orders/:id/pay`.
- `GET /api/v1/wallet`, `POST /api/v1/deposits`.
- `GET /api/v1/vip`, `GET/POST /api/v1/referral`, `POST /api/v1/referral/claim`.
- `POST /api/v1/giftcodes/redeem`.
- `GET/POST /api/v1/support/tickets`, `GET /api/v1/support/tickets/:id`, `POST /api/v1/support/tickets/:id/messages`.
- `GET/POST/DELETE /api/v1/links...`.

Admin API yêu cầu `Authorization: Bearer ADMIN_API_TOKEN` hoặc Telegram initData thuộc `ADMIN_IDS`:

- `GET /api/v1/admin/stats`, `GET /api/v1/admin/orders`, `GET /api/v1/admin/orders/:id`.
- `POST /api/v1/admin/orders/:id/quote`, `POST /api/v1/admin/orders/:id/status`.
- `GET /api/v1/admin/deposits`, `POST /api/v1/admin/deposits/:id/review`.
- `GET/POST /api/v1/admin/catalog`, `PUT /api/v1/admin/catalog/:id`, `POST /api/v1/admin/catalog/:id/activate|deactivate`.
- `GET/POST /api/v1/admin/giftcodes`, `POST /api/v1/admin/giftcodes/:id/activate|deactivate`.
- `GET /api/v1/admin/support/tickets`, detail/messages/status routes.
- `GET /api/v1/admin/referrals/commissions`, `POST /api/v1/admin/referrals/commissions/:id/settle`.
- `POST /api/v1/admin/releases`, `POST /api/v1/admin/webhook/setup`.

Giao dịch tạo đơn/nạp/đổi mã/thanh toán phải có `Idempotency-Key`. Số dư chỉ thay đổi qua các luồng ledger ở Worker.

## 7. Bảo mật và giới hạn vận hành

- Telegram webhook kiểm tra `X-Telegram-Bot-Api-Secret-Token`; Admin APIs xác minh quyền phía Worker, không dựa vào nút ẩn/hiện trên frontend.
- Mật khẩu/OTP/cookie bên thứ ba không được thu thập hoặc lưu. Liên kết Mini Game Live hiện chỉ lưu metadata mã/tên tài khoản.
- Nạp ngân hàng là thủ công; Admin phải kiểm chứng giao dịch trước khi duyệt. Không có bank webhook tự động hoặc rút tiền.
- OTP/Proxy, cấp tài khoản Mini Game Live và ghép đôi tự động cần tích hợp nhà cung cấp/API và chính sách nghiệp vụ chưa được cung cấp.
- Khi sử dụng D1 và Worker, dữ liệu giao dịch ở D1; thường xuyên backup DB. R2 là nơi lưu file phát hành. KV rate limit là best-effort do không có phép tăng nguyên tử.

## 8. Trạng thái triển khai

CI có thể xác nhận dependency install, unit tests, schema migrations và build hai giao diện. **Điều đó không tự chứng minh Worker/Pages đã được deploy hoặc Bot đang chạy.** Deployment chỉ hoàn tất sau khi Cloudflare Account ID/API Token, D1 ID, KV ID, URL Worker và Pages project đã được cấu hình, migrations được apply và webhook Telegram được đăng ký.

