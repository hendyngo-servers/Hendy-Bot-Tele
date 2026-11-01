# D1 migrations

- Mỗi thay đổi schema phải tạo một migration SQL mới theo thứ tự tăng dần.
- Không sửa migration đã áp dụng trên production.
- Chạy kiểm thử với database local trước khi dùng --remote.
- Dùng transaction/batch cho thao tác nhiều bảng có liên quan.
- Không lưu token, mật khẩu dạng rõ hoặc khóa mã hóa trong D1.
- Dữ liệu mật khẩu tài khoản liên kết phải nằm trong ciphertext có authenticated encryption.
