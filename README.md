# Bài thực hành API Gateway

Project Node.js 22+ (khuyến nghị Node 24), không cần cài thư viện npm. Gồm 2 service độc lập, 1 API Gateway và MinIO. Dữ liệu user/order mẫu lưu trong bộ nhớ để tập trung vào yêu cầu đề bài.

## Chạy nhanh trên máy

```powershell
cd D:\KI1NAM3\api-gateway-lab
npm start
```

Mở http://localhost:8088, chọn user và đăng nhập bằng `demo123`. Chạy kiểu này dùng được routing, JWT, dashboard và rate limit; upload thực tế cần MinIO chạy bằng Docker hoặc cài riêng.

## Chạy đầy đủ với Docker Desktop

Cài Docker Desktop và bật Linux containers, sau đó:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

Không chạy `npm start` đồng thời vì trùng cổng. Mở giao diện http://localhost:8088 và MinIO Console http://localhost:9001. Tài khoản MinIO mặc định `minioadmin` / `minioadmin123`. Init container tự tạo bucket `avatars` private. Dừng bằng `docker compose down`; dữ liệu MinIO nằm trong volume và vẫn được giữ lại.

## Kiến trúc và đối chiếu đề bài

```text
Browser/client -> Gateway :8088 -> User Service :3001
                               -> Order Service :3002
Browser/client -----------------> MinIO :9000 (PUT qua URL ký sẵn)
```

| Yêu cầu | Cách thực hiện |
|---|---|
| Routing /users, /orders | Gateway chuyển GET cùng path/query tới đúng service, trả status và JSON |
| JWT tại gateway | HS256, kiểm tra chữ ký constant-time, thuật toán, issuer, audience và hạn dùng; thiếu/sai token trả 401 |
| 10 request/giây | Sliding window 1 giây, tối đa 10 request mỗi IP; vượt trả 429 + Retry-After |
| /dashboard | Gọi song song 2 service, ghép user đang đăng nhập, đơn hàng và tổng tiền |
| Valet Key | POST /users/me/avatar-upload-url trả AWS SigV4 PUT URL cho MinIO, X-Amz-Expires=300 |
| Đo độ trễ | Script cùng endpoint /users, warm-up, p50/p95/mean và chênh lệch gateway |

Gateway viết bằng Node.js; nginx chỉ là ví dụ trong đề, không bắt buộc. Health và trang giao diện không tính vào rate limit; login và mọi API còn lại đều tính. Bộ đếm theo địa chỉ TCP thực tế, không tin X-Forwarded-For từ client. Một gateway có bộ đếm riêng trong RAM; nếu triển khai nhiều replica cần bộ đếm dùng chung như Redis. Docker NAT có thể khiến nhiều client dùng chung IP quan sát được.

## Endpoint

| Method | Path | JWT | Ý nghĩa |
|---|---|---|---|
| POST | /auth/login | Không | Body: userId (1 hoặc 2), password (demo123) |
| GET | /users; /users/1 | Có | Danh sách / chi tiết user |
| GET | /orders; /orders/101; /orders?userId=1 | Có | Danh sách / chi tiết / lọc đơn hàng |
| GET | /dashboard | Có | Dữ liệu user từ sub của JWT, không nhận userId tùy ý |
| POST | /users/me/avatar-upload-url | Có | Body: contentType = image/png, image/jpeg hoặc image/webp |
| GET | /health | Không | Health của từng process |

JWT demo hết hạn sau 1 giờ. /users và /orders cho phép mọi user đã đăng nhập đọc dữ liệu mẫu; chỉ dashboard và namespace ảnh gắn với chủ token. Login là cơ chế demo, chưa có password hash, database hoặc refresh token.

## Kiểm thử

```powershell
npm test
```

Test tự khởi động các server trên cổng ngẫu nhiên: thiếu JWT, sai mật khẩu, token bị sửa/hết hạn, routing, aggregation, URL ký sẵn 300 giây, rate limit 10/15 và hồi phục cửa sổ, JSON lỗi, loại ảnh không hợp lệ, upstream ngừng hoạt động trả 502.

Upload end-to-end sau khi Docker chạy: đăng nhập trên giao diện, chọn ảnh PNG/JPEG/WebP rồi Upload. Vào Console, bucket avatars, kiểm tra object trong thư mục user ID. DevTools Network sẽ thấy POST cấp URL rồi PUT trực tiếp :9000. Để kiểm chứng hết hạn, lấy một URL mới, chờ hơn 300 giây rồi PUT bằng URL đó; MinIO phải trả 403. URL có thể tái sử dụng trong thời gian còn hiệu lực, không phải key dùng một lần. Không đưa URL ký sẵn vào log công khai.

Content type trên gateway kiểm tra loại ảnh yêu cầu; URL ký chỉ ràng buộc host, key, method, thời gian, không xác thực byte ảnh hay giới hạn kích thước. Muốn dùng thực tế cần kiểm tra object sau upload và lưu objectKey vào hồ sơ. Bài này minh họa upload object, chưa cập nhật ảnh profile lâu dài.

## Đo độ trễ

Khởi động hệ thống, để các client khác nghỉ rồi chạy:

```powershell
npm run benchmark -- 50
```

Kết quả in ra console và ghi `benchmark-results.json`: mean, p50, p95 của direct và gateway, meanOverheadMs = gateway.mean - direct.mean. Script gửi tuần tự, xen kẽ thứ tự, warm-up 5 lần và nghỉ 150 ms mỗi cặp để giữ JWT/rate limit hoạt động. Kết quả loopback có nhiễu và có thể có chênh lệch âm; cần lặp thí nghiệm với nhiều mẫu để đánh giá. Khi chạy Docker, cổng service được publish localhost chỉ phục vụ so sánh; khi triển khai thật bỏ publish 3001/3002 để tránh bỏ qua gateway.

## Cấu hình và xử lý lỗi

`.env` được Docker Compose đọc; `npm start` dùng biến môi trường PowerShell (ví dụ `$env:JWT_SECRET='...'`). Có thể dùng `node --env-file=.env src/start.js` để đọc file với Node. Gateway timeout upstream sau 3 giây. MinIO dùng region us-east-1. MINIO_PUBLIC_URL phải là địa chỉ trình duyệt truy cập được; để localhost khi chạy trên máy này. Địa chỉ ký và địa chỉ PUT phải giống nhau, không thay hostname sau khi nhận URL.

Nếu 429 hãy chờ ít nhất 1 giây; 401 thì đăng nhập lại; 502 kiểm tra User/Order; upload lỗi kiểm tra Docker, hostname URL, đồng hồ máy và Console MinIO. Đây là project thực hành; hãy đổi secrets và bổ sung HTTPS, lưu trữ bền vững, phân quyền trước khi triển khai công khai.
