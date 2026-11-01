# Hendy Bot - Telegram Hub & Admin Console (React + Vite)

Ứng dụng React hợp nhất bao gồm toàn bộ chức năng của **Hendy Bot User Center (Telegram Mini App)** và **Hendy Bot Admin Console (Bảng quản trị)**.

## Tính năng đã chuyển đổi (Features Ported)

### 1. Giao diện Thành viên (User Center)
- **Danh mục 14 dịch vụ & tiện ích:**
  - `MINI GAME LIVE`: Liên kết tài khoản sảnh game (QQ88, 78WIN, SC88, C168, CM88, F8BET).
  - `THUÊ TOOL`: Duyệt danh mục công cụ, chọn gói theo ngày, xem tồn kho và tạo đơn hàng.
  - `MUA CODE`: Mua code màn hình, code Telegram tự động.
  - `NẠP TIỀN · VÍ ĐIỆN TỬ`: Quản lý số dư VND và điểm voucher, tạo lệnh nạp tiền ngân hàng với mã QR VietQR tự động, xem lịch sử biến động số dư (sổ cái).
  - `OTP & PROXY`: Đặt hàng gói proxy và dịch vụ OTP.
  - `KHO VIP ĐẶC QUYỀN`: Đăng ký gói VIP hub không giới hạn.
  - `TRUNG TÂM KHÁCH HÀNG`: Tạo ticket hỗ trợ, xem luồng tin nhắn trao đổi với CSKH.
  - `HỆ THỐNG GHÉP ĐÔI`: Gửi yêu cầu ghép đôi theo khung thời gian.
  - `GIỚI THIỆU REF`: Mã mời thành viên, theo dõi hoa hồng giới thiệu và người bảo trợ.
  - `TRUNG TÂM VIP`: Cấp bậc VIP (Cơ bản, Bạc, Vàng, Kim cương), điểm thưởng và quyền lợi.
  - `NHẬP GIFTCODE`: Đổi mã giftcode nhận điểm voucher.
  - `KÊNH & CỘNG ĐỒNG`: Mở nhóm chat cộng đồng, kênh thông báo, liên hệ hỗ trợ.
- **Quy trình xử lý đơn hàng & Báo giá:**
  - Nhận báo giá từ Quản trị viên (Chấp nhận / Từ chối).
  - Thanh toán đơn hàng trực tiếp từ số dư ví nội bộ.

### 2. Bảng Quản trị (Admin Console)
- **Tổng quan (Overview):** Thống kê số lượng người dùng, tổng đơn hàng, đơn chờ duyệt, trạng thái xử lý.
- **Hàng đợi đơn hàng (Order Queue):**
  - Tìm kiếm và lọc đơn hàng theo trạng thái và nhóm dịch vụ.
  - Xem chi tiết đơn, lịch sử sự kiện xử lý (audit log).
  - Gửi báo giá VND cho khách hàng.
  - Chuyển trạng thái đơn (Xác nhận, Bắt đầu xử lý, Hoàn tất, Hủy).
- **Duyệt nạp tiền (Deposits):**
  - Danh sách yêu cầu nạp tiền ngân hàng.
  - Duyệt và tự động cộng tiền vào số dư ví của thành viên.
  - Từ chối yêu cầu kèm ghi chú lý do.
- **Danh mục dịch vụ (Catalog):**
  - Thêm, sửa giá bán, thời hạn, mô tả và tồn kho cho các sản phẩm/gói tool.
  - Bật/tắt mở bán sản phẩm tức thì.
- **Quản lý Giftcode:**
  - Tạo mã Giftcode bảo mật với số lượng điểm voucher, giới hạn lượt đổi và thời hạn.
  - Quản lý danh sách và thu hồi mã.
- **Trung tâm hỗ trợ (Support Tickets):**
  - Xem danh sách ticket theo trạng thái.
  - Đọc tin nhắn và gửi phản hồi cho khách hàng.
  - Cập nhật trạng thái ticket.
- **Hoa hồng giới thiệu (Referrals):**
  - Quản lý và đối soát hoa hồng đơn hàng.
  - Duyệt và chi trả hoa hồng trực tiếp vào ví người giới thiệu.
- **Phát hành ứng dụng (Releases):**
  - Đăng tải phiên bản ứng dụng Android, Windows, v.v. kèm ghi chú phát hành.
- **Đồng bộ Webhook Telegram.**

## Cấu trúc dự án
- `index.html`: Entry point cho ứng dụng web.
- `src/App.jsx`: Component gốc với thanh chuyển đổi giữa Giao diện Thành viên và Bảng Quản trị.
- `src/components/UserApp.jsx`: Toàn bộ giao diện và chức năng thành viên.
- `src/components/AdminApp.jsx`: Toàn bộ bảng điều khiển quản trị.
- `src/services/store.js`: Lưu trữ trạng thái và dữ liệu liên tục (persist qua localStorage).
- `src/services/api.js`: Bộ điều phối API hỗ trợ cả chế độ giả lập cục bộ và backend từ xa.
- `src/styles.css`: Hệ thống CSS nguyên bản với phong cách bàn phím hiện đại và bảng điều khiển trực quan.
