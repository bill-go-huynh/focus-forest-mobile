# Deploy sau khi xong demo flow

Làm **sau** khi đã đi hết `DEMO_FLOWS.md` trên máy local. Chỉ là checklist ngắn, chưa chọn nơi deploy.

## Server (focus-forest-api)

- [ ] Chọn nơi có **https** và **WebSocket** (Railway, Render, Fly…). Bản build thật chặn `http://`; Focus Together và cập nhật realtime cần WebSocket (không dùng serverless kiểu Vercel).
- [ ] Biến môi trường: `DATABASE_URL`, `NODE_ENV=production`, `JWT_ACCESS_SECRET` và `ADMIN_JWT_SECRET` **mới** (không dùng bản local), `GOOGLE_CLIENT_IDS`, `PUSH_PROVIDER=expo`, `CORS_ORIGINS` (thêm `http://localhost:3001` nếu chạy admin trên máy), `DEMO_TOOLS=on` **chỉ khi server này để demo**.
- [ ] DB: `npm run prisma:migrate:deploy` → `npm run content:seed`.
- [ ] Admin: `admin/admin123` chỉ tự tạo khi dev; trên server tạo bằng `npm run admin:create` với mật khẩu mạnh.

## App (focus-forest-mobile)

- [ ] `EXPO_PUBLIC_API_URL=https://…` đưa vào profile `preview` trong `eas.json` (hoặc biến môi trường EAS): `.env` không được gửi lên EAS.
- [ ] Build `preview` để có **APK** cài thẳng (`production` ra AAB, chỉ cho Play Store).
- [ ] Google sign-in: lấy SHA-1 của khoá build (`eas credentials`) → thêm vào Android OAuth client trên Google Cloud. Thiếu bước này nút Google báo lỗi.
- [ ] Thông báo: đưa khoá FCM lên Expo (`eas credentials`). Khoá không bao giờ vào repo.

## Kiểm tra nhanh sau deploy

- [ ] `https://…/health` trả về ok.
- [ ] Cài APK mới → đăng ký, đăng nhập Google, một phiên focus.
- [ ] Admin trỏ vào API thật → tab Demo tạo world → chạy lại flow 5, 8, 9, 11 của `DEMO_FLOWS.md`.
- [ ] Máy thứ hai (emulator hoặc máy mentor) không cần chung wifi nữa.
