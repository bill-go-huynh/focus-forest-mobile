# Focus Forest: danh sách test thủ công

Danh sách này đi qua **toàn bộ tính năng** của app trên điện thoại thật, kể cả các ca lỗi và ca biên.

- Mỗi dòng là một case: **bước làm → kết quả mong đợi**.
- Chữ trong ngoặc kép (`"Create account"`…) là chữ thật trên màn hình, chép từ code. Nếu app hiện chữ khác thì đó là một phát hiện, ghi lại.
- **(chưa xác minh)** nghĩa là người soạn chưa xác nhận được từ code. Coi kết quả của case đó là câu hỏi cần trả lời, chưa phải yêu cầu.
- Đánh dấu `[x]` khi đạt. Khi không đạt, ghi theo mẫu ở cuối file.
- Danh sách cũ `MANUAL_QA.md` (theo phase, kèm art A1–A6) vẫn dùng được; file này chi tiết hơn và theo từng tính năng.

**Thứ tự gợi ý:** mục 1 → 2 → 3 trước, vì đó là lõi của app. Mục 4 cần 2 máy. Mục 5 có phần push và admin cần cấu hình thêm.

## 0. Chuẩn bị

### 0.1 Backend và app
- [x] **PR-1** API: trong `focus-forest-api` chạy `npm run db:up`, `npm run prisma:migrate:deploy`, rồi `npm run start:dev`. Lệnh migrate áp cả migration của Google sign-in và quên mật khẩu.
- [ ] **PR-2** Mobile: `focus-forest-mobile/.env` có `EXPO_PUBLIC_API_URL=http://<IP LAN của Mac>:3000` (không dùng `localhost`) và `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Chạy `npx expo start`; điện thoại và Mac cùng Wi-Fi.
- [ ] **PR-3** Dùng **development build mới** (EAS, có Google Sign-In và icon mới), không dùng Expo Go. Expo Go không có thông báo hệ thống.
- [ ] **PR-4** Email quên mật khẩu: chưa đặt `SMTP_URL` thì mã nằm trong log của API (dòng `[Mail] To …`). Muốn nhận email thật thì đặt `SMTP_URL` (xem `.env.example` của API).
- [ ] **PR-5** Google: Gmail dùng để test phải có trong **Test users** (Google Auth Platform → Audience), hoặc app đã Publish.
- [ ] **PR-6** Push từ server: API chạy với `PUSH_PROVIDER=expo` (đã có trong `.env`, nhớ khởi động lại API). App là bản build có Firebase (từ 2026-10-19). Khoá FCM V1 đã tải lên EAS. Làm mục **0.4** trước khi test mục 5.11–5.12 và các case push ở mục 4.

### 0.2 Tài khoản và thiết bị
- [ ] **PR-7** Tài khoản **A** trên điện thoại thật. Tài khoản **B** trên emulator hoặc máy thứ hai. Tài khoản **C** (tuỳ chọn) cho các ca từ 3 người.
- [ ] **PR-8** Mỗi tài khoản có username, ít nhất 1 topic và có time zone (đăng ký từ app là có sẵn).
- [ ] **PR-9** Admin: trong `focus-forest-api` chạy `npm run build`, rồi `ADMIN_PASSWORD=… npm run admin:create -- --email <email> --role admin`. Trong `focus-forest-admin` chạy `npm run dev`, mở `http://localhost:3001`.
- [ ] **PR-10** Giả lập thời gian, dựng lịch sử: xem phần **"Cách giả lập thời gian"** ở đầu mục 3. Tóm tắt: đổi giờ Mac (kèm giờ điện thoại), gửi session lùi ngày qua API, sửa DB dev, hoặc đổi cấu hình trong admin.

### 0.4 Kiểm tra nhanh push (làm trước các case push)

- [ ] **PU-1** Mở app, vào Settings → bật **Daily goal reminder** → **Mong đợi:** Android hỏi quyền thông báo; chọn Allow. Kiểm tra máy đã đăng ký push: trong `focus-forest-api` chạy `npm run prisma:studio`, bảng **PushDevice** (`push_devices`) có một dòng mới cho tài khoản này, token dạng `ExponentPushToken[…]`. Không có dòng nào thì xem PU-5.
- [ ] **PU-2** Bấm **Later** hoặc **Earlier** để giờ nhắc là mốc 15 phút kế tiếp (ví dụ 15:05 thì đặt 15:15). Hôm nay chưa đạt daily goal, và hôm nay không phải rest day. Khoá máy → **Mong đợi:** trong vòng 15 phút sau giờ đặt có thông báo "A little focus today?". Icon trên thanh trạng thái là cây trắng, không phải ô vuông xám.
- [ ] **PU-3** Chạm vào thông báo khi app đang đóng → **Mong đợi:** app mở và vào Home.
- [ ] **PU-4** Bắt đầu một phiên focus rồi để đến giờ nhắc của một reminder khác → **Mong đợi:** không có thông báo trong lúc focus; kết thúc phiên xong mới đến (nếu chưa quá 2 giờ).
- [ ] **PU-5** Nếu không có dòng trong **PushDevice**: kiểm tra (a) đang dùng APK mới chứ không phải Expo Go hay APK cũ, (b) đã cấp quyền thông báo, (c) điện thoại có Google Play Services. Có dòng nhưng không có thông báo: trong Prisma Studio mở bảng **NotificationOutbox** (`notification_outbox`), tìm dòng category `dailyGoalReminder` của tài khoản. `pending` là chưa tới lượt quét; `skipped` là bị bỏ, cột `reason` ghi lý do (ví dụ đã đạt goal, đang focus); `failed` là gửi lỗi, cột `reason` ghi lỗi từ Expo, ví dụ thiếu khoá FCM. Chụp dòng đó gửi em. Không có dòng nào nghĩa là chưa đến giờ, hoặc profile thiếu time zone.

### 0.5 Tab Demo (DM, spec/demo)

**Chuẩn bị:** API có `DEMO_TOOLS=on` và `PUSH_PROVIDER=expo` trong `.env`, khởi động lại API. Admin web đăng nhập bằng role admin. Điện thoại đăng nhập tài khoản demo và mở app sẵn.

- [ ] **DM-1** Admin → **Demo** → nhập mật khẩu (≥ 8 ký tự) → **Make a demo world** → **Mong đợi:** hiện "Demo world N" với 6 tài khoản: Presenter Bill, Comeback An, Recovery Vy, 3 bạn Mai/Khoa/Linh; mỗi dòng ghi email đăng nhập và "What it shows". Trước ngày 8 trong tháng: báo cần từ ngày 8.
- [ ] **DM-2** Mật khẩu ngắn hơn 8 ký tự → **Mong đợi:** "Use at least 8 characters.", không tạo gì.
- [ ] **DM-3** Đăng nhập `demoN@focusforest.test` trên máy → **Mong đợi:** mở app là lễ trồng cây của tháng trước, rồi recap; Home có cây tháng này, chuỗi **6 ngày**; Together có 3 bạn; rừng có reaction.
- [ ] **DM-4** Admin: Account = Bill, Minutes = 25 → **Add a finished session**, app đang mở ở Home → **Mong đợi:** trong vài giây, máy tự hiện hiệu ứng: cây thành **Mature Tree**, badge **50 Hours** (kèm Maple, Stone Lantern), chuỗi **7 ngày** (badge, Pine), không cần chạm gì. Admin hiện "Added 25 minutes for Bill. The phone shows it now."
- [ ] **DM-5** Bấm Add a finished session lần nữa ngay sau → **Mong đợi:** admin báo phải chờ thêm bao nhiêu phút (phiên không được chồng nhau).
- [ ] **DM-6** Mở sự kiện "Demo Grove N" trên máy sau DM-4 → **Mong đợi:** Community Tree đã vượt mốc đầu, có màn chúc mừng.
- [ ] **DM-7** **Make today a rest day** cho Bill → **Mong đợi:** Home trên máy tự đổi sang "Rest day today · …".
- [ ] **DM-8** Friend = Linh → **Friend reacts to the forest** → **Mong đợi:** mục Reactions trong Together cập nhật ngay.
- [ ] **DM-9** **Send now** lần lượt 10 loại thông báo → **Mong đợi:** mỗi loại có push trên máy trong vài giây; admin hiện "Sent: “…”". Loại không gửi được thì admin ghi lý do (ví dụ "No phone is registered…" nếu máy chưa đăng ký push, hoặc nhắc mục tiêu khi mục tiêu hôm nay đã đạt).
- [ ] **DM-10** Trên máy: Together → tạo phòng → admin bấm **Khoa joins my room and is ready** → **Mong đợi:** Khoa hiện trong phòng với trạng thái Ready ngay; bấm I'm ready trên máy là đếm ngược bắt đầu. Chưa tạo phòng mà bấm: admin báo "Open a room in Focus Together on the phone first."
- [ ] **DM-11** Đăng nhập tài khoản Comeback (An) → **Mong đợi:** cây "Resting quietly"; admin Add a finished session cho An → máy chuyển "Waking up".
- [ ] **DM-12** Đăng nhập tài khoản Recovery (Vy) → admin Add a finished session cho Vy → **Mong đợi:** Profile → Goals and rest days hiện "Want to keep your 4-day streak?" với nút Keep my streak.
- [ ] **DM-13** Đăng nhập một tài khoản thường (không phải demo) → **Mong đợi:** thao tác admin trên tài khoản demo không ảnh hưởng gì; máy không kết nối kênh demo.
- [ ] **DM-14** Tắt `DEMO_TOOLS` (đặt `off`, khởi động lại API) → **Mong đợi:** trang Demo ghi "Demo tools are off…", không có nút nào.

### 0.3 Mẹo
- Chế độ máy bay = offline.
- Bật TalkBack rồi chạm vào cây để nghe trạng thái của cây (stage, canopy, blossom, vitality).
- Xoá dữ liệu app (Android Settings → Apps → Focus Forest → Storage → Clear data) để về trạng thái máy mới.
- Rate limit có thể hạ tạm thời trong admin → Configuration để thử nhanh, xong nhớ trả lại.


## 1. Vào app, đăng ký, đăng nhập, quên mật khẩu

**Chuẩn bị:** muốn thấy lại màn giới thiệu thì xoá dữ liệu app (Settings Android → Apps → Focus Forest → Storage → Clear data) hoặc cài lại. Rate limit chung cho đăng nhập: **10 lần / 15 phút** mỗi địa chỉ IP và mỗi email. Đăng nhập bằng mật khẩu, Google, gửi mã và xác nhận mã quên mật khẩu **đều tính vào cùng quota này**. Đăng ký: **10 tài khoản / giờ** mỗi IP.

### 1.1 Khởi động và khôi phục phiên

- [ ] **AU-1** Máy mới, mở app → **Mong đợi:** chỉ một màn nền trơn trong chốc lát (không nháy màn đăng ký hay Home), rồi đến màn giới thiệu "Focus grows a tree".
- [ ] **AU-2** Đã đăng nhập, kill app rồi mở lại → **Mong đợi:** vào thẳng Home, không qua màn đăng nhập.
- [ ] **AU-3** Đã đăng nhập, để app quá 15 phút (access token hết hạn) rồi mở lại → **Mong đợi:** vẫn vào Home bình thường, server log có `POST /auth/refresh`.
- [ ] **AU-4** Đã đăng nhập, tắt mạng, kill rồi mở app → **Mong đợi:** **vẫn đăng nhập**, Home hiện dữ liệu đã cache, không bị đá ra.
- [ ] **AU-5** Đã đăng nhập, xoá refresh token phía server (hoặc chờ quá 30 ngày), mở app có mạng → **Mong đợi:** về màn **sign in** "Welcome back", không kẹt ở màn nền.
- [ ] **AU-6** Đang đăng nhập, mở deep link `focusforest:///sign-in` → **Mong đợi:** không vào được màn đăng nhập, vẫn ở Home.
- [ ] **AU-7** Chưa đăng nhập, mở deep link `focusforest:///forest` → **Mong đợi:** không vào được tab Forest, thấy màn giới thiệu hoặc sign in.
- [ ] **AU-8** Dark mode: đã chọn theme Dark trong app, kill rồi mở lại → **Mong đợi:** không có chớp nền sáng lúc khởi động.

### 1.2 Màn giới thiệu (Welcome)

- [ ] **AU-10** Trang 1 → **Mong đợi:** tiêu đề "Focus grows a tree", hạt giống tự lớn dần (seed → sprout → young → growing), mỗi bước khoảng 1,8 giây, cây chuyển giai đoạn bằng hiệu ứng mờ dần; chữ trồi lên sau hình.
- [ ] **AU-11** Bấm **Next** 3 lần → **Mong đợi:** lần lượt "One month, one tree" (cây nở hoa, nắng chiều), "A forest of your months" (3 cây: sồi, sakura, thông), "Rest is part of growing" (cây ban đêm). Trang cuối, nút đổi thành **Get started** và **Skip** biến mất.
- [ ] **AU-12** Vuốt chậm nửa trang rồi thả → **Mong đợi:** hình chạy chậm hơn chữ (parallax), hình thu nhỏ và mờ dần, màu nền và chấm trang chuyển dần theo ngón tay; thả tay thì bật về trang gần nhất, không kẹt giữa.
- [ ] **AU-13** Vuốt nhanh liên tục qua lại → **Mong đợi:** không giật, không lag, chấm trang khớp với trang đang xem.
- [ ] **AU-14** Bấm **Skip** ở trang 1 → **Mong đợi:** cuộn tới trang 4, có nút Get started.
- [ ] **AU-15** Bấm **Get started** → **Mong đợi:** màn "Create your account". Bấm Back của Android → **Mong đợi:** quay lại màn giới thiệu.
- [ ] **AU-16** Ở trang bất kỳ bấm **I already have an account** → **Mong đợi:** màn "Welcome back".
- [ ] **AU-17** Bật Remove animations (Settings Android → Accessibility) → **Mong đợi:** chuyển trang chỉ còn mờ dần, cây trang 1 hiện luôn dạng đã lớn, hình không trôi lên xuống.
- [ ] **AU-18** TalkBack bật → **Mong đợi:** chỉ đọc chữ của trang đang xem, không đọc hình cây; chấm trang đọc "Page 1 of 4".
- [ ] **AU-19** Cỡ chữ hệ thống lớn nhất → **Mong đợi:** hình cây nhỏ lại, chữ và các nút vẫn thấy hết (cuộn được), không bị cắt.
- [ ] **AU-20** Xem giới thiệu rồi kill app, **chưa** tạo tài khoản → **Mong đợi:** mở lại vẫn thấy màn giới thiệu.
- [ ] **AU-21** Đăng nhập thành công một lần, rồi đăng xuất → **Mong đợi:** từ giờ mở app chưa đăng nhập vào thẳng "Welcome back", **không** hiện giới thiệu nữa. Bấm "Create an account" → màn đăng ký.
- [ ] **AU-22** Xoá tài khoản (mục 1.7) → **Mong đợi:** vẫn không hiện lại giới thiệu (cờ lưu theo máy, không theo người dùng).

### 1.3 Đăng ký bằng email

- [ ] **AU-30** Nhập email hợp lệ, mật khẩu ≥ 8 ký tự, tên → **Create account** → **Mong đợi:** nút hiện "Creating your account…", sau đó vào onboarding "Your seed is planted" (không vào Home ngay). Server có `POST /auth/sign-up` rồi `PATCH /me/profile` (tên + múi giờ).
- [ ] **AU-31** Bấm Create account khi để trống cả 3 ô → **Mong đợi:** không gửi gì lên server; báo "Enter your email address.", lỗi mật khẩu "Use at least 8 characters for your password.", lỗi tên "Add the name you would like to be called.".
- [ ] **AU-32** Email sai định dạng (`abc`, `abc@`, `a b@c.com`) → **Mong đợi:** "Enter a valid email address.", không gửi request.
- [ ] **AU-33** Email có khoảng trắng đầu cuối và chữ hoa (`  Mai@Example.COM `) → **Mong đợi:** đăng ký được, tài khoản lưu là `mai@example.com`.
- [ ] **AU-34** Mật khẩu 7 ký tự → **Mong đợi:** "Use at least 8 characters for your password.". Đúng 8 ký tự → hợp lệ. 129 ký tự → "Use at most 128 characters for your password.".
- [ ] **AU-35** Mật khẩu có khoảng trắng đầu cuối → **Mong đợi:** giữ nguyên như gõ (không tự cắt). Đăng nhập phải gõ y hệt, kể cả khoảng trắng.
- [ ] **AU-36** Tên: 50 ký tự → hợp lệ; 51 ký tự → không gõ thêm được (ô giới hạn 50); chỉ khoảng trắng → "Add the name you would like to be called.".
- [ ] **AU-37** Gõ sai rồi sửa lại cho đúng → **Mong đợi:** không báo lỗi trong lúc gõ lần đầu; sau khi bấm nút, lỗi tự mất ngay khi sửa đúng.
- [ ] **AU-38** Email đã có tài khoản (thử chữ hoa khác) → **Mong đợi:** lỗi nằm dưới ô Email: "An account with this email already exists.", không tạo tài khoản thứ hai.
- [ ] **AU-39** Bấm Create account 2–3 lần thật nhanh → **Mong đợi:** chỉ tạo **một** tài khoản.
- [ ] **AU-40** Tắt mạng rồi đăng ký → **Mong đợi:** "We couldn't reach Focus Forest. Check your connection and try again.".
- [ ] **AU-41** Tạo tài khoản xong nhưng bước lưu tên lỗi (tắt API ngay sau sign-up, hoặc tắt mạng đúng lúc) → **Mong đợi:** "Your account is ready, but we couldn't save your name yet…", nút đổi thành **Try again**, các ô bị khoá. Bật lại mạng → Try again → vào onboarding, **không** tạo tài khoản mới.
- [ ] **AU-42** Bàn phím: ô Email có phím @, không tự viết hoa; Next chuyển ô; Done ở ô tên gửi form; trình quản lý mật khẩu (Google Password Manager) gợi ý tạo mật khẩu mạnh.
- [ ] **AU-43** Đăng ký liên tục hơn 10 tài khoản trong 1 giờ cùng mạng → **Mong đợi:** "Too many attempts for now. Please wait a few minutes and try again.".
- [ ] **AU-44** Màn đăng ký **không** có ô xác minh email, không có Apple/Facebook.

### 1.4 Đăng nhập bằng email

- [ ] **AU-50** Email và mật khẩu đúng → **Mong đợi:** "Signing in…" rồi vào Home, **không** qua onboarding.
- [ ] **AU-51** Sai mật khẩu → **Mong đợi:** "Email or password is incorrect." (TalkBack đọc lên), mật khẩu không hiện ra ở đâu.
- [ ] **AU-52** Email không tồn tại → **Mong đợi:** cùng câu "Email or password is incorrect." (không lộ email có tồn tại hay không), thời gian chờ tương đương AU-51.
- [ ] **AU-53** Email viết hoa hoặc có khoảng trắng → **Mong đợi:** vẫn đăng nhập được.
- [ ] **AU-54** Để trống và bấm Sign in → **Mong đợi:** "Enter your email address." và "Enter your password.", không gửi request.
- [ ] **AU-55** Tắt mạng → **Mong đợi:** "We couldn't reach Focus Forest. Check your connection and try again." (khác câu sai mật khẩu).
- [ ] **AU-56** Tắt API (server lỗi 500) → **Mong đợi:** "We couldn't finish that just now. Please try again.", không lộ chi tiết kỹ thuật.
- [ ] **AU-57** Sai mật khẩu 10 lần trong 15 phút → **Mong đợi:** lần thứ 11 báo "Too many attempts for now. Please wait a few minutes and try again.", kể cả khi lần đó gõ đúng mật khẩu. Đợi hết 15 phút → đăng nhập lại được.
- [ ] **AU-58** Tài khoản bị khoá trong admin → **Mong đợi:** "This account is suspended." (hoặc "This account is banned.").
- [ ] **AU-59** Tài khoản chỉ có Google, đăng nhập bằng email đó với mật khẩu bất kỳ → **Mong đợi:** "Email or password is incorrect.".
- [ ] **AU-60** Ô mật khẩu → **Mong đợi:** trình quản lý mật khẩu tự điền được (autofill current-password).
- [ ] **AU-61** Bấm "Create an account" → **Mong đợi:** sang màn đăng ký.

### 1.5 Đăng nhập Google (cần APK mới và Gmail trong Test users)

- [ ] **AU-70** Ở màn đăng ký hoặc đăng nhập → **Mong đợi:** có vạch "or" và nút **Continue with Google** với logo G 4 màu.
- [ ] **AU-71** Gmail chưa từng dùng app → Continue with Google → chọn tài khoản → **Mong đợi:** vào onboarding "Your seed is planted"; trong Profile, tên lấy từ tên Google; múi giờ đúng của máy.
- [ ] **AU-72** Đăng xuất rồi Continue with Google lại cùng Gmail → **Mong đợi:** vào thẳng Home, không onboarding lần nữa, tên đã sửa trong app **không** bị đổi lại theo Google.
- [ ] **AU-73** Mở cửa sổ chọn tài khoản rồi bấm Back hoặc ra ngoài → **Mong đợi:** về màn cũ, không có thông báo lỗi, không có gì thay đổi.
- [ ] **AU-74** Gmail **trùng email** của một tài khoản đăng ký bằng mật khẩu → **Mong đợi:** "This email already has a Focus Forest account. Sign in with your password.", không tạo hay gộp tài khoản.
- [ ] **AU-75** Gmail **không** có trong Test users (khi app Google còn ở Testing) → **Mong đợi:** Google chặn ở bước chọn tài khoản; app báo "We couldn't sign you in with Google. Please try again." hoặc không làm gì.
- [ ] **AU-76** Tắt mạng rồi bấm Continue with Google → **Mong đợi:** Google không mở được, hoặc báo "We couldn't reach Focus Forest. Check your connection and try again.".
- [ ] **AU-77** API thiếu `GOOGLE_CLIENT_IDS` (xoá trong .env, khởi động lại) → **Mong đợi:** báo lỗi chung, không crash. Trả lại cấu hình sau khi test.
- [ ] **AU-78** Bấm nút 2 lần nhanh → **Mong đợi:** chỉ mở một cửa sổ chọn tài khoản; nút hiện "Opening Google…".
- [ ] **AU-79** Đăng xuất rồi Continue with Google → **Mong đợi:** Google hỏi chọn tài khoản lại (không tự đăng nhập tài khoản cũ), chọn được Gmail khác.
- [ ] **AU-80** Gmail đổi tên hiển thị dài hơn 50 ký tự → **Mong đợi:** tên trong app bị cắt còn 50 ký tự, không lỗi.

### 1.6 Quên mật khẩu (W.3)

**Chuẩn bị:** API chưa có `SMTP_URL` thì mã in ra terminal của API (dòng `[Mail] To …`). Có SMTP thì mã đến hộp thư.

- [ ] **AU-90** Ở "Welcome back" gõ email rồi bấm **Forgot password?** → **Mong đợi:** màn "Reset your password", ô Email đã điền sẵn email vừa gõ.
- [ ] **AU-91** Bấm **Send code** với email có tài khoản → **Mong đợi:** "If an account uses <email>, we sent it a 6-digit code. It works for 15 minutes."; email tiêu đề "Your Focus Forest code" có mã 6 số.
- [ ] **AU-92** Gửi với email **không** có tài khoản → **Mong đợi:** câu thông báo **y hệt** AU-91, thời gian chờ như nhau, không có email nào được gửi.
- [ ] **AU-93** Email sai định dạng → **Mong đợi:** "Enter a valid email address.", không gửi request.
- [ ] **AU-94** Nhập mã đúng và mật khẩu mới hợp lệ → **Set new password** → **Mong đợi:** vào thẳng Home. Đăng xuất, đăng nhập bằng mật khẩu **cũ** → "Email or password is incorrect."; mật khẩu **mới** → vào được.
- [ ] **AU-95** Có máy thứ hai đang đăng nhập tài khoản đó; đặt lại mật khẩu ở máy một → **Mong đợi:** máy hai bị đăng xuất ở lần làm mới token tiếp theo (tối đa khoảng 15 phút, hoặc kill rồi mở lại app).
- [ ] **AU-96** Mã sai → **Mong đợi:** "That code is not right, or it has expired. Ask for a new one.".
- [ ] **AU-97** Mã 5 chữ số, hoặc có chữ cái → **Mong đợi:** "Enter the 6-digit code from the email.", không gửi request. Ô mã chỉ hiện bàn phím số, tối đa 6 ký tự.
- [ ] **AU-98** Mật khẩu mới 7 ký tự → **Mong đợi:** "Use at least 8 characters for your password."; sửa lại ≥ 8 ký tự với **cùng mã** → vẫn đổi được (mã không bị mất vì lỗi mật khẩu).
- [ ] **AU-99** Nhập sai mã 5 lần rồi nhập mã đúng → **Mong đợi:** vẫn báo mã không đúng; phải bấm **Send a new code**.
- [ ] **AU-100** Đợi hơn 15 phút rồi dùng mã → **Mong đợi:** báo mã không đúng hoặc đã hết hạn.
- [ ] **AU-101** Dùng mã đúng một lần rồi đổi mật khẩu lần nữa bằng chính mã đó → **Mong đợi:** báo mã không đúng.
- [ ] **AU-102** Bấm Send a new code → **Mong đợi:** có email mã mới; mã **cũ** không dùng được nữa, mã mới dùng được.
- [ ] **AU-103** Tài khoản chỉ đăng nhập bằng Google bấm quên mật khẩu → **Mong đợi:** app vẫn hiện câu chung như AU-91; email đến có tiêu đề "How you sign in to Focus Forest", nhắc chọn Continue with Google, **không** có mã.
- [ ] **AU-104** Tắt mạng rồi Send code → **Mong đợi:** "We couldn't reach Focus Forest. Check your connection and try again.", vẫn ở bước nhập email.
- [ ] **AU-105** Bấm **Back to sign in** → **Mong đợi:** về "Welcome back".
- [ ] **AU-106** Bấm Send code hơn 10 lần trong 15 phút → **Mong đợi:** "Too many attempts for now. Please wait a few minutes and try again." (dùng chung quota với đăng nhập).
- [ ] **AU-107** Android gợi ý điền mã từ thông báo email hoặc tin nhắn (nếu có) → **Mong đợi:** điền được vào ô "6-digit code".

### 1.7 Đăng xuất (xoá tài khoản và tải dữ liệu: xem mục 5.14, ST-128 → ST-138)

- [ ] **AU-110** Settings → **Sign out** → **Mong đợi:** về "Welcome back"; Back không quay lại được Home.
- [ ] **AU-111** Đăng xuất khi đang tắt mạng → **Mong đợi:** vẫn đăng xuất được.
- [ ] **AU-112** Đăng xuất tài khoản A, đăng nhập tài khoản B → **Mong đợi:** không thấy chủ đề, lịch sử, timer hay onboarding của A.
## 2. Vòng lặp focus: Home, topic, timer, completion, history, insights


**Số liệu cấu hình lấy từ code** (seed `focus-forest-api/prisma/migrations/20260927090000_session_config/migration.sql`, `focus-forest-api/src/sessions/evaluation/evaluate-session.ts`, `focus-forest-mobile/src/focus/duration.ts`):
- `session.minValidMinutes` = **5**: phiên có thời gian focus **≥ 5:00** thì được tính. Ít hơn thì phiên bị `discarded`, vẫn lưu nhưng không tính.
- `session.maxPauseMinutes` = **30**: **tổng** thời gian pause của một phiên được phép đúng bằng 30:00. Vượt quá dù 1 ms thì phiên tự kết thúc, và thời điểm kết thúc là lúc tổng pause chạm 30:00.
- Preset thời lượng: 15 / 25 / 45 / 50 / 60 phút. Mặc định cho phiên đầu là **15**. Custom từ **5 đến 180**, bước **5** phút. API chấp nhận 1–1440.
- Server chấp nhận giờ kết thúc vượt đồng hồ server tối đa **120 s**. Quá mức này thì trả `ends_in_future`.
- Tên topic tối đa **100** ký tự, mô tả tối đa **500**, note tối đa **500**. Đơn vị đếm là code point sau khi trim và chuẩn hoá NFC, nên 1 emoji tính là 1 ký tự.
- Home hiện tối đa **5** chip topic gần đây. Một trang History có **30** phiên. Heatmap phủ **365** ngày.
- Có **12 màu** topic (`Color 1`…`Color 12`) và **50 icon**. Icon mặc định là `Seed`.

**Chuẩn bị:** có 1 tài khoản mới và 1 tài khoản đã có dữ liệu. Biết cách bật/tắt chế độ máy bay. Biết cách tắt "Ngày giờ tự động" để chỉnh đồng hồ. Cần bấm giờ chính xác, ví dụ dùng đồng hồ bấm giờ của máy khác.

---

### 2.1 Home

- [ ] **CL-1** Đăng nhập tài khoản đã có dữ liệu và mở tab Home khi online → **Mong đợi:** tiêu đề `This month`. Cây của tháng là phần chính. Ngay dưới cây là nút `Start Focus`. Tiếp theo là vòng `Daily goal` với giá trị dạng `X / Y min` (khi đạt thì thành `Goal reached · X / Y min`), dòng streak, dòng tuần, và nút `Tree details`.
- [ ] **CL-2** Mở Home bằng tài khoản chưa có phiên nào trong tuần → **Mong đợi:** dòng tuần là `This week: no focus yet` và streak là `Focus today to start a streak`.
- [ ] **CL-3** Mở Home khi tuần này đã focus ≥ 1 phút → **Mong đợi:** dòng tuần dạng `This week: 1 h 35 min focused` hoặc `This week: 25 min focused`.
- [ ] **CL-4** Xem streak ở các trạng thái khác nhau → **Mong đợi:** streak > 0 hiện `N-day streak`. Ngày nghỉ hiện `Rest day today · your N-day streak is kept`, hoặc `Rest day today` nếu streak = 0. Quay lại sau khi gãy streak (current = 1, longest > 1) hiện `Day 1 — welcome back`.
- [ ] **CL-5** Tạo weekly goal rồi mở Home → **Mong đợi:** có thêm vòng `Weekly goal`. Tuần không có goal thì không hiện vòng này.
- [ ] **CL-6** Đạt daily goal bằng một phiên, rồi về Home → **Mong đợi:** dòng `You reached today's goal.` hiện **một lần** (ở Completion hoặc Home, chỗ nào hiện trước). Không hiện lại ở lần mở sau. Không hiện khi Home đang lấy từ dữ liệu lưu trên máy.
- [ ] **CL-7** Quick-start chip: tài khoản có topic đã dùng → **Mong đợi:** dưới nút có tối đa **5** chip của topic active, sắp theo lần dùng gần nhất. Chip của topic đã có thời lượng nhớ hiện dạng `Reading · 25 min`, chip chưa có thời lượng chỉ hiện tên.
- [ ] **CL-8** Bấm một chip có thời lượng nhớ (ví dụ `Reading · 25 min`) → **Mong đợi:** chỉ **1 chạm** là màn Focus mở và đếm ngược từ `25:00`.
- [ ] **CL-9** Bấm một chip không có thời lượng nhớ (hoặc thời lượng nhớ không hợp lệ với selector, ví dụ 7 hay 240 tạo từ client khác) → **Mong đợi:** mở sheet `Duration`, chọn sẵn `15 min`.
- [ ] **CL-10** Có 6 topic trở lên đã dùng → **Mong đợi:** chỉ hiện đúng 5 chip.
- [ ] **CL-11** Khi đang có phiên chạy hoặc đang pause → **Mong đợi:** nút đổi thành `Resume focus` và không hiện chip nào. Bấm nút thì mở lại đúng phiên đang chạy, không tạo phiên mới.
- [ ] **CL-12** Mở Home online để dữ liệu được lưu, sau đó bật chế độ máy bay, kill app rồi mở lại → **Mong đợi:** Home hiện cây và số liệu đã lưu, kèm dòng `Showing your tree as last saved on this device.` Vẫn bấm được `Start Focus`.
- [ ] **CL-13** Cài mới hoặc xoá dữ liệu app, đăng nhập, rồi chuyển sang offline trước khi Home tải xong → **Mong đợi:** thấy `We couldn't load your tree right now.` kèm `Your focus sessions are safe on this device.` và nút retry. Nút `Start Focus` vẫn còn.
- [ ] **CL-14** Đăng nhập tài khoản A và mở Home để dữ liệu được lưu. Đăng xuất, đăng nhập tài khoản B khi offline → **Mong đợi:** không bao giờ hiện Home đã lưu của A.
- [ ] **CL-15** Đồng bộ một phiên xong rồi quay về Home → **Mong đợi:** Home tự tải lại. Số phút hôm nay, tuần và cây được cập nhật. Hiệu ứng cây lớn lên chạy **một lần**.
- [ ] **CL-16** Đóng app khi đang mở Completion và cây đang tăng trưởng, rồi mở lại → **Mong đợi:** khoảnh khắc tăng trưởng chưa xem hiện trên Home **một lần**, không lặp lại.

### 2.2 Topics (Profile → Topics)

- [ ] **CL-17** Mở Profile → Topics → **Mong đợi:** tiêu đề `Topics`, hai chip `Active` / `Archived`, nút `Create topic`. Danh sách topic active theo thứ tự tạo.
- [ ] **CL-18** Tài khoản chưa có topic → **Mong đợi:** empty state `Topics are what you focus on, in your own words.` Tab Archived trống thì hiện `Archived topics will appear here.`
- [ ] **CL-19** Bấm `Create topic` → **Mong đợi:** sheet `New topic` có ô `Name`, helper `You can change its color later.` và nút `Create`. Form không có ô mô tả, màu hay icon.
- [ ] **CL-20** Nhập "Reading" rồi bấm `Create` → **Mong đợi:** sheet đóng, topic xuất hiện ngay với icon Seed và màu `topic.1`.
- [ ] **CL-21** Để trống, hoặc chỉ gõ khoảng trắng, rồi bấm `Create` → **Mong đợi:** lỗi `Add a name for this topic.` và sheet không đóng.
- [ ] **CL-22** Nhập đúng **100** ký tự → **Mong đợi:** tạo được.
- [ ] **CL-23** Nhập **101** ký tự → **Mong đợi:** lỗi `Keep the name to 100 characters or fewer.`
- [ ] **CL-24** Nhập 100 ký tự kèm khoảng trắng ở đầu và cuối → **Mong đợi:** tạo được, vì trim xong thì đếm. Tên lưu không có khoảng trắng thừa.
- [ ] **CL-25** Nhập tên chứa 100 emoji → **Mong đợi:** tạo được, vì mỗi emoji tính 1 ký tự. 101 emoji thì báo lỗi giới hạn.
- [ ] **CL-26** Sửa lại tên sau khi đã thấy lỗi → **Mong đợi:** lỗi biến mất ngay khi gõ.
- [ ] **CL-27** Bấm `Create` hai lần thật nhanh → **Mong đợi:** chỉ có **1** topic được tạo. Nút chuyển thành `Creating…` và bị vô hiệu trong lúc lưu.
- [ ] **CL-28** Nhấn phím Done trên bàn phím trong ô Name → **Mong đợi:** kết quả giống bấm `Create`.
- [ ] **CL-29** Tạo trùng tên với topic active, không phân biệt hoa thường (đã có "Reading", tạo "reading") khi online → **Mong đợi:** sheet vẫn đóng vì topic được đưa vào hàng đợi trước. Sau khi sync, dòng topic hiện `Choose another name to sync this topic.` Bấm vào dòng đó thì thấy `Another active topic already uses this name.` cùng ô Name và nút `Save`. Đổi tên rồi `Save` thì topic sync, vẫn giữ cùng id.
- [ ] **CL-30** Tạo topic trùng tên với một topic **đã archive** → **Mong đợi:** tạo được, vì chỉ tên của topic active mới phải duy nhất.
- [ ] **CL-31** Tạo topic khi offline (chế độ máy bay) → **Mong đợi:** sheet đóng, topic hiện ngay với nhãn `Waiting to sync`. Bấm vào khi chưa từng gửi thì sửa tên được. Bật mạng lại, hoặc đưa app về foreground → topic sync và nhãn biến mất.
- [ ] **CL-32** Topic đã được gửi nhưng chưa nhận được phản hồi (mạng chập chờn) rồi bấm vào → **Mong đợi:** chỉ thấy `Waiting to sync` và `This topic is saved on this device and will sync when you are back online.`, không sửa được.
- [ ] **CL-33** Tạo topic offline, kill app, mở lại vẫn offline → **Mong đợi:** topic vẫn còn với nhãn `Waiting to sync`. Khi online thì tự sync và không bị nhân đôi.
- [ ] **CL-34** Topic bị server từ chối vì lỗi khác (`needs_attention`) → **Mong đợi:** nhãn `This topic needs a look before it can sync.`, chi tiết `It stays saved on this device.` Không tự retry và không hiện mã lỗi nội bộ. (chưa xác minh cách tái hiện trên thiết bị)
- [ ] **CL-35** Bấm một topic active → **Mong đợi:** sheet `Edit topic` gồm `Name`, `Description` (helper `Optional.`, nhiều dòng), mục `Color` có 12 chip `Color 1`…`Color 12` với màu hiện tại được chọn, mục `Icon` có 50 icon có tên (`Seed`, `Book`, `Notebook`, …, `Paper plane`), nút `Save` và `Archive topic`.
- [ ] **CL-36** Đổi tên, màu và icon rồi `Save` khi online → **Mong đợi:** sheet đóng. Danh sách, picker và Home dùng tên, màu, icon mới. History cũ cũng hiện tên mới.
- [ ] **CL-37** Mô tả dài đúng 500 ký tự → **Mong đợi:** lưu được. 501 ký tự → lỗi `Keep the description to 500 characters or fewer.`
- [ ] **CL-38** Xoá trắng mô tả rồi `Save` → **Mong đợi:** mô tả bị xoá và dòng phụ dưới tên biến mất.
- [ ] **CL-39** Mở Edit rồi bấm `Save` khi không đổi gì → **Mong đợi:** sheet đóng, không gửi request.
- [ ] **CL-40** Edit rồi `Save` khi offline → **Mong đợi:** thấy `We couldn't save your changes right now.` và `Nothing was changed. Try again when you're online.` Sheet giữ nguyên nội dung đang sửa, topic không đổi.
- [ ] **CL-41** Đổi tên trùng với topic active khác (khác hoa thường) → **Mong đợi:** lỗi ngay dưới ô Name: `Another active topic already uses this name.`
- [ ] **CL-42** Edit với tên rỗng hoặc dài 101 ký tự → **Mong đợi:** lỗi giống lúc tạo, không gửi request.
- [ ] **CL-43** Bấm `Save` liên tục 2 lần → **Mong đợi:** nút hiện `Saving…` và bị vô hiệu, chỉ gửi 1 request.
- [ ] **CL-44** Bấm `Archive topic` → **Mong đợi:** hộp xác nhận `Archive this topic?` với nội dung `Your past focus sessions will stay in history. You can restore it anytime.` và nút `Archive`. Xác nhận thì topic chuyển sang tab `Archived`, không còn trong picker và chip Home.
- [ ] **CL-45** Huỷ hộp xác nhận archive → **Mong đợi:** topic vẫn active.
- [ ] **CL-46** Archive khi offline → **Mong đợi:** thấy `We couldn't archive this topic right now.` và `It is still active. Try again when you're online.`
- [ ] **CL-47** Ở tab Archived, bấm `Restore` → **Mong đợi:** topic quay về Active sau 1 chạm.
- [ ] **CL-48** Restore một topic có tên trùng với topic active hiện tại → **Mong đợi:** thấy `An active topic already uses this name.` và `Rename or archive that topic, then restore this one.` Không topic nào bị đổi tên.
- [ ] **CL-49** Restore khi offline → **Mong đợi:** thấy `We couldn't restore this topic right now.` và `Try again when you're online.`
- [ ] **CL-50** Mở Topics khi offline, máy đã lưu danh sách trước đó → **Mong đợi:** danh sách vẫn hiện cùng dòng `Showing topics saved on this device.`
- [ ] **CL-51** Mở Topics khi offline mà chưa từng tải → **Mong đợi:** thấy `We couldn't load your topics right now.` và nút retry.
- [ ] **CL-52** Archive một topic đang được dùng trong phiên đang chạy, rồi kết thúc phiên → **Mong đợi:** phiên vẫn được lưu, vì server nhận cả topic đã archive. History hiện đúng tên topic.
- [ ] **CL-53** Gợi ý tên topic: (chưa xác minh). Docs có nhắc nhưng **không tìm thấy** trong code mobile, cả form tạo topic lẫn onboarding.

### 2.3 Luồng Start Focus (sheet chọn topic và thời lượng)

- [ ] **CL-54** Bấm `Start Focus` → **Mong đợi:** sheet `Choose a topic`. Topic active xếp theo lần dùng gần nhất, sau đó đến topic đang chờ sync (dòng phụ `Waiting to sync`). Topic có thời lượng nhớ thì hiện `25 min` bên phải kèm nút `Change duration`. Cuối danh sách có nút `New topic`.
- [ ] **CL-55** Bấm vào topic có thời lượng nhớ → **Mong đợi:** Focus mở ngay. Từ Home chỉ mất 2 chạm.
- [ ] **CL-56** Bấm `Change duration` → **Mong đợi:** sheet `Duration` chọn sẵn thời lượng đang nhớ. Chọn `45 min` rồi bấm `Start focus` thì phiên chạy 45 phút. Lần sau topic này nhớ 45, tức thời lượng của phiên gần nhất.
- [ ] **CL-57** Mở sheet Duration, chọn 45 rồi đóng (back hoặc chạm nền) mà không bắt đầu → **Mong đợi:** quay về `Choose a topic`. Thời lượng nhớ **không** đổi.
- [ ] **CL-58** Topic mới chưa có phiên nào → **Mong đợi:** không có meta thời lượng, bấm vào thì mở Duration với `15 min` được chọn sẵn.
- [ ] **CL-59** Tài khoản chưa có topic → **Mong đợi:** thấy `Create a topic to focus on.` và nút `Create topic`. Tạo xong thì quay lại picker, topic mới (có thể đang chờ sync) chọn được và bắt đầu được ngay.
- [ ] **CL-60** Kiểm tra sheet Duration → **Mong đợi:** chip `15 min`, `25 min`, `45 min`, `50 min`, `60 min`, `Custom`. Chọn `Custom` thì hiện ô `Minutes` với helper `From 5 to 180, in 5-minute steps.` và bàn phím số.
- [ ] **CL-61** Custom = **5** → **Mong đợi:** bắt đầu được và đếm từ `05:00`.
- [ ] **CL-62** Custom = **180** → **Mong đợi:** bắt đầu được và đếm từ `03:00:00`.
- [ ] **CL-63** Custom = **0** hoặc **4** → **Mong đợi:** lỗi `Choose a duration from 5 to 180 minutes.`
- [ ] **CL-64** Custom = **185** hoặc **181** → **Mong đợi:** lỗi `Choose a duration from 5 to 180 minutes.`
- [ ] **CL-65** Custom = **37** → **Mong đợi:** lỗi `Use 5-minute steps, like 35 or 40.`
- [ ] **CL-66** Custom để trống, hoặc nhập `abc`, `2.5`, `-5`, `35 phút` → **Mong đợi:** lỗi `Enter the minutes, like 35.`
- [ ] **CL-67** Custom = `" 35 "` (có khoảng trắng hai bên) → **Mong đợi:** được chấp nhận là 35.
- [ ] **CL-68** Gõ thêm sau khi đã thấy lỗi custom, hoặc chọn một preset → **Mong đợi:** lỗi biến mất.
- [ ] **CL-69** Mở app lần đầu ở chế độ máy bay, chưa từng tải session rules → **Mong đợi:** trong picker thấy `Focus settings aren't available right now.` và `They load the next time you are online.` kèm nút `Try again`. Các topic bị vô hiệu và không bắt đầu được phiên nào.
- [ ] **CL-70** Đã từng online một lần, kill app, bật chế độ máy bay rồi mở lại → **Mong đợi:** bắt đầu phiên bình thường bằng rules đã lưu trên máy (5/30) và topic đã lưu. Có thể thấy `Showing topics saved on this device.`
- [ ] **CL-71** Ngay lúc mạng chậm và rules đang tải → **Mong đợi:** topic bị vô hiệu với lý do `Focus settings are loading.` (chưa xác minh khả năng tái hiện)
- [ ] **CL-72** Bấm `Start Focus` khi phiên trước đã kết thúc nhưng chưa chuyển xong vào outbox → **Mong đợi:** bình thường thì phiên cũ được chuyển trước rồi mới mở picker. Nếu bộ nhớ lỗi thì thấy `Your last session is still being saved on this device.` và `Try again in a moment.` (khó tái hiện)
- [ ] **CL-73** Double-tap nhanh vào một topic hay quick chip để bắt đầu → **Mong đợi:** chỉ có **1** phiên. Lần chạm thứ hai mở lại phiên đang chạy. (chưa xác minh việc màn Focus có bị push 2 lần không)
- [ ] **CL-74** Bấm `Start Focus` khi trạng thái timer đang tải ngay sau khi mở app → **Mong đợi:** nút bị vô hiệu với lý do `Your focus session is loading.`
- [ ] **CL-75** Nếu admin nâng `minValidMinutes` lên, ví dụ 20 (cần quyền admin) → **Mong đợi:** chip 15 bị vô hiệu với lý do `Shorter than a session needs to count.` Helper đổi thành `From 20 to 180…`. Sheet mở ở preset đầu tiên đạt yêu cầu là 25. Thời lượng nhớ dưới mức tối thiểu thì không quick-start. Nếu minimum > 180 → `Focus durations aren't available with the current settings.`
- [ ] **CL-76** Thấy `We couldn't start this focus session on your device.` / `Try again.` khi lưu timer thất bại → **Mong đợi:** vẫn ở lại picker. (khó tái hiện)
- [ ] **CL-77** Bắt đầu phiên đầu tiên trên máy Android 13+ khi chưa cấp quyền thông báo → **Mong đợi:** hộp xin quyền xuất hiện **lúc phiên đầu tiên bắt đầu**, không xuất hiện trước đó, và chỉ hỏi tối đa 1 lần mỗi lần mở app. Từ chối thì timer vẫn chạy bình thường.

### 2.4 Màn Focus (timer)

- [ ] **CL-78** Bắt đầu phiên 25 phút → **Mong đợi:** toàn màn hình, không có tab bar. Hiện icon và tên topic, dòng `25 min session`, nhãn **`Focusing`** (chấm xanh, nền xanh nhạt), một **vòng tiến độ lớn có cây của tháng bên trong** (cây lay nhẹ), đồng hồ `25:00` đếm xuống mỗi giây với caption `Time left`, nút `Pause` (nút phụ) và nút `End session` đặt cách xa nhau.
- [ ] **CL-79** Phiên ≥ 60 phút → **Mong đợi:** định dạng `01:05:07`. Dưới 60 phút thì là `mm:ss`.
- [ ] **CL-80** Vòng tiến độ quanh cây → **Mong đợi:** màu xanh lá, chỉ nhảy theo từng **phút** focus nguyên (TalkBack đọc `Session progress`, `10 of 25 min`), trong khi đồng hồ nhảy mỗi giây.
- [ ] **CL-81** Bấm `Pause` → **Mong đợi:** nhãn đổi thành **`Paused`** (hai vạch, nền vàng nhạt); cây mờ đi và đứng yên; vòng tiến độ chuyển xám và đứng yên; đồng hồ đứng yên và nhạt màu; caption thành **`Pause time left: 30:00`** rồi đếm xuống; nút **`Resume` thành nút chính** (nền cam đậm). Bấm `Resume` thì mọi thứ về trạng thái đang tập và chạy tiếp từ đúng chỗ dừng.
- [ ] **CL-81a** Pause 10 phút, Resume, rồi Pause lại → **Mong đợi:** caption bắt đầu từ **`Pause time left: 20:00`**, vì quỹ dừng 30 phút tính cho cả phiên, không phải từng lần.
- [ ] **CL-81b** Nhìn từ xa một cánh tay, không đọc chữ → **Mong đợi:** phân biệt được ngay đang tập hay đang dừng (cây sáng/mờ, vòng xanh/xám, nút chính khác nhau).
- [ ] **CL-81c** Tài khoản mới, cây còn là hạt, hoặc mở Focus khi offline chưa có dữ liệu Home → **Mong đợi:** vòng tiến độ vẫn hiện với nền trơn bên trong; đồng hồ và nút vẫn hoạt động bình thường.
- [ ] **CL-82** Bấm `Pause` hoặc `Resume` dồn dập → **Mong đợi:** nút bị vô hiệu trong lúc lưu và trạng thái không bị lệch.
- [ ] **CL-83** Pause 10 phút, Resume, rồi pause tiếp đúng **20:00** và Resume → **Mong đợi:** vẫn Resume được, vì tổng pause đúng 30:00 là giới hạn còn được phép.
- [ ] **CL-84** Pause liền một mạch quá **30 phút** (để màn hình mở) → **Mong đợi:** khi tổng pause vượt 30:00, phiên tự kết thúc tại đúng thời điểm chạm 30:00. Màn chuyển qua `Saving your session.` rồi sang Completion.
- [ ] **CL-85** Pause tích luỹ: 15 phút + 10 phút + lần thứ ba quá 5 phút → **Mong đợi:** phiên kết thúc đúng lúc lần pause thứ ba đạt 5:00 (tổng 30:00).
- [ ] **CL-86** Pause quá 30 phút mà thời gian focus trước đó **≥ 5** phút → **Mong đợi:** Completion hiện `Focus session saved` không kèm giải thích. History ghi `Ended early`.
- [ ] **CL-87** Pause quá 30 phút mà thời gian focus trước đó **< 5** phút → **Mong đợi:** Completion hiện `Focus session saved` kèm `This session was shorter than the minimum for counted focus time.` History ghi `Not counted`.
- [ ] **CL-88** Bấm `End session` → **Mong đợi:** modal `End this focus session?` với nội dung `Your focused time so far will be saved. Sessions count once they reach 5 minutes.`, nút `End session` và `Keep focusing`.
- [ ] **CL-89** Bấm `Keep focusing` → **Mong đợi:** phiên chạy tiếp như cũ, thời gian không bị ảnh hưởng.
- [ ] **CL-90** Kết thúc sớm khi đã focus **5:00** (đúng 5 phút) → **Mong đợi:** phiên được tính. Completion hiện `Focus session saved` và `5 min focused`. History ghi `Ended early`.
- [ ] **CL-91** Kết thúc sớm khi đã focus khoảng **4:55** → **Mong đợi:** phiên bị discard. Completion hiện `Focus session saved` cùng `This session was shorter than the minimum for counted focus time.` và `4 min focused`. History ghi `Not counted`. Cây không lớn.
- [ ] **CL-92** Kết thúc sau vài giây → **Mong đợi:** Completion hiện `0 min focused`. History hiện meta `<1 min` và `Not counted`.
- [ ] **CL-93** Kết thúc khi đang pause → **Mong đợi:** pause đang mở được đóng tại thời điểm kết thúc. Thời gian focus không tính phần pause.
- [ ] **CL-94** Để phiên tự hoàn thành (dùng 5 phút cho nhanh) → **Mong đợi:** về `00:00` thì tự kết thúc, không cần chạm gì. Completion hiện tiêu đề `Session complete` và `5 min focused`. History ghi `Completed`.
- [ ] **CL-95** Mở modal End rồi để nguyên cho phiên tự hoàn thành, sau đó bấm `End session` → **Mong đợi:** phiên vẫn được ghi là **hoàn thành** tại đúng thời điểm hoàn thành, không bị đổi thành end sớm.
- [ ] **CL-96** Nút Back cứng hoặc vuốt back của Android khi đang chạy → **Mong đợi:** không rời màn, hiện modal `End this focus session?`. Bấm `Keep focusing` thì ở lại. Không có cử chỉ vuốt nào thoát được Focus.
- [ ] **CL-97** Back rồi xác nhận `End session` → **Mong đợi:** phiên kết thúc và mở Completion. Bấm `Done` thì về Home.
- [ ] **CL-98** Bấm nút Home hoặc chuyển app khác 3 phút rồi quay lại → **Mong đợi:** đồng hồ hiện đúng ngay lập tức, đã trừ 3 phút, không chạy lại từ chỗ cũ.
- [ ] **CL-99** Khoá màn hình 2 phút rồi mở → **Mong đợi:** thời gian còn lại đúng như CL-98.
- [ ] **CL-100** Khoá màn hình cho đến khi phiên đủ thời lượng → **Mong đợi:** có thông báo `Focus complete` / `Your focus session is ready.` đúng thời điểm. Mở app thì phiên được ghi hoàn thành tại thời điểm đó, không phải lúc mở app.
- [ ] **CL-101** Pause, khoá màn hình hơn 30 phút → **Mong đợi:** có thông báo `Focus session ended` / `Your paused session has been saved.` lúc tổng pause chạm 30 phút. Mở app thì phiên kết thúc tại mốc đó.
- [ ] **CL-102** Bấm vào thông báo hoàn thành → **Mong đợi:** mở Completion của đúng phiên đó, từ bất kỳ màn nào. Bấm thông báo 2 lần cũng chỉ mở 1 Completion.
- [ ] **CL-103** Kill app (vuốt khỏi recents) khi đang chạy, mở lại trước khi hết giờ → **Mong đợi:** Home hiện `Resume focus`. Bấm vào thì Focus hiện thời gian còn lại đúng, vì timer tính theo mốc thời gian. Focus **không** tự mở lại.
- [ ] **CL-104** Kill app khi đang **pause**, mở lại sau 5 phút → **Mong đợi:** vẫn đang pause và tổng pause đã cộng thêm 5 phút.
- [ ] **CL-105** Kill app, chờ qua thời điểm hoàn thành rồi mở lại → **Mong đợi:** phiên được ghi hoàn thành tại thời điểm hoàn thành và tự sync. Completion **không** tự mở. Hiệu ứng cây lớn hiện trên Home một lần. Bấm thông báo thì mở Completion.
- [ ] **CL-106** Kill app khi đang pause, mở lại sau hơn 30 phút pause → **Mong đợi:** phiên kết thúc tại mốc 30 phút pause, không phải lúc mở app.
- [ ] **CL-107** Phiên hoàn thành khi đang ở tab khác, ví dụ Insights (dùng `Resume focus` rồi back… hoặc vào từ Tree Details) → **Mong đợi:** Completion không chiếm màn đang xem. Nó chờ tới khi bạn quay về Home hoặc Focus mới mở. (lưu ý: khi Focus đang mở thì không rời được)
- [ ] **CL-108** Có quyền thông báo nhưng app đang mở ở foreground khi phiên kết thúc → **Mong đợi:** không có thông báo hệ thống, màn hình tự chuyển. (chưa xác minh hành vi hiển thị ở foreground)
- [ ] **CL-109** Từ chối quyền thông báo, khoá màn hình đến khi hết giờ → **Mong đợi:** không có thông báo. Mở app thì phiên vẫn được ghi hoàn thành đúng thời điểm.
- [ ] **CL-110** Tắt sound trong Settings rồi để phiên hoàn thành ở background → **Mong đợi:** thông báo vẫn hiện nhưng im lặng, qua kênh `Focus timer` phiên bản không âm thanh. Bật sound thì có âm báo mặc định.
- [ ] **CL-111** Pause rồi Resume khi khoá màn hình → **Mong đợi:** thông báo dự kiến đổi theo: lúc chạy thì báo khi hoàn thành, lúc pause thì báo khi chạm giới hạn pause. Không có thông báo cũ sai thời điểm. Kết thúc sớm thì huỷ thông báo.
- [ ] **CL-112** Tắt ngày giờ tự động và lùi đồng hồ máy 10 phút khi đang chạy, rồi bấm `Pause` → **Mong đợi:** thấy `Your device time changed.` và `Focus controls will be available when the clock catches up.` Phiên giữ nguyên.
- [ ] **CL-113** Tiến đồng hồ máy thêm 1 giờ khi đang chạy phiên 25 phút → **Mong đợi:** phiên lập tức coi là hoàn thành tại mốc planned, xem thêm CL-123 về phía server.
- [ ] **CL-114** Chạm vùng đồng hồ khi bật TalkBack → **Mong đợi:** đọc lên thời gian còn lại dạng `24 minutes 59 seconds left`. Không tự đọc theo từng nhịp tick. Cây trong vòng **không** được đọc. Bấm Pause thì TalkBack đọc `Paused`, bấm Resume thì đọc `Focusing`.
- [ ] **CL-115** Đặt cỡ chữ 200% → **Mong đợi:** nhãn trạng thái, đồng hồ, tên topic, `Pause` / `Resume` / `End session` vẫn hiện đủ và bấm được (cuộn được nếu cần).
- [ ] **CL-116** Topic của phiên không còn trên máy, ví dụ dữ liệu bị xoá → **Mong đợi:** tên hiện `Focus topic`. (khó tái hiện)
- [ ] **CL-117** Mở `/focus` khi không có phiên nào, ví dụ qua deep link → **Mong đợi:** thấy `No focus session is running.` và nút `Back to Home`.
- [ ] **CL-118** Phiên đã xong nhưng lưu outbox lỗi → **Mong đợi:** thấy `Your session is still saved on this device.` / `Try again in a moment.` với nút `Try again` và `Back to Home`. (khó tái hiện)

### 2.5 Gửi phiên lên server (outbox, retry, idempotency, đồng hồ)

- [ ] **CL-119** Hoàn thành phiên khi đang ở chế độ máy bay → **Mong đợi:** Completion hiện `Focus session finished` cùng `Saved on this device. Your tree and progress update once it syncs.` Không hiện cây lớn, goal hay streak. Bấm `Done` rời màn được.
- [ ] **CL-120** Sau CL-119, giữ màn Completion mở rồi bật mạng (hoặc đưa app về foreground) → **Mong đợi:** màn tự cập nhật tại chỗ thành `Session complete`, hiện cây lớn **một lần**, nội dung note đang gõ được giữ nguyên.
- [ ] **CL-121** Làm 3 phiên offline liên tiếp, kill app, mở lại online → **Mong đợi:** cả 3 sync theo thứ tự cũ trước. History có đủ 3 dòng, không trùng. Home hiện một khoảnh khắc tăng trưởng gộp, các thay đổi còn lại ghi bằng chữ.
- [ ] **CL-122** Mạng chập chờn: kết thúc phiên rồi bật chế độ máy bay ngay lúc đang gửi → **Mong đợi:** lần gửi lại dùng cùng id và cùng payload. Server trả lại kết quả đã lưu, nên History chỉ có **1** dòng và tăng trưởng không bị tính 2 lần.
- [ ] **CL-123** Tắt giờ tự động, đặt đồng hồ máy **sớm hơn giờ thực > 2 phút**, chạy và kết thúc phiên rồi gửi → **Mong đợi:** server trả `ends_in_future`. Phiên vẫn nằm trên máy và được gửi lại ở lần đưa app về foreground sau, khi giờ server đã vượt qua. Không mất dữ liệu.
- [ ] **CL-124** Đặt đồng hồ máy sớm hơn giờ thực **≤ 2 phút** → **Mong đợi:** server chấp nhận bình thường.
- [ ] **CL-125** Tạo topic offline, chạy phiên với topic đó khi vẫn offline, rồi bật mạng → **Mong đợi:** topic sync trước rồi phiên mới gửi. Cả hai thành công.
- [ ] **CL-126** Tạo topic offline trùng tên topic active, chạy phiên với nó rồi bật mạng → **Mong đợi:** topic chuyển sang `Choose another name to sync this topic.` và phiên chờ. Đổi tên xong thì topic sync và phiên tự gửi.
- [ ] **CL-127** Hai thiết bị cùng tài khoản chạy phiên chồng thời gian nhau → **Mong đợi:** phiên gửi sau bị `session_overlap`, giữ trên máy, không tự retry và không bị xoá. Completion của nó vẫn ở trạng thái `Focus session finished` (chưa xác minh UI cụ thể).
- [ ] **CL-128** Đăng xuất khi còn phiên chưa sync, đăng nhập tài khoản khác → **Mong đợi:** phiên của tài khoản cũ không bị gửi dưới tài khoản mới. Đăng nhập lại tài khoản cũ thì phiên được gửi.
- [ ] **CL-129** Phiên offline thuộc tháng trước, sync sau khi tháng đã đóng (sau 180 phút ân hạn) → **Mong đợi:** Completion hiện `Saved to <Month YYYY>. That month's tree is already resting in your forest.` Insights có thể hiện `Insights include sessions synced later. Your archived tree stays as it was saved.`

### 2.6 Màn Completion và Note

- [ ] **CL-130** Hoàn thành phiên khi online → **Mong đợi:** tiêu đề `Session complete`, tên và icon topic, `N min focused`, cây phản ứng bằng caption (`Your tree grew.` / `Your tree became a …` / `New blossoms opened.`…), vòng `Daily goal`, dòng streak, ô `Note` với helper `Optional. Only you can see it.`, nút `Save note`, nút `Done`.
- [ ] **CL-131** TalkBack bật → **Mong đợi:** đọc lên kết quả dạng `Session complete. 25 minutes focused.` một lần.
- [ ] **CL-132** Gõ note rồi bấm `Save note` khi online → **Mong đợi:** thấy `Note saved.` Sau đó xuất hiện nút `Highlight in monthly recap`.
- [ ] **CL-133** Note dài đúng **500** ký tự → **Mong đợi:** lưu được.
- [ ] **CL-134** Note dài **501** ký tự → **Mong đợi:** lỗi `A note can be at most 500 characters.`
- [ ] **CL-135** Note gồm 500 emoji → **Mong đợi:** lưu được. 501 emoji thì báo lỗi.
- [ ] **CL-136** Note nhiều dòng có khoảng trắng đầu và cuối → **Mong đợi:** xuống dòng và khoảng trắng bên trong được giữ, khoảng trắng đầu và cuối bị cắt.
- [ ] **CL-137** Xoá hết note (hoặc chỉ để khoảng trắng) rồi lưu → **Mong đợi:** note bị xoá. Nếu note đang được highlight thì highlight cũng mất.
- [ ] **CL-138** Gõ note rồi bấm thẳng `Done` → **Mong đợi:** note được lưu trước, sau đó về Home. App không chờ mạng.
- [ ] **CL-139** Gõ note quá 500 ký tự rồi bấm `Done` → **Mong đợi:** hiện lỗi và **không** rời màn.
- [ ] **CL-140** Gõ note rồi bấm Back cứng (không bấm Save hoặc Done) → **Mong đợi:** theo code, bản nháp **không** được lưu. Hãy xác nhận đây có đúng là hành vi mong muốn không. (chưa xác minh)
- [ ] **CL-141** Lưu note khi offline → **Mong đợi:** thấy `Note saved on this device.` Kill app rồi mở lại vẫn còn. Note chỉ được gửi sau khi phiên đã có trên server.
- [ ] **CL-142** Note offline được sửa lại lần nữa trước khi sync → **Mong đợi:** màn hình hiện bản mới nhất còn chờ trên máy, không hiện bản server đã xác nhận trước đó.
- [ ] **CL-143** Note bị server từ chối → **Mong đợi:** thấy `This note is still saved on this device and needs attention before it can sync.` Sửa lại thì được gửi lại. (khó tái hiện)
- [ ] **CL-144** Bấm `Highlight in monthly recap` khi online → **Mong đợi:** thấy `Highlighted. It is kept in the monthly recap when the month ends.` Nút đổi thành `Remove from monthly recap`.
- [ ] **CL-145** Bấm highlight khi offline → **Mong đợi:** thấy `Highlighting needs a connection. Nothing was changed.`
- [ ] **CL-146** Khi đang gõ thay đổi chưa lưu, hoặc note đang chờ trên máy → **Mong đợi:** không có nút highlight.
- [ ] **CL-147** Phiên bị discard (< 5 phút) → **Mong đợi:** không có tăng trưởng cây. Có dòng giải thích. Vẫn thêm note được.
- [ ] **CL-148** Mở Completion của một phiên không có trên máy (link sai, tài khoản khác) → **Mong đợi:** thấy `This session isn't on this device.` và nút `Back to Home`. Không bao giờ hiện phiên của người dùng khác.
- [ ] **CL-149** Đặt cỡ chữ 200% → **Mong đợi:** tiêu đề, thời gian, Note và Done vẫn dùng được.

### 2.7 History (Insights → Focus history) và chi tiết phiên

- [ ] **CL-150** Mở tab Insights rồi cuộn xuống `Focus history` → **Mong đợi:** phiên được nhóm theo ngày với tiêu đề dạng `Wednesday, September 30, 2026`, không dùng "Today" hay "Yesterday". Mỗi dòng có tên topic, phụ đề `9:05 AM · Completed` / `Ended early` / `Not counted`, meta thời gian `25 min` / `1 h 35 min` / `1 h` / `<1 min`.
- [ ] **CL-151** Phiên bị discard → **Mong đợi:** vẫn có trong danh sách với nhãn `Not counted`.
- [ ] **CL-152** Tài khoản chưa có phiên → **Mong đợi:** thấy `Your focus story begins with your first session.` và nút `Go to your tree` để về Home.
- [ ] **CL-153** Có hơn **30** phiên → **Mong đợi:** cuối danh sách có nút `Load more sessions`. Bấm thì nối trang tiếp, không trùng dòng. Hết dữ liệu thì nút biến mất.
- [ ] **CL-154** Tắt mạng rồi bấm `Load more sessions` → **Mong đợi:** thấy `We couldn't load more sessions right now.` và `Try again`. Các trang đã tải vẫn giữ.
- [ ] **CL-155** Đã từng tải History, offline rồi mở lại app → **Mong đợi:** thấy `Showing history saved on this device.` và `Try again`.
- [ ] **CL-156** Chưa từng tải History mà đang offline → **Mong đợi:** thấy `We couldn't load your focus history right now.` và nút retry.
- [ ] **CL-157** Phiên còn chờ trên máy (chưa sync) → **Mong đợi:** **không** xuất hiện trong History hay số liệu Insights cho đến khi sync.
- [ ] **CL-158** Bấm một dòng → **Mong đợi:** mở màn Completion của phiên (đó cũng là màn chi tiết) với trạng thái và note theo server. Sửa được note.
- [ ] **CL-159** Bấm vào phiên của một topic đã archive → **Mong đợi:** hiện đúng tên topic.
- [ ] **CL-160** Đổi tên topic rồi xem History → **Mong đợi:** các phiên cũ hiện tên mới.
- [ ] **CL-161** Mở chi tiết phiên khi offline rồi sửa note → **Mong đợi:** note vào hàng đợi với `Note saved on this device.` và sync khi có mạng.
- [ ] **CL-162** Phiên bắt đầu lúc 23:50 và kết thúc sau nửa đêm → **Mong đợi:** phiên được xếp vào ngày bắt đầu (theo `localDate` từ server). (chưa xác minh bằng thiết bị)

### 2.8 Insights (tuần, tháng, heatmap, kỷ lục, topic)

- [ ] **CL-163** Mở Insights → **Mong đợi:** chip `Week` được chọn, có `Month`, `Previous week`, `Next week`. Dòng tóm tắt dạng `This week · 2 h 10 min across 5 sessions, on 3 active days.`
- [ ] **CL-164** Tuần hiện tại chưa có phiên → **Mong đợi:** thấy `This week · no focus yet.` Tuần cũ không có phiên thì thấy `Week of <date> · a quiet time.`
- [ ] **CL-165** `Next week` khi đang xem tuần hiện tại → **Mong đợi:** nút bị vô hiệu với lý do `This is the current week.` Bấm `Previous week` thì sang tuần trước, tiêu đề `Week of Monday, …`.
- [ ] **CL-166** Ô ngày → **Mong đợi:** 7 ô, bắt đầu từ thứ Hai. Ngày trống có màu trung tính, không đỏ. Ngày có focus đậm dần theo các mốc < 45 phút, < 120 phút, ≥ 120 phút. Ngày nghỉ có chấm riêng. TalkBack đọc dạng `Tuesday, October 6: 1 h 20 min, 3 sessions, rest day, daily goal met`.
- [ ] **CL-167** Chạm một ô ngày → **Mong đợi:** History bên dưới lọc theo ngày đó. Thấy `Showing: <date>` và `Clear filters`.
- [ ] **CL-168** Kiểm tra các nhóm `Focus`, `Goals`, `Rest and streak` → **Mong đợi:** có các dòng `Average per active day: …`, `Longest session: …`, `Daily goal met on X of N days`, `Rest days: N`, `Current streak: N days`, `Longest streak this week: N days`. Tuần không có weekly goal thì không hiện dòng weekly.
- [ ] **CL-169** Chọn `Month` → **Mong đợi:** tiêu đề dạng `October 2026 · …`. Có thêm `Your best day: …`, `Your best week: Week of …`, `Top topic: …`, `Weekly goal met in X of N weeks`. Xem tháng hiện tại thì `Next month` bị vô hiệu.
- [ ] **CL-170** Tuần hoặc tháng lập kỷ lục → **Mong đợi:** có nhóm `New bests` với dòng `New this week: Longest session: 1 h 35 min`.
- [ ] **CL-171** Mục `Topics` → **Mong đợi:** mỗi topic hiện dạng `25 min · 2 sessions · 63%`, kèm `archived topic` nếu đã archive. Chạm vào thì lọc History theo topic, chip đổi thành `Topic: <name>`.
- [ ] **CL-172** `Personal records` của tài khoản mới → **Mong đợi:** thấy `Your personal records appear as you focus.` Tài khoản có dữ liệu thì có tối đa 6 kỷ lục (`Most focused day/week/month`, `Longest streak`, `Longest session`, `Longest daily goal streak`) kèm thời điểm đạt.
- [ ] **CL-173** Bấm `Show your year` → **Mong đợi:** mục `Your year` hiện `Over the last year: N active days, N rest days, daily goal met on N days.`, lưới heatmap 365 ngày, danh sách tháng dạng `October 2026: 3 h focused, 5 active days, 1 rest day`. Chạm một tháng thì nhảy sang chế độ Month của tháng đó.
- [ ] **CL-174** Bấm `Show your year` khi offline → **Mong đợi:** thấy `Your year isn't available right now.` và `Try again`.
- [ ] **CL-175** Lỗi kỷ lục khi offline → **Mong đợi:** thấy `Your records aren't available right now.` và `Try again`.
- [ ] **CL-176** Tải tuần xong, tắt mạng rồi kéo làm mới hoặc chuyển qua lại → **Mong đợi:** thấy `Showing the numbers last loaded.`
- [ ] **CL-177** Lần đầu mở Insights khi offline → **Mong đợi:** thấy `We couldn't load your insights right now.` và nút retry.
- [ ] **CL-178** Bộ lọc History: chip `This week only` / `This month only` (hoặc `Week of … only` / `October 2026 only`), `All topics` mở sheet `Choose a topic` gồm cả topic đã archive (`archived topic`) → **Mong đợi:** lọc đúng. Khi không có kết quả thì thấy `No sessions match these filters.` Bấm `Clear filters` thì bỏ lọc.
- [ ] **CL-179** Mở sheet chọn topic khi offline → **Mong đợi:** thấy `Topics aren't available right now.`
- [ ] **CL-180** Hoàn thành một phiên rồi quay lại Insights → **Mong đợi:** số liệu tuần, tháng, History được làm mới sau khi sync. Phiên còn chờ trên máy không được cộng vào.
- [ ] **CL-181** Cỡ chữ 200% → **Mong đợi:** thanh chọn kỳ và bộ lọc tự xuống dòng, vẫn dùng được.

---
**Ghi chú các điểm chưa xác minh:**
- Chưa có gợi ý tên topic trong code (CL-53).
- Chưa rõ màn Focus có bị push 2 lần khi double-tap không (CL-73).
- Chưa rõ thông báo có hiện khi app đang ở foreground không (CL-108).
- Bản nháp note mất khi bấm Back (CL-140).
- UI cụ thể khi phiên bị `session_overlap` (CL-127).

**File nguồn chính:**
- Timer và Focus: `focus-forest-mobile/src/focus/{StartFocus,DurationSheet,FocusScreen}.tsx`, `focus/duration.ts`, `timer/timer-engine.ts`
- Thông báo: `notifications/timer-notifications.ts`
- Topics: `topics/{TopicsScreen,TopicSheets}.tsx`, `topics/topic-form.ts`
- Phiên, note, Completion: `sessions/session-outbox.ts`, `completion/CompletionScreen.tsx`, `sessions/session-note.ts`
- Home, History, Insights: `core-loop/{HomeScreen.tsx,presentation.ts}`, `history/{HistoryScreen.tsx,history-format.ts}`, `insights/{InsightsScreen.tsx,insights-format.ts}`
- API: `focus-forest-api/src/sessions/evaluation/evaluate-session.ts`, `sessions/dto/session.dto.ts`, `topics/topic-fields.ts`, `home/home.controller.ts`
## 3. Cây, mục tiêu, streak, ngày nghỉ, tiến trình

### 3.0 Cách giả lập thời gian

Server không có "time travel" trong runtime. `Clock` luôn là `SystemClock` (`/Users/bill/Documents/self-learning/prompt-RN/focus-forest-api/src/common/clock.ts`) và không có biến môi trường nào để đặt giờ giả. `FixedClock` và `MonthSimulation` (`/Users/bill/Documents/self-learning/prompt-RN/focus-forest-api/test/support/month-simulation.ts`, `consistency-harness.ts`) chỉ chạy trong vitest integration (`npm run test:int`, DB `focus_forest_test`). Chúng tự chặn khi `NODE_ENV=production` và không nối được với app trên điện thoại. Tester có các cách thực tế sau:

1. **Đổi giờ hệ thống của máy Mac chạy API** (`npm run start:dev`). "Now" của server sẽ đổi theo, kéo theo ngày local, streak, đóng tháng và grace period. Điện thoại cũng phải chỉnh cùng giờ: server từ chối session kết thúc muộn hơn giờ server quá 2 phút ("The session ends in the future."). Token có thể hết hạn khi nhảy giờ, khi đó đăng nhập lại. (chưa xác minh end-to-end)
2. **Gửi session lùi ngày qua API**: `POST http://<LAN-IP>:3000/auth/sign-in` để lấy accessToken, rồi gọi `PUT /me/sessions/<uuid mới>` với body `{topicId, startedAt, endedAt, plannedMinutes, pauseIntervals: []}` (ISO time).
   - Không có giới hạn quá khứ. Server chỉ cấm session ở tương lai (quá 2 phút) và session chồng lên session khác.
   - Session từ 5 phút trở lên mới được tính (counted).
   - Ngày của session là ngày local **lúc bắt đầu**, theo time zone của tháng.
   - Session thuộc tháng đã đóng vẫn được lưu nhưng không làm cây lớn.
   - Đây là cách dựng lịch sử streak, vitality và badge nhanh nhất.
3. **Sửa DB** (Postgres docker `postgresql://focus_forest:focus_forest@localhost:5432/focus_forest`, hoặc `npm run prisma:studio`). Dùng khi API không cho làm:
   - `rest_days`: rest day trong quá khứ (API từ chối ngày đã qua).
   - `daily_goal_settings.effective_from` và `weekly_goal_settings`: goal áp dụng lùi ngày.
   - `users.created_at`: lùi về trước ngày 1 để tránh proration tháng đầu.
   - `month_attribution_contexts.ends_at`: đặt về hơn 3 giờ trước để tháng bị đóng ở lần mở Home kế tiếp.
   - Có thể vướng ràng buộc hoặc trigger. (chưa xác minh)
4. **Admin app** (`focus-forest-admin`; tạo tài khoản bằng `npm run admin:create` sau khi build API):
   - **Config → Propose a version → Activate** (cần lý do). Đổi được `session.monthGraceMinutes` (đặt 0 thì ceremony có ngay sau nửa đêm), `restDay.maxPerWeek`, `restDay.allowSameDay`, `recovery.limit.perMonth`, `recovery.mechanics.nextDaySession.minPreviousStreak`, `goal.dailyDefaultMinutes`.
   - Activate không hồi tố. Cây tháng giữ config version mà nó đã lớn theo, nên ngưỡng growth/vitality mới chỉ áp cho cây tháng sau. (vitality: chưa xác minh)
   - **Content → Achievements**: hạ `target` để thử badge nhanh. Chỉ sửa được khi chưa ai sở hữu badge đó; khi đã có người sở hữu thì target bị khoá.
   - **Users → user → compensation grant**: tặng badge, cosmetic hoặc species.
5. **Đổi giờ điện thoại** chỉ đổi ánh sáng cảnh (dawn 05–08, day 08–17, golden 17–19, dusk 19–21, còn lại là night). Nó không đổi "hôm nay" của server.

**Mẹo đọc trạng thái cây:** bật TalkBack, chạm vào cây. Mô tả đọc ra gồm: tháng, species (nếu không phải Signature), stage, "Airy/Light/Filling/Full canopy." (chỉ từ Young Tree trở lên), "Blossoms at level X of 7.", "Richness tier X of 5.", tên milestone, và vitality ("Thriving." / "Healthy." / "Stable." / "Resting quietly." / "Waking up."). Cây đã archive đọc "At rest.".

**Cấu hình mặc định** (migration, khớp `test/support/product-config-values.ts`):
- Session counted từ 5 phút; pause tối đa 30 phút.
- Stage tính theo growth tích luỹ: Young 120, Growing 360, Mature 720, Blooming 1200, Final Form 1800 phút. Session counted đầu tiên luôn đưa cây lên Sprout.
- Soft cap 240 phút/ngày; phần vượt chỉ tính 40%.
- Tháng đầu được prorate theo (số ngày còn lại, tính cả ngày join) / số ngày của tháng, sàn 25%.
- Fullness: 60% từ active days (mục tiêu 24 ngày) và 40% từ weekly consistency (3 active days/tuần). Các level bắt đầu ở 15/35/55/75/95%.
- Blossom: daily goal = 1 điểm, weekly goal = 2 điểm. Ngưỡng 1/3/6/10/15/21/28.
- Richness: vượt Final Form thêm 180/360/600/900/1260 phút.
- Trait theo giờ focus: 10/25/40 giờ trong tháng.
- Vitality: Thriving khi có run 2 active days, hoặc đạt daily goal 3 trong 4 ngày gần nhất. Healthy khi 1 ngày không focus, Stable khi 2, Quiet khi từ 3 trở lên.
- Daily goal mặc định 30 phút.
- Rest day: tối đa 2/tuần (thứ Hai–Chủ nhật), được đặt cho chính hôm nay.
- Streak milestones: 3/7/14/30/60/100.
- Recovery cần streak trước đó ≥3, tối đa 1 lần/tháng.
- Grace 180 phút.
- Forest level bắt đầu ở 1/3/6/12/24 cây. Lake mở ở level 2.

---

### 3.0b Art cây (ART.10, 2026-10-20)

- [ ] **AR-1** Home với cây từ Young Tree trở lên, ban ngày → **Mong đợi:** tán cây là **một khối liền** (không phải các cục rời), phía trên bên trái sáng hơn phía dưới bên phải; giữa các cụm là lá tối, không lộ trời; viền cụm mảnh, không đậm như tô màu.
- [ ] **AR-2** Thân cây → **Mong đợi:** phần trên thân tối hơn (bóng tán đổ xuống), phần dưới sáng.
- [ ] **AR-3** Gốc cây đã lớn → **Mong đợi:** ụ đất chủ yếu là cỏ, có các bụi cỏ nhỏ quanh gốc. Hạt giống và mầm vẫn là ụ đất nâu.
- [ ] **AR-4** Trời ban ngày, bình minh, hoàng hôn → **Mong đợi:** có 2 đám mây mờ ở phía không có mặt trời; có dãy đồi xa mờ sau đồi gần. Ban đêm không có mây.
- [ ] **AR-5** Đổi loài cây (Pine, Sakura…) → **Mong đợi:** bóng tối của tán theo đúng dáng loài (thông thon dài), không có hình bầu dục tối lộ ra quanh tán.
- [ ] **AR-6** Màn Home, Focus, Forest cuộn nhanh trên máy tầm trung → **Mong đợi:** cây vẫn mượt, không giật hơn trước.

### 3.1 Onboarding sau sign-up

- [ ] **TR-1** Sign up tài khoản mới → **Mong đợi:** onboarding mở một lần. Màn "Your seed is planted", câu "This is this month's tree. Each focus session helps it grow, and when the month ends it joins your forest.", cây Seed, nút "Continue".
- [ ] **TR-2** Sign up vào một ngày không phải ngày 1 (ví dụ hôm nay 19/10) → **Mong đợi:** có thêm dòng "This month’s tree starts today.". Sign up đúng ngày 1 (đổi giờ Mac) thì không có dòng này.
- [ ] **TR-3** Bấm Continue → **Mong đợi:** màn "A daily goal" có "A gentle target for each day. Reaching it opens blossoms on your tree." và "Suggested: 30 min. You can change it anytime.". Có preset 15/30/45/60/90/120 và "Custom", 30 được chọn sẵn, nút "Set my daily goal", nút "Skip for now".
- [ ] **TR-4** Chọn 45 → "Set my daily goal" → **Mong đợi:** sang "Your first session" với status "Your daily goal is 45 min, starting today.". Goals screen hiện "45 min a day" và không còn "Suggested to start…".
- [ ] **TR-5** Bấm "Skip for now" → **Mong đợi:** "Your first session" không có status. Profile → "Goals and rest days" hiện "30 min a day" kèm "Suggested to start. Save it to make it your goal." (không có goal nào được lưu).
- [ ] **TR-6** Custom nhập 0, 1441, "abc", rồi 1, rồi 1440 → **Mong đợi:** ba giá trị đầu báo "Enter whole minutes from 1 to 1440." và không gửi đi. 1 và 1440 lưu được.
- [ ] **TR-7** Tắt mạng trước khi tới bước goal → **Mong đợi:** "Daily goals load when you're online." / "You can set one later in Profile." / "Try again". "Skip for now" vẫn bấm được. Nếu mất mạng đúng lúc Save: "You're offline, so nothing was changed. Connect and try again."
- [ ] **TR-8** Kill app ở bước goal rồi mở lại → **Mong đợi:** quay lại đúng "A daily goal", không về bước seed. Kill ở "Your first session" → mở lại vẫn ở bước đó.
- [ ] **TR-9** Ở "Your first session" ("A short session is an easy start. Your tree grows from the first one."), bấm Start focus → **Mong đợi:** onboarding được đánh dấu xong ngay trước khi Focus mở. Kill rồi mở lại thì không thấy onboarding nữa. Nút "Go to Home" cũng kết thúc onboarding vĩnh viễn.
- [ ] **TR-10** Sign in một tài khoản cũ, hoặc user B trên cùng máy → **Mong đợi:** không có onboarding, trạng thái onboarding của A không lẫn sang B.

### 3.2 Cây tháng: stage và growth

- [ ] **TR-11** Tài khoản chưa focus mở Home → **Mong đợi:** tiêu đề "This month", cây Seed, ring "Daily goal" "0 / 30 min", "Focus today to start a streak", "This week: no focus yet", nút "Tree details".
- [ ] **TR-12** Session End sớm ở 4 phút → **Mong đợi:** "Focus session saved" và "This session was shorter than the minimum for counted focus time.". Cây vẫn Seed, streak không đổi.
- [ ] **TR-13** Session counted 5 phút → **Mong đợi:** Completion có phản ứng của cây và caption "Your tree became a Sprout.". Tree Details headline "Sprout · growing toward Young Tree".
- [ ] **TR-14** Tháng đầy đủ (user có `created_at` trước ngày 1): đẩy growth lên 89, rồi 90, rồi 119, rồi 120 phút → **Mong đợi:** 89 hiện "Sprout · growing toward Young Tree". 90 (≥75%) hiện "Sprout · almost a Young Tree". 119 vẫn Sprout. 120 có caption "Your tree became a Young Tree.". Tương tự ở 360 (Growing Tree), 720 (Mature Tree), 1200 (Blooming Tree), 1800 (Final Form; headline chỉ còn "Final Form", không có hint).
- [ ] **TR-15** Soft cap: A focus 240 phút ngày 1 và 120 phút ngày 2; B focus 360 phút trong một ngày (dùng API backdate) → **Mong đợi:** A đạt Growing Tree (growth 360). B chỉ là Young Tree (240 + 40%×120 = 288). Tree Details của B vẫn hiện "6 h focused" vì số phút thật không bị giảm. (chưa xác minh chuỗi "6 h focused")
- [ ] **TR-16** Session đầu tiên dài 125 phút → **Mong đợi:** chỉ một khoảnh khắc với caption "Your tree became a Young Tree.". Không phát hai animation stage liên tiếp.
- [ ] **TR-17** Proration: sign up 19/10/2026 (13/31 ngày còn lại) → **Mong đợi:** Young Tree ở khoảng 50 phút 20 giây growth: session 50 phút vẫn Sprout, 51 phút lên Young Tree. Các mốc sau khoảng 151 / 302 / 504 / 755 phút. Sign up từ 25/10 (≤7 ngày còn lại) thì dùng sàn 25%: 30 / 90 / 180 / 300 / 450 phút.
- [ ] **TR-18** Admin activate config có ngưỡng stage cao hơn giữa tháng → **Mong đợi:** cây tháng này giữ nguyên stage và ngưỡng cũ. Cây tháng sau mới dùng ngưỡng mới. Không thông số nào của cây bị giảm.

### 3.3 Fullness, blossoms, richness, milestone traits

- [ ] **TR-19** User đã Skip goal (chỉ có mặc định 30) focus 30 phút → **Mong đợi:** Home hiện "Goal reached · 30 / 30 min" và "You reached today's goal.". Nhưng Tree Details vẫn "Daily goals met: 0" và không có blossom, vì goal mặc định không được tính là lịch sử. Lưu goal lần đầu trong cùng ngày thì goal áp dụng cho hôm nay; lần đọc sau cây có blossom level 1. (Lần đọc đó có celebration hay không: chưa xác minh)
- [ ] **TR-20** Goal đã lưu 30 phút: session 25 phút, rồi thêm session 5 phút → **Mong đợi:** sau session đầu ring "25 / 30 min". Sau session hai: "Goal reached · 30 / 30 min", "You reached today's goal." (một lần), caption "New blossoms opened.", Tree Details "Daily goals met: 1", TalkBack "Blossoms at level 1 of 7.".
- [ ] **TR-21** Tích luỹ điểm blossom 1, 3, 6, 10… trong tháng đầy đủ → **Mong đợi:** level tăng đúng tại các mốc đó. Tháng đầu prorate 13/31 thì các mốc thành 1/2/3/5/7/9/12.
- [ ] **TR-22** Đạt weekly goal → **Mong đợi:** được +2 điểm blossom, Tree Details "Weekly goals met: 1".
- [ ] **TR-23** Tháng 10/2026 đầy đủ: chỉ có 3 active days, cùng trong tuần 5–11/10, cây ≥ Young Tree → **Mong đợi:** fullness khoảng 15,5% (7,5% + 8%), tức level 1, TalkBack đọc "Light canopy.". Level 0 đọc "Airy canopy.", level 2–3 "Filling canopy.", level 4–5 "Full canopy.". Seed và Sprout không có câu canopy. Khi fullness tăng có dòng phụ "The canopy filled in.".
- [ ] **TR-24** Đẩy growth vượt Final Form thêm 180 phút (tổng ≥1980; cần nhiều ngày vì soft cap) → **Mong đợi:** "Your tree grew richer.", TalkBack "Richness tier 1 of 5.". Cây không to thêm.
- [ ] **TR-25** Đạt 10 / 25 / 40 giờ focus thật trong tháng (không cap, không prorate) → **Mong đợi:** lần lượt "A hanging seedpod for 10 focus hours.", "A heartwood ring for 25 focus hours.", "A golden leaf for 40 focus hours.". Mục "Milestones" của Tree Details liệt kê các dòng này. Khi chưa có gì: "Milestones you reach this month appear here.".
- [ ] **TR-26** Đạt streak 3 / 7 / 14 / 30 → **Mong đợi:** "A hanging bloom for your 3-day streak.", "A songbird's nest for your 7-day streak.", "A ribbon of vines for your 14-day streak.", "A lantern-flower for your 30-day streak.". Streak 60 và 100 hiện "Your tree earned a new milestone detail." và trong danh sách là "N milestone detail(s)" / "N more milestone details".
- [ ] **TR-27** Một session vừa lên stage vừa mở blossom vừa có trait → **Mong đợi:** caption chính là stage. Trait, blossom và canopy chỉ là các dòng chữ phụ, không có animation thứ hai.

### 3.4 Vitality (cây không bao giờ chết)

Mẹo: đặt daily goal cao (ví dụ 120) và dùng session 5–10 phút để chỉ thử quy tắc run.

- [ ] **TR-28** User mới chưa focus → **Mong đợi:** "Healthy.".
- [ ] **TR-29** N1 có session đầu tiên → **Mong đợi:** "Healthy." (run mới 1 ngày).
- [ ] **TR-30** N2 có session → **Mong đợi:** "Thriving." (run 2 ngày).
- [ ] **TR-31** N3 chưa focus, rồi N4 không focus, rồi N5 không focus → **Mong đợi:** lần lượt "Healthy.", "Stable.", "Resting quietly." (Quiet: gần như đứng yên, không gió, không phấn hoa). Stage và kích thước giữ nguyên. Không có lá nâu, héo hay cây xám.
- [ ] **TR-32** N5 (đang Quiet) có focus, N6 focus tiếp → **Mong đợi:** N5 "Waking up." (Recovering), N6 "Thriving.".
- [ ] **TR-33** Active N1 và N2, N3 không focus, N4 focus → **Mong đợi:** "Healthy.", không phải Recovering (khoảng trống chỉ 2 ngày).
- [ ] **TR-34** Rest day: (a) N1 active, N2 rest, N3 focus; (b) N1 active, N2 rest, N3 chưa focus; (c) N1 active, N2 và N3 rest, N4 không focus → **Mong đợi:** (a) "Thriving." vì rest day nối run. (b) "Healthy.". (c) "Healthy." vì rest day không bị tính là ngày bỏ.
- [ ] **TR-35** Goal 10 phút, đạt ở N1, N2, N4 (N3 trống), N4 có focus → **Mong đợi:** N4 "Thriving." dù run chỉ 1 (3/4 ngày đạt goal). Nếu chỉ đạt 2/4 ngày thì "Healthy.".
- [ ] **TR-36** Chấp nhận streak recovery → **Mong đợi:** vitality không đổi. Ngày được recover không tính là ngày active.
- [ ] **TR-37** Cây đã archive (Forest hoặc month details) → **Mong đợi:** "At rest.", không có vitality, thumbnail đứng yên.
- [ ] **TR-38** Focus ngày cuối tháng, mở app ngày 1 tháng mới (Seed) → **Mong đợi:** vitality tính theo toàn bộ lịch sử chứ không reset theo tháng. (chưa xác minh trên UI)
- [ ] **TR-39** Không focus từ 10 ngày trở lên → **Mong đợi:** cây chỉ ở Quiet, không mất stage, blossom hay trait. Không có chữ trách móc, không có màu đỏ.

### 3.5 Tree Details

- [ ] **TR-40** Home → "Tree details" → **Mong đợi:**
  - Tiêu đề là tháng ("October 2026") và headline stage hint.
  - "Species: Signature Tree".
  - Mục "This month": "X focused", "N sessions", "N active days", "Daily goals met: N", "Weekly goals met: N", "Current streak: N days", "Top topic: <tên>".
  - Mục "Milestones".
  - Một Start Focus phụ.
- [ ] **TR-41** Khi số liệu bằng 1 → **Mong đợi:** dùng số ít: "1 session", "1 active day", "Current streak: 1 day".
- [ ] **TR-42** Mở Tree Details khi offline → **Mong đợi:** cây là bản lưu gần nhất, kèm "This month's numbers load when you're online.". Nếu chưa có dữ liệu: "We couldn't load your tree right now." và nút retry.
- [ ] **TR-43** Session dưới 5 phút → **Mong đợi:** không tăng sessions, active days hay focused.
- [ ] **TR-44** Nút "Change species" → **Mong đợi:** chỉ hiện khi server nói được chọn: cây đang là Seed **và** có hơn 1 species chọn được.

### 3.6 Daily goal

- [ ] **TR-45** Profile → "Goals and rest days" → **Mong đợi:** các mục theo thứ tự "Daily goal", "Weekly goal", "Rest days", "Streak".
- [ ] **TR-46** Lưu daily goal lần đầu (45) → **Mong đợi:** "Saved. Your daily goal is 45 min, starting today.". Ring "Today" dùng 45 ngay.
- [ ] **TR-47** Đổi sang 60 khi đã có goal → **Mong đợi:** "Saved. Your goal changes to 1 h tomorrow." và dòng "Changes to 1 h tomorrow.". Ring hôm nay vẫn theo 45. (chưa xác minh định dạng "1 h")
- [ ] **TR-48** Cùng ngày đổi tiếp sang 90 → **Mong đợi:** thay thay đổi đang chờ thành "Changes to 1 h 30 min tomorrow.".
- [ ] **TR-49** Chọn lại 45 (đang áp dụng) → **Mong đợi:** "Saved. Your daily goal stays 45 min.", thay đổi chờ biến mất.
- [ ] **TR-50** Sang ngày hôm sau → **Mong đợi:** goal mới có hiệu lực. Ngày trước vẫn được chấm theo goal cũ; "Daily goals met" không bị tính lại.
- [ ] **TR-51** Custom 0 / 1441 / 1 / 1440 → **Mong đợi:** client báo "Enter whole minutes from 1 to 1440." cho 0 và 1441. Nếu server từ chối: "That goal can't be saved. Choose from 1 to 1440 minutes.".
- [ ] **TR-52** Goal 15, session 14 phút (counted), sau đó thêm 5 phút → **Mong đợi:** "14 / 15 min", rồi "Goal reached · 19 / 15 min".
- [ ] **TR-53** Đạt goal, mở lại Home và Completion nhiều lần → **Mong đợi:** "You reached today's goal." chỉ hiện một lần, ở Completion hoặc Home tuỳ màn nào hiện trước, và không hiện từ Home lưu offline.
- [ ] **TR-54** Lưu daily goal khi offline → **Mong đợi:** "You're offline, so nothing was changed. Connect and try again.".
- [ ] **TR-55** Goal 30, chỉ focus 5 phút → **Mong đợi:** streak vẫn tăng. Mục Streak có dòng "One focus session a day keeps a streak. The daily goal is separate.".

### 3.7 Weekly goal

- [ ] **TR-56** Chưa có weekly goal → **Mong đợi:** "A weekly goal is optional. This week's focus still shows on Home.", nút "Set a weekly goal". Home không có ring "Weekly goal".
- [ ] **TR-57** Set goal: preset "Focus time" 3/5/8/10 h (5 h chọn sẵn) hoặc "Sessions" 3/5/10/15, Save → **Mong đợi:** "Saved. Your weekly goal starts this week." Goal áp dụng cho tuần hiện tại (thứ Hai–Chủ nhật), tính cả focus từ đầu tuần. Ring "This week" dạng "120 / 300 min" và Home có ring "Weekly goal".
- [ ] **TR-58** Custom giờ 0 / 168 / 169; sessions 500 / 501 → **Mong đợi:** giá trị sai báo "Enter a whole number from 1 to 168." hoặc "… 500.". Nếu server từ chối: "That weekly goal can't be saved. Try a smaller number.".
- [ ] **TR-59** Đổi goal khi goal đang có hiệu lực → **Mong đợi:** "Saved. Your new weekly goal starts Monday, October 26." và "From Monday, October 26: 8 h a week.". Tuần này giữ goal cũ.
- [ ] **TR-60** Bấm "End weekly goal" → **Mong đợi:** hộp "End your weekly goal?" / "It stays for this week and ends from next Monday." với nút "End weekly goal" và "Keep it". Xác nhận → "Saved. Your weekly goal ends on Monday, October 26.". Nút End ẩn đi.
- [ ] **TR-61** Sang tuần không còn goal, đặt goal mới → **Mong đợi:** goal áp dụng ngay cho tuần hiện tại.
- [ ] **TR-62** Goal dạng sessions: session <5 phút không tính. Tuần vắt qua hai tháng (28/9–4/10), đạt goal ngày 2/10 → **Mong đợi:** "Goal reached · 5 / 5 sessions". Mỗi tuần chỉ tính đạt một lần, ghi vào tháng của ngày đạt (tháng 10).
- [ ] **TR-63** Xem dòng tuần trên Home → **Mong đợi:** dưới 1 phút focus: "This week: no focus yet". Có focus: "This week: 1 h 5 min focused".

### 3.8 Streak

- [ ] **TR-64** Streak 0 → **Mong đợi:** Home "Focus today to start a streak". Goals "Current streak: 0 days", "One focus session starts a streak.".
- [ ] **TR-65** Sau session counted đầu tiên → **Mong đợi:** Home "1-day streak". Goals "Today counts toward your streak." và "Next milestone: 3 days.".
- [ ] **TR-66** Ngày 2, chưa focus → **Mong đợi:** vẫn "1-day streak" (hôm nay chưa xong thì không làm đứt streak). Goals "One focus session today keeps your streak going.".
- [ ] **TR-67** Đủ 3 ngày liên tiếp → **Mong đợi:** "3-day streak", "Milestones reached: 3 days.", "Next milestone: 7 days.". Có badge "3-Day Streak" và trait trên cây.
- [ ] **TR-68** Bỏ 1 ngày rồi focus lại → **Mong đợi:** Home "Day 1 — welcome back". Goals "Longest streak: 3 days".
- [ ] **TR-69** Nhiều session trong một ngày, hoặc session <5 phút → **Mong đợi:** mỗi ngày chỉ +1. Session <5 phút không tính.
- [ ] **TR-70** Session bắt đầu 23:50 và kết thúc 00:15 → **Mong đợi:** tính cho ngày bắt đầu (local date theo time zone của tháng).

### 3.9 Rest days

- [ ] **TR-71** Mở mục Rest days → **Mong đợi:** câu "A rest day keeps your streak and your tree's vitality. If you focus on a rest day, it still counts, and the day stays a rest day.", dòng "2 of 2 rest days left this week", planner 14 ô (tuần này và tuần sau, thứ Hai–Chủ nhật). Ngày đã qua bị khoá ("This day has passed.").
- [ ] **TR-72** Chọn hôm nay làm rest day → **Mong đợi:** ô được chọn, "1 of 2 rest days left this week". Home "Rest day today · your N-day streak is kept" (hoặc "Rest day today" nếu streak 0). Goals "Rest day today. Your streak is kept.".
- [ ] **TR-73** Chọn rest day thứ 2, rồi thứ 3 trong cùng tuần → **Mong đợi:** sau ngày thứ 2: "This week's rest days are all planned.". Ngày thứ 3: "This week's rest days are already planned. Remove one to choose another day.", không thay đổi gì.
- [ ] **TR-74** Chọn Chủ nhật tuần này và thứ Hai tuần sau → **Mong đợi:** cả hai được, vì mỗi tuần có hạn mức riêng.
- [ ] **TR-75** Bấm lại một rest day của hôm nay hoặc tương lai → **Mong đợi:** huỷ được, hạn mức được trả lại. Rest day đã qua không huỷ được (ô bị khoá).
- [ ] **TR-76** Streak 3, N4 là rest day, N5 focus → **Mong đợi:** "4-day streak". Rest day nối streak nhưng không cộng ngày.
- [ ] **TR-77** Focus vào một rest day → **Mong đợi:** ngày vẫn là rest day, streak không +1. Focus vẫn làm cây lớn và tính goal. Home vẫn hiện dòng "Rest day today · …".
- [ ] **TR-78** Admin đặt `restDay.allowSameDay=false` rồi chọn hôm nay; đặt `maxPerWeek=0` → **Mong đợi:** lần lượt "Today can't become a rest day anymore." và "No rest days are available this week.".
- [ ] **TR-79** Có rest day nằm ngoài 14 ngày của planner (tạo qua API) → **Mong đợi:** hiện dòng "Also planned: <ngày>".
- [ ] **TR-80** Offline → **Mong đợi:** "Planned rest days show when you're online.". Bấm chọn ô khi offline → "You're offline, so nothing was changed. Connect and try again.".

### 3.10 Streak recovery

- [ ] **TR-81** Active N1–N3, N4 bỏ, N5 focus, rồi mở Goals → **Mong đợi:**
  - Card "Want to keep your 3-day streak?" / "You came back after Thursday, October 15. Keeping your streak bridges that day." với nút "Keep my streak".
  - Bấm nút thì mở modal "Keep your 3-day streak?" / "<ngày> will bridge your streak. It adds no focus time or growth. This uses your streak recovery for this month." với nút "Keep my streak" / "Not now".
- [ ] **TR-82** Trước khi chấp nhận, rồi sau khi chấp nhận → **Mong đợi:** trước: Home "Day 1 — welcome back". Sau: "Your streak is kept.", Home "4-day streak". Số liệu Tree Details, goal và growth không đổi.
- [ ] **TR-83** Không chấp nhận, xem lại vào N6 (không cần focus N6) và N7 → **Mong đợi:** N6 vẫn còn offer. N7 offer biến mất.
- [ ] **TR-84** Các trường hợp không có offer: streak trước chỉ 2 ngày; bỏ 2 ngày liên tiếp; ngày bỏ là rest day; ngày quay lại không có session counted → **Mong đợi:** không hiện card.
- [ ] **TR-85** Trường hợp hợp lệ thứ hai, ngày bỏ cùng tháng với lần trước → **Mong đợi:** không có offer (server: "This month’s streak recovery is already used."). Nếu ngày bỏ thuộc tháng khác → có offer lại.
- [ ] **TR-86** Bấm "Not now"; chấp nhận khi offline; chấp nhận khi offer đã hết hạn → **Mong đợi:** "Not now" giữ nguyên card. Offline: "You're offline, so your streak wasn't changed. Connect and try again.". Hết hạn: "Recovery is no longer available.".
- [ ] **TR-87** Recovery làm longest streak chạm 7 → **Mong đợi:** ngay trên Goals hiện "New badge: 7-Day Streak" và "Also unlocked: the Pine tree.". Trait "songbird's nest" xuất hiện trên cây.

### 3.11 Ranh giới tháng và lazy archive

- [ ] **TR-88** Qua 00:00 ngày 1/11 (giờ Mac), trong 3 giờ grace, mở Home → **Mong đợi:** Home hiện Seed mới của tháng 11, chưa có ceremony. Cây tháng 10 vẫn đang mở. (chưa xác minh trên thiết bị)
- [ ] **TR-89** Session bắt đầu 23:50 ngày 31/10, kết thúc 00:15, sync trước 03:00 → **Mong đợi:** cây tháng 10 lớn thêm (tháng tính theo giờ bắt đầu), streak tính ngày 31/10.
- [ ] **TR-90** Sau 03:01 mở Home → **Mong đợi:** tháng 10 được archive, ceremony hiện. Việc archive chỉ xảy ra khi có request (Home, Forest hoặc session), không chạy theo lịch.
- [ ] **TR-91** Session offline của tháng 10, sync sau khi tháng đã đóng → **Mong đợi:** Completion hiện "Saved to October 2026. That month's tree is already resting in your forest.". Không có celebration, Forest và Recap không đổi.
- [ ] **TR-92** Tháng không có session counted (chỉ xem Seed, hoặc chỉ có session <5 phút) → **Mong đợi:** không có cây. Forest hiện ụ rêu; Month details "This was a quiet month in your forest."; không có ceremony.
- [ ] **TR-93** Vắng nhiều tháng (tháng 8 có focus, tháng 9 và 10 trống) → **Mong đợi:** ceremony chỉ cho tháng archive gần nhất có focus. Các tháng trống là marker.
- [ ] **TR-94** Chuyển 12 → 1 → **Mong đợi:** tháng 12 đóng sang năm mới, Forest có year marker.
- [ ] **TR-95** Admin đặt `session.monthGraceMinutes=0` → **Mong đợi:** archive và ceremony ngay sau nửa đêm.
- [ ] **TR-96** Sau archive, thêm session muộn hoặc đổi goal → **Mong đợi:** cây và số liệu archive không đổi.
- [ ] **TR-97** Sang tháng mới → **Mong đợi:** cây Seed, species về Signature Tree. Streak và goal vẫn tiếp tục (không reset theo tháng).

### 3.12 Time zone

- [ ] **TR-98** Sign up → **Mong đợi:** profile nhận time zone của thiết bị. Nếu profile thiếu time zone, session đầu tự sửa (PATCH profile) và vẫn lưu. API goal/streak khi thiếu tz báo "Set your time zone to use goals and streaks.".
- [ ] **TR-99** Đổi time zone giữa tháng qua `PATCH /me/profile {timezone}` (app không có UI cho việc này, chưa xác minh) → **Mong đợi:** tháng hiện tại giữ time zone đã chốt ("today", nửa đêm, lúc hết tháng). Time zone mới chỉ áp cho tháng sau. Ví dụ đổi HCM → New York: tháng 9 kết thúc lúc 17:00Z ngày 30/9. Session lúc 20:00Z (vẫn 30/9 ở New York) được tính vào tháng 10 với local date 2026-09-30.
- [ ] **TR-100** Chỉ đổi time zone trong Android Settings → **Mong đợi:** "today" của server không đổi; chỉ ánh sáng cảnh đổi theo giờ máy. (chưa xác minh)
- [ ] **TR-101** User sign up ngay trước hoặc sau nửa đêm UTC nhưng khác ngày theo giờ local → **Mong đợi:** proration dùng ngày join theo time zone của tháng.

### 3.13 Planting ceremony

- [ ] **TR-102** Ceremony bắt đầu → **Mong đợi:** "Your October tree is ready to be planted." với nút "Plant in your forest" và "Skip".
- [ ] **TR-103** Bấm "Plant in your forest" → **Mong đợi:** cây lắng xuống khoảng 3 giây, rồi "A new seed for November." và "Your October tree now rests in your forest.", nút "View recap" và "Not now".
- [ ] **TR-104** Kill app trước bước Seed mới → **Mong đợi:** mở lại thấy ceremony lại. Đã tới bước Seed hoặc đã Skip → không bao giờ hiện lại.
- [ ] **TR-105** Ceremony trùng với growth moment hoặc unlock → **Mong đợi:** ceremony đợi chúng xong. Không bao giờ hiện khi focus đang chạy hoặc pause. Tối đa một lần mỗi lần mở app.
- [ ] **TR-106** Bật Reduce Motion → **Mong đợi:** chuyển bước trực tiếp, không có animation.

### 3.14 Monthly recap

- [ ] **TR-107** Mở recap → **Mong đợi:**
  - Có "Page 1 of N".
  - Các trang theo thứ tự: "Your month in focus." → "Total focus" → "Sessions and active days" ("12 sessions over 8 active days") → "Top topic" → "Longest streak" → "Your best day" ("Monday, October 12 · 2 h 5 min") → "Your best week" ("Week of …") → badges → records ("Most focused day: …") → "Highlighted note(s)" → trang Share.
  - Nút "Next", "Back", "Close". Trang cuối có "Share" và "Go to Forest".
- [ ] **TR-108** Tháng không có topic hoặc longest streak bằng 0 → **Mong đợi:** không có trang tương ứng, không có câu kiểu "bạn thiếu…".
- [ ] **TR-109** Share → **Mong đợi:** thẻ có tháng, cây, stage, "X of focus", active days, "Longest streak: N days". Không có note hay topic. Không share được thì báo "Sharing isn't available right now.".
- [ ] **TR-110** Highlight note bằng "Highlight in monthly recap" trước khi tháng đóng, rồi sau đó sửa note → **Mong đợi:** recap giữ đúng note lúc archive. Badge kiếm sau khi đóng tháng không thêm vào recap.

### 3.15 Forest screen

- [ ] **TR-111** Tài khoản chưa có cây nào được trồng → **Mong đợi:** dòng "0 trees planted", empty state "Your forest begins when this month's tree is planted." với nút "See this month's tree".
- [ ] **TR-112** Có tháng đã archive → **Mong đợi:** header "75 h 30 min of focus · 3 trees planted" (1 cây thì "1 tree planted"). Landscape: mép đang mọc ghi "Now", các tháng "Sep"…, có year marker, tháng nghỉ là ụ rêu, thumbnail đứng yên.
- [ ] **TR-113** Chuyển "List view" / "Landscape view", bật TalkBack, cuộn tới cuối → **Mong đợi:**
  - List chia nhóm theo năm.
  - TalkBack đọc "October 2026, growing now, Sprout, 2 hours 35 minutes focused so far". Tháng nghỉ đọc "…, a quiet month, …".
  - List có "Show earlier months". Lỗi tải: "Earlier months couldn't load right now." với "Try again".
- [ ] **TR-114** Chạm "Now", rồi chạm một tháng đã archive → **Mong đợi:**
  - "Now" mở Tree Details hiện tại.
  - Tháng archive mở màn có "The month", focused, sessions, active days, "Top topic: …", "Longest streak: …", "Daily goals met", "Weekly goals met", "Highlighted notes", "Badges earned", "View recap".
  - Cây ở trạng thái "At rest" và không có trang trí garden.
- [ ] **TR-115** Sau khi trồng cây đầu tiên → **Mong đợi:** hồ (lake) xuất hiện (forest level 2). Tháng nghỉ không được tính. Các vùng khác (mountains ở 3 cây, night 6, seasonal 12, decorations 24) app chưa vẽ. (chưa xác minh)

### 3.16 Chọn species đầu tháng

- [ ] **TR-116** User mới chỉ có Signature → **Mong đợi:** Home không có nút "Choose this month's tree". Tree Details hiện "Species: Signature Tree", không có "Change species".
- [ ] **TR-117** Session counted đầu tiên → **Mong đợi:** "New badge: First Session" và "Also unlocked: the Oak tree.". Tháng này không chọn được nữa vì cây đã qua Seed.
- [ ] **TR-118** Tháng sau (cây Seed), hoặc admin grant species khi cây còn Seed → Home → "Choose this month's tree" → Choose Oak → **Mong đợi:** mỗi loài có preview Seed và Final Form, rồi hiện "This month's tree is an Oak.". Tree Details "Species: Oak". Đổi lại được khi còn Seed.
- [ ] **TR-119** Sau session counted đầu tiên của tháng → **Mong đợi:** nút chọn ẩn. Màn species hiện "This month's tree is growing as an Oak. You can choose again next month.". Nếu tranh chấp: "This month's tree has already started growing. You can choose again next month.".
- [ ] **TR-120** Session <5 phút → **Mong đợi:** không khoá species. Chọn species khi offline → "Choosing a species needs a connection. Nothing was changed.".
- [ ] **TR-121** So sánh Oak với Signature cùng lượng focus → **Mong đợi:** ngưỡng giống hệt nhau. Cây đã archive giữ species của nó. Tháng chọn species nhưng không focus thì vẫn thành tháng nghỉ.

### 3.17 Badges, achievements, showcase

Catalog: First Session (1 session), 10/50/100/500 Hours (600/3000/6000/30000 phút), 3/7/30/100-Day Streak (theo longest streak), Early Bird, Night Owl, Weekend Warrior, First Focus Together, Focus Buddy, Community Contributor. Phần thưởng đi kèm:
- First Session → Oak
- 10 Hours → Sakura
- 7-Day Streak → Pine
- 50 Hours → Maple, Stone Lantern
- 30-Day Streak → Bonsai, Twig Frame
- 100 Hours → Fantasy Tree, Misty Hills
- 500 Hours → Golden Sakura
- 100-Day Streak → Ancient Pine

- [ ] **TR-122** User chưa có badge → **Mong đợi:** Profile không có hàng "Achievements" và không có showcase. Hai thứ này chỉ hiện sau badge đầu tiên.
- [ ] **TR-123** Mở Achievements → **Mong đợi:**
  - Mục "Showcase" với "Pin up to 3 badges to show them here.".
  - Các nhóm "Focus", "Consistency", "Time of day", "Social", "Events", "Rare".
  - Mục "In progress" dạng "3.5 / 10 h" (giờ làm tròn xuống 1 chữ số), "3 / 7 days", "2 / 10 sessions", "1 / 4 weekends". First Session không hiện tiến độ.
- [ ] **TR-124** Tổng 599 phút, rồi 600 phút → **Mong đợi:** 599 chưa có badge, 600 có "10 Hours" và "Also unlocked: the Sakura tree.".
- [ ] **TR-125** Có streak 7 trước đây, đã đứt → **Mong đợi:** badge 7-Day Streak vẫn còn (tính theo longest streak).
- [ ] **TR-126** Early Bird (hạ target qua admin hoặc dùng API backdate) → **Mong đợi:** session bắt đầu 06:59 giờ local được tính. 07:00 hoặc session <5 phút không tính. Tiến độ là "x / 10 sessions".
- [ ] **TR-127** Night Owl → **Mong đợi:** 22:00 hoặc 23:50 được tính, 21:59 không tính.
- [ ] **TR-128** Weekend Warrior → **Mong đợi:** chỉ tính khi có focus cả thứ Bảy lẫn Chủ nhật ngay sau đó. 4 cuối tuần không cần liên tiếp. Chỉ thứ Bảy, hoặc Chủ nhật + thứ Bảy tuần sau, không tính. Tiến độ "x / 4 weekends".
- [ ] **TR-129** Giờ của các badge theo thời điểm trong ngày → **Mong đợi:** dùng giờ local theo time zone của tháng, không theo giờ điện thoại.
- [ ] **TR-130** Showcase: Pin 3 badge, thử Pin cái thứ 4, đổi thứ tự, Unpin, thử khi offline → **Mong đợi:** nút Pin thứ 4 bị khoá với "Your showcase holds 3 badges. Unpin one to pin another.". "Earlier" / "Later" đổi thứ tự; "Unpin" bỏ ghim; Profile hiện đúng thứ tự. Offline: "Changing your showcase needs a connection. Nothing was changed.".
- [ ] **TR-131** Một session mở khoá nhiều thứ → **Mong đợi:** badge hiếm nhất được nêu trong "New badge: X". Phần còn lại gộp một dòng, ví dụ "Also unlocked: the 10 Hours badge, the Maple tree, and Stone Lantern.".

### 3.18 Thời điểm unlock (chỉ sau session)

- [ ] **TR-132** Vượt ngưỡng badge hoặc stage trong lúc focus đang chạy hoặc pause → **Mong đợi:** không có badge, khoảnh khắc cây, "goal reached" hay ceremony nào hiện. Focus là toàn màn hình.
- [ ] **TR-133** Kết thúc session → **Mong đợi:** Completion cho cây phản ứng trước, rồi badge fade và scale vào một lần. Không confetti, không lặp. Reduce Motion chỉ fade.
- [ ] **TR-134** Mở lại Completion từ History hoặc quay về Home → **Mong đợi:** không phát lại animation, chỉ mô tả tĩnh.
- [ ] **TR-135** Session offline sync sau, trong khi có ceremony đang chờ → **Mong đợi:** Home phát lần lượt growth moment, unlock, rồi ceremony, không chồng lên nhau. Gửi lại cùng session không thưởng hai lần.

### 3.19 Collection Book, cosmetics, garden

- [ ] **TR-136** Forest → "Collection Book" → **Mong đợi:** các mục "Trees", "Badges", "Garden and profile", mỗi mục có "N of M in your collection". Món chưa có hiện dạng silhouette, không có phần trăm hay đếm ngược.
- [ ] **TR-137** Mở một món chưa có → **Mong đợi:** gợi ý "Comes with the 10 Hours badge: 10 hours of counted focus." kèm tiến độ "x / 10 h". Món từ event: "Comes from an event.". Món từ season: "Comes with a season.".
- [ ] **TR-138** Mở các món đã có → **Mong đợi:**
  - Signature, Meadow, Mossy Stones: "Part of every forest.".
  - Món kiếm được: "In your collection.".
  - Món limited: "… A limited reward, yours to keep.".
  - Species tháng này: "Growing this month".
  - Badge đang ghim: "On your showcase".
- [ ] **TR-139** Stone Lantern (cần 50 Hours hoặc admin grant): bấm "Use in your garden" → **Mong đợi:** "In your garden" và nút "Stop using". Home hiện lồng đèn ngay. Lồng đèn chỉ quanh cây tháng hiện tại, không có ở thumbnail Forest, cây archive hay recap.
- [ ] **TR-140** Đổi background Meadow ↔ Misty Hills; Twig Frame "Use on your profile" → **Mong đợi:** mỗi slot chỉ một món. Khung chỉ hiện ở Profile.
- [ ] **TR-141** Đổi trang bị khi offline → **Mong đợi:** "Changing your garden needs a connection. Nothing was changed." (hoặc "…your profile…"). Trang bị không làm đổi cây hay forest level.

### 3.20 Seasons và hemisphere

- [ ] **TR-143** Admin bật một seasonal theme (Live → themes) → **Mong đợi:** lớp overlay nằm sau cây trên Home. Stage và các level của cây không đổi. (chưa xác minh)

### 3.21 Offline và những điều KHÔNG được xảy ra

- [ ] **TR-144** Offline mở Home → **Mong đợi:** "Showing your tree as last saved on this device.". Không hiện "You reached today's goal." từ dữ liệu lưu. Goals: "Showing your goals as last saved on this device.".
- [ ] **TR-145** Focus khi offline → **Mong đợi:** "Focus session finished" / "Saved on this device. Your tree and progress update once it syncs.". Cây chỉ lớn sau khi sync, celebration một lần.
- [ ] **TR-146** Kiểm tra tổng quát → **Mong đợi:**
  - Cây không bao giờ chết, héo, nâu, nhỏ lại hay mất stage.
  - Không có chữ trách móc.
  - Ngày recover không thêm phút, goal hay growth.
  - Sửa config hay trang bị không làm thay đổi cây đã archive.
## 4. Together: bạn bè, quyền riêng tư, phòng, thử thách, sự kiện

### 4.0 Chuẩn bị

- **Thiết bị và tài khoản:**
  - **A**: điện thoại Android thật.
  - **B**: emulator hoặc máy thứ 2.
  - **C**: tài khoản thứ 3, không bắt buộc. Cần cho các ca có từ 3 người (block trong phòng, thử thách nhóm, team). C có thể đăng nhập lần lượt trên máy B.
  - Mọi tài khoản cần có ít nhất 1 Topic. Lobby chỉ cho bấm `I'm ready` khi đã chọn topic.
  - Đặt time zone cho từng tài khoản. Thử thách và bảng xếp hạng sự kiện đều cần time zone (`timezone_required`).
- **Đặt username:** vào Profile → Edit profile → ô `Username` → `Save`.
- **Biến A và B thành bạn:**
  - A vào Together → `Find people` → gõ username của B → mở B → `Follow`.
  - B làm ngược lại với A.
  - Khi đó dòng phụ hiện `@x · Friends`. "Friends" nghĩa là hai người follow nhau (mutual). Follow không cần ai duyệt.
- **Admin web:**
  - Tạo staff: `ADMIN_PASSWORD=… npm run admin:create -- --email ops@example.com --role admin` (chạy trong focus-forest-api, cần `npm run build` trước).
  - Chạy `npm run dev` trong focus-forest-admin, mở http://localhost:3001.
  - Menu và quyền:
    - `Reports`, `Rooms`: admin, moderator.
    - `Users`: admin, support, moderator.
    - `Live` (Events / Seasonal themes / Leaderboards), `Integrity`: admin, content.
    - `Configuration`: admin, support.
- **Cấu hình mặc định (API product config):**
  - Giới hạn tần suất:

    | Hành động | Giới hạn |
    |---|---|
    | reports | 20 / 24 giờ |
    | follows | 200 / giờ |
    | reactions | 300 / giờ |
    | invites (dùng chung cho mời vào phòng, mời vào thử thách và **tạo** thử thách) | 50 / giờ |
    | roomCodes | 20 / giờ |
    | search | 120 / giờ |

  - Phiên tập trung: `session.minValidMinutes` = 5, `session.maxPauseMinutes` = 30.
  - Thông báo:
    - Mọi loại thông báo đều TẮT mặc định.
    - Tối đa 2 thông báo "không yêu cầu" mỗi ngày.
    - Chỉ gửi trong khung 9:00–21:00 giờ địa phương.
    - `eventEndingSoonHours` = 48.
  - Bảng xếp hạng: trọng số 30/30/20/20 (consistency / goals / activeDays / focusTime), mỗi ngày tính tối đa 120 phút.
  - Integrity: xét 28 ngày gần nhất; ngày > 960 phút; nộp trễ > 72 giờ; tăng đột biến khi tuần ≥ 5 lần mức thường **và** ≥ 600 phút.
  - Muốn thử giới hạn tần suất nhanh: Admin → `Configuration` → `Propose a version` (giảm `rateLimit.*`) → Review → Activate. Thời gian cache cấu hình phía API (chưa xác minh).
- **Khi bị giới hạn (429):**
  - Server trả `Too many attempts. Please wait a little and try again.` (code `rate_limited`, có header Retry-After).
  - Mỗi màn hình mobile hiển thị câu riêng của nó (ghi rõ ở từng ca bên dưới).
- **Mất mạng:** bật chế độ máy bay.

---

### 4.1 Tab Together (tổng quan)

- [ ] **SO-1** Mở app bằng tài khoản mới chưa có username → vào tab Together → **Mong đợi:**
  - Tiêu đề `Together`.
  - Có thẻ `Choose a username so friends can find you.` với nút `Choose a username`. Bấm nút mở Edit profile.
- [ ] **SO-2** Xem thứ tự các phần trên tab → **Mong đợi:**
  - Theo thứ tự: thẻ cảnh báo của moderator (nếu có), thẻ username (nếu chưa có), nút `Find people`, chip `Following` / `Followers`, danh sách người, phần `Focus rooms`, phần `Challenges`, phần `Events` (chỉ hiện khi có sự kiện), dòng `Leaderboards` (phụ đề `Friends first, fair scores, opt-in`), phần `Reactions` (chỉ hiện khi đã nhận reaction).
  - Tab Together nằm giữa Forest và Insights.
- [ ] **SO-3** Tài khoản chưa follow ai, chip `Following` → **Mong đợi:** Empty state `Follow friends to visit their forests.` kèm nút `Find people`.
- [ ] **SO-4** Chip `Followers` khi chưa ai follow → **Mong đợi:** `Followers will appear here when someone follows you.`
- [ ] **SO-5** Khi lỗi tải danh sách (tắt backend hoặc mất mạng) → **Mong đợi:**
  - `We couldn't load the people you follow right now.` (hoặc `We couldn't load your followers right now.`), có nút thử lại.
  - Lúc đang tải hiện skeleton "Loading people".
- [ ] **SO-6** Dòng người trong danh sách → **Mong đợi:**
  - Tiêu đề là display name. Không có display name thì hiện `@username`; không có cả hai thì `Someone`.
  - Phụ đề là `@username · Friends`, `@username · Follows you`, hoặc chỉ `@username`.
  - Bấm vào thì mở profile người đó.
- [ ] **SO-7** Có hơn 50 người follow/được follow → **Mong đợi:** Mỗi trang 50 người, có nút `Show more`. Thứ tự mới nhất trước.

### 4.2 Username (định dạng, duy nhất, hoa/thường)

- [ ] **SO-8** Edit profile, ô `Username`, nhập `ab` → **Mong đợi:** Lỗi ngay trên form: `Use 3 to 20 letters, numbers, or underscores.`
- [ ] **SO-9** Nhập `a-b`, `a b`, `tên` (ký tự ngoài `[A-Za-z0-9_]`) → **Mong đợi:** Cùng lỗi `Use 3 to 20 letters, numbers, or underscores.`
- [ ] **SO-10** Gõ quá 20 ký tự → **Mong đợi:** Ô nhập chặn ở 20 ký tự (maxLength 20).
- [ ] **SO-11** Nhập `Ada_Test1` rồi `Save` → **Mong đợi:**
  - Lưu thành công, username lưu dạng chữ thường `ada_test1`.
  - Helper đổi thành `Friends find you by this name.`
  - Thẻ "Choose a username" trên Together biến mất.
- [ ] **SO-12** Đặt các tên dành riêng: `admin`, `Admin`, `moderator`, `mod`, `support`, `help`, `staff`, `team`, `official`, `system`, `root`, `focusforest`, `focus_forest`, `forest` → **Mong đợi:** `That username is reserved. Try another one.`
- [ ] **SO-13** B đặt `ADA_TEST1` trong khi A đã có `ada_test1` → **Mong đợi:** `That username is taken. Try another one.` Kiểm tra trùng không phân biệt hoa/thường.
- [ ] **SO-14** A đổi `ada_test1` thành `ada_new`, sau đó B đặt `ada_test1` → **Mong đợi:** Thành công, vì đổi tên sẽ giải phóng tên cũ.
- [ ] **SO-15** A lưu lại đúng username hiện tại → **Mong đợi:** Không lỗi. Client không gửi trường username vì không đổi.
- [ ] **SO-16** Xoá trống ô Username rồi `Save` → **Mong đợi:** Username giữ nguyên. Ô trống nghĩa là "không đổi"; username đổi được nhưng không xoá được.
- [ ] **SO-17** Lỗi mạng khi lưu → **Mong đợi:** `We couldn't reach Focus Forest. Check your connection and try again.`

### 4.3 Tìm người (Search)

- [ ] **SO-18** Together → `Find people` → **Mong đợi:**
  - Màn `Find people`, ô `Username`, helper `Search by the username your friend chose.`
  - Bàn phím không tự viết hoa, không tự sửa. Ô trống thì không hiện gì.
- [ ] **SO-19** Gõ một phần đầu (ví dụ `ad`) → **Mong đợi:**
  - Tìm theo tiền tố username.
  - Khớp chính xác đứng đầu, còn lại theo thứ tự chữ cái. Tối đa 20 kết quả, không phân trang.
- [ ] **SO-20** Gõ chữ hoa `ADA` → **Mong đợi:** Ra cùng kết quả như `ada` (app tự chuyển sang chữ thường).
- [ ] **SO-21** Gõ đúng username của chính mình → **Mong đợi:** Không thấy chính mình. Nếu không còn ai khác: `No one has that username yet.`
- [ ] **SO-22** Gõ tiền tố không ai có → **Mong đợi:** `No one has that username yet.`
- [ ] **SO-23** Gõ ký tự không hợp lệ (`a-`, `a.b`) → **Mong đợi:** Server trả 400 (`Search with 1–20 letters, digits, or underscores.`), app hiện `We couldn't search right now.` kèm nút thử lại.
- [ ] **SO-24** Tìm người chưa đặt username → **Mong đợi:** Không bao giờ xuất hiện.
- [ ] **SO-25** Tìm người đã bị khoá (suspended/banned) → **Mong đợi:** Không xuất hiện.
- [ ] **SO-26** A block B, sau đó cả A tìm B và B tìm A → **Mong đợi:** Cả hai chiều đều không thấy nhau. Block không bao giờ bị lộ.
- [ ] **SO-27** Mất mạng khi tìm → **Mong đợi:** `We couldn't search right now.` kèm thử lại.
- [ ] **SO-28** Giới hạn search 120 lần/giờ: mỗi lần gõ một tiền tố mới là một request (không debounce; tiền tố đã có cache thì không gọi lại) → gõ/xoá liên tục nhiều tiền tố khác nhau cho tới khi vượt → **Mong đợi:** `We couldn't search right now.` (app không có thông báo riêng cho 429). Dễ thử hơn nếu giảm `rateLimit.search` trong admin.

### 4.4 Follow / bạn bè (mutual)

- [ ] **SO-29** A mở profile B (chưa follow) → **Mong đợi:** Nút chính `Follow`. Dòng phụ chỉ có `@b`.
- [ ] **SO-30** A bấm `Follow` → **Mong đợi:**
  - Nút đổi thành `Unfollow` (kiểu secondary).
  - B xuất hiện trong Following của A.
  - Trên máy B, A xuất hiện trong Followers với `@a · Follows you`.
  - Không cần B duyệt.
- [ ] **SO-31** B follow lại A → **Mong đợi:** Cả hai thấy `@x · Friends`. Nội dung để chế độ "Friends" của nhau giờ hiện ra (xem mục 6).
- [ ] **SO-32** Bấm `Follow` nhanh 2 lần hoặc trên 2 máy → **Mong đợi:** Idempotent, không lỗi, không tạo trùng. Nút bị vô hiệu khi đang gửi.
- [ ] **SO-33** A `Unfollow` B → **Mong đợi:**
  - Không có hộp xác nhận. Nút về `Follow`.
  - Quan hệ bạn bè mất. Trên máy B, dòng của A không còn `Friends`.
  - Unfollow không bị giới hạn tần suất.
- [ ] **SO-34** Follow chính mình → **Mong đợi:**
  - Không có đường nào trên UI (search loại chính mình).
  - Nếu gọi API trực tiếp: 422 `You cannot follow yourself.` (code `cannot_follow_self`).
- [ ] **SO-35** Follow người đã bị suspended (mở từ link cũ) → **Mong đợi:** Profile báo `This person isn't available.`
- [ ] **SO-36** "Remove follower" → **Mong đợi:** API có (`DELETE /me/followers/:id`) nhưng app không có nút nào (chưa xác minh có UI ở chỗ khác).
- [ ] **SO-37** Follow thất bại (mất mạng hoặc 429) → **Mong đợi:** Không hiện thông báo lỗi. Nút bật lại, trạng thái không đổi. Đây là khoảng trống UX cần ghi nhận.
- [ ] **SO-38** Giới hạn follow 200/giờ (nên giảm `rateLimit.follows` xuống 1–2 trong admin) → **Mong đợi:**
  - Follow vượt giới hạn không có tác dụng, không có thông báo.
  - Người khác không bị ảnh hưởng. Unfollow vẫn chạy.

### 4.5 Profile của người khác (lọc theo privacy)

- [ ] **SO-39** A (chưa follow) mở B, B để privacy mặc định → **Mong đợi:**
  - Chỉ thấy tên, `@username`, nút `Follow`, dòng `Some of {name}'s profile is private.`, nút `Report` và `Block`.
  - Không thấy bio, cây, thống kê, badge, nút `Visit forest`.
- [ ] **SO-40** A và B là bạn, B để mặc định → **Mong đợi:**
  - Thấy bio, cây tháng hiện tại (kèm thanh reaction), mục `Badges` (badge showcase dạng chip), nút `Visit forest`.
  - **Không** thấy thống kê, vì statistics mặc định là `private`. Vẫn còn dòng `Some of … is private.`
- [ ] **SO-41** B đặt Focus statistics = `Friends`, A là bạn → **Mong đợi:**
  - Hiện `{X h Y min} focused · {N} sessions` và `Longest streak {N} days`.
  - Không bao giờ hiện tên topic hay ghi chú.
- [ ] **SO-42** B đặt tất cả = `Public`, C (người lạ, đã đăng nhập) mở B → **Mong đợi:** Thấy hết mọi phần. Không còn dòng "private".
- [ ] **SO-43** Bấm một chip badge → **Mong đợi:** Mở sheet có tên badge, mô tả và thanh reaction cho badge đó.
- [ ] **SO-44** Mở profile của tài khoản đã bị block (hai chiều), đã suspended, hoặc đã xoá (qua link hoặc danh sách cũ) → **Mong đợi:** Empty state `This person isn't available.` Giống hệt trường hợp không tồn tại.
- [ ] **SO-45** Mất mạng khi mở profile → **Mong đợi:** `We couldn't load this profile right now.` kèm thử lại.

### 4.6 Cài đặt privacy (mặc định và tác dụng)

- [ ] **SO-49** Profile=Private, B (bạn) xem A → **Mong đợi:** Không thấy bio (cả ngày tham gia), có dòng "private".
- [ ] **SO-50** Forest=Private hoặc Friends với người lạ → **Mong đợi:**
  - Người xem không thấy nút `Visit forest`.
  - Nếu mở thẳng màn forest (link cũ): `We couldn't load this forest right now.` (server 403 `They keep this private.`).
- [ ] **SO-51** Current tree=Private, bạn bè xem → **Mong đợi:**
  - Không có cây hero trên profile.
  - Trong forest, tháng đang lớn vẫn hiện nhãn `Growing now` nhưng không có hình cây.
- [ ] **SO-52** Badges=Private → **Mong đợi:** Không có mục Badges. Bản ghi tháng đã lưu trữ cũng không có danh sách badge.
- [ ] **SO-55** A đổi privacy khi B đang mở profile của A → **Mong đợi:** B thấy thay đổi sau khi tải lại hoặc mở lại màn (không realtime).

### 4.7 Block và danh sách Blocked people

- [ ] **SO-56** A mở B → `Block` → **Mong đợi:**
  - Hộp xác nhận tiêu đề `Block {name}?`, nội dung `They won't be able to find you or see your forest, and you won't see theirs. Follows between you end.`, nút `Block {name}` (destructive) và Cancel.
- [ ] **SO-57** Xác nhận block → **Mong đợi:** Quay lại màn trước (hoặc về /together). B biến mất khỏi Following/Followers của A.
- [ ] **SO-58** Kiểm tra từ phía B → **Mong đợi:**
  - A không còn trong danh sách của B. Search không ra A.
  - Mở profile A ra `This person isn't available.`
  - Follow cả hai chiều bị xoá.
- [ ] **SO-59** Reaction cũ giữa A và B (hai chiều) → **Mong đợi:** Bị xoá. Biến mất khỏi mục `Reactions` của cả hai và khỏi số đếm.
- [ ] **SO-60** B (bị block) cố follow A qua link cũ → **Mong đợi:** Profile 404. Không thể follow.
- [ ] **SO-61** Phòng Focus room public do A làm host. Xem từ phía B → **Mong đợi:**
  - Phòng không có trong danh sách của B.
  - B nhập code phòng: `No open room has that code.`
  - Ngược lại cũng vậy.
- [ ] **SO-62** A và B đã ở chung phòng, sau đó A block B → **Mong đợi:** Theo code, cả hai vẫn ở trong phòng và vẫn thấy nhau, vì block không đuổi ai (chưa xác minh trên UI).
- [ ] **SO-63** Thử thách chung, sau đó A block B → **Mong đợi:**
  - Trong màn thử thách, mỗi người không thấy người kia trong danh sách tham gia.
  - Tiến độ của B vẫn được cộng vào mục tiêu chung.
  - Không mời được nhau nữa (`Only friends (people who follow you back) can be invited.`).
- [ ] **SO-64** Bảng xếp hạng → **Mong đợi:** Người bị block (hai chiều) không hiện thành dòng, nhưng điểm team vẫn tính họ.
- [ ] **SO-67** Block chính mình → **Mong đợi:** Không có đường trên UI. API trả 422 `You cannot block yourself.`
- [ ] **SO-68** Block 2 lần (hai máy cùng tài khoản) → **Mong đợi:** Idempotent, không lỗi.

### 4.8 Report (người dùng) và moderation (admin)

- [ ] **SO-69** A mở B → `Report` → **Mong đợi:**
  - Sheet `Report {name}` với câu `What is the problem?`
  - Chip `Account`, `Username`, `Avatar`, `Bio`, `Behavior`.
  - Ô `Anything we should know? (optional)` (tối đa 500 ký tự, nhiều dòng).
  - Nút `Send report` bị vô hiệu cho tới khi chọn một chip.
- [ ] **SO-70** Chọn `Behavior`, để trống chi tiết, gửi → **Mong đợi:** `Thank you. A moderator will look at it.` Chi tiết gửi lên là null.
- [ ] **SO-71** Gửi lại cùng category về cùng người khi report trước chưa xử lý xong → **Mong đợi:** Vẫn hiện "Thank you". Server trả 200 với report cũ, không tạo report mới.
- [ ] **SO-72** Gửi category khác về cùng người → **Mong đợi:** Tạo report mới.
- [ ] **SO-73** Mất mạng khi gửi → **Mong đợi:** `We couldn't send your report. Check your connection and try again.` Lỗi khác hoặc 429: `We couldn't send your report. Please try again.`
- [ ] **SO-74** Gửi quá 20 report trong 24 giờ (hoặc giảm `rateLimit.reports`) → **Mong đợi:** `We couldn't send your report. Please try again.` Người khác vẫn report được.
- [ ] **SO-75** Đóng sheet rồi mở lại → **Mong đợi:** Form trở về trống.
- [ ] **SO-76** Admin → `Reports` → **Mong đợi:**
  - Bộ lọc `Status` mặc định `Waiting (open and in review)`. Report cũ nhất trước.
  - Các cột `Category`, `Status`, `Reported user`, `Open about them`, `Reporter`, `Filed`.
  - Không có report: `No reports waiting.`
  - Reporter đã xoá tài khoản thì hiện `Deleted account`.
- [ ] **SO-77** Mở chi tiết report → **Mong đợi:**
  - Có Status, Filed, Details, Reporter, Reported user.
  - Mục `Reported profile, as it is now` gồm Username, Name, Bio, Avatar (`Custom avatar`/`None`).
  - `Blocks`: `No blocks between them`, `The reporter blocks this user`, `This user blocks the reporter`, hoặc `They block each other`.
  - `History`: dạng "N reports, N warnings, Active".
- [ ] **SO-78** Bấm `Start review` → **Mong đợi:** Trạng thái thành `In review by {email}`. Bấm lại (hoặc admin khác bấm): `This report is already being reviewed or is closed.`
- [ ] **SO-79** Chọn Action `Warn the user`, để trống `Message to the user` → **Mong đợi:** Không resolve được (nút bị vô hiệu, hoặc server trả `A warning needs a message for the user.`).
- [ ] **SO-80** Warn có message, `Resolve…` → **Mong đợi:**
  - Hộp xác nhận `Warn this user and resolve the report?` yêu cầu lý do (3–500 ký tự: `Give a reason of 3 to 500 characters.`).
  - Sau đó trên máy B (người bị warn), Together hiện thẻ `A note from the Focus Forest team`, nội dung message và nút `I understand`.
  - Bấm nút thì thẻ biến mất vĩnh viễn (idempotent).
- [ ] **SO-81** Action `Reset the username` → **Mong đợi:**
  - B mất username. Together của B hiện lại thẻ `Choose a username so friends can find you.`
  - Không ai tìm được B. Tên cũ được giải phóng.
- [ ] **SO-82** `Reset the bio` / `Reset the avatar` → **Mong đợi:** Bio bị xoá (profile B không còn bio). Avatar về initials.
- [ ] **SO-83** `Suspend the account` (`Suspend this user and resolve the report?`, mô tả `The user is signed out everywhere and can't sign in until an admin reactivates them.`) → **Mong đợi:**
  - Máy B bị đăng xuất ở request kế tiếp (401, refresh token bị thu hồi).
  - B đăng nhập lại: `This account is suspended.`
  - Với người khác: B biến mất khỏi search, Following/Followers, bảng xếp hạng, danh sách người trong phòng và thử thách. Profile B: `This person isn't available.`
- [ ] **SO-84** Admin → `Users` → B → `Reactivate account` (`The user can sign in again.`) → **Mong đợi:**
  - B đăng nhập lại được.
  - Các follow cũ hiện lại (follow được giữ lúc suspend).
- [ ] **SO-85** `Ban the account` → **Mong đợi:**
  - Đăng nhập báo `This account is banned.`
  - Ban lần nữa: `This account is already banned.`
  - Suspend một tài khoản không còn active: `This account is already suspended or banned.`
- [ ] **SO-86** `Dismiss…` (`Dismiss this report?`, `The report is closed without action.`) → **Mong đợi:** Report đóng, tài khoản không đổi. Thao tác lại trên report đã đóng: `This report is already resolved or dismissed.`
- [ ] **SO-87** Report người đã block mình, hoặc người đã suspended → **Mong đợi:**
  - Server cho phép.
  - Trên UI không làm được vì profile ra 404. Phải report **trước** khi block.
- [ ] **SO-88** Staff role `support` → **Mong đợi:** Không thấy menu Reports.

### 4.9 Thăm rừng của bạn (Visit forest)

- [ ] **SO-89** A (bạn của B) → profile B → `Visit forest` → **Mong đợi:**
  - Màn `{name}'s forest`. Thanh reaction cho cả khu rừng ở trên.
  - Lưới các tháng:
    - Tháng không có cây: `A quiet month`.
    - Tháng đang lớn: `Growing now`.
    - Tháng đã lưu trữ: cây thumbnail và nhãn `October 2026`.
  - Không có số liệu tập trung trên timeline.
- [ ] **SO-90** Bấm một tháng đã lưu trữ → **Mong đợi:**
  - Sheet tiêu đề `{Month} {Year}`, có cây.
  - Có `X focused · N sessions` (chỉ khi statistics được phép xem).
  - Có danh sách badge (chỉ khi badges được phép xem), thanh reaction cho cây tháng đó.
  - Không bao giờ có ghi chú hay topic.
- [ ] **SO-91** B có hơn 1 trang tháng → **Mong đợi:** Nút `Show earlier months`.
- [ ] **SO-92** B là tài khoản mới chưa có tháng nào → **Mong đợi:** Lưới rỗng, chỉ có thanh reaction.
- [ ] **SO-93** Việc thăm rừng → **Mong đợi:** Chỉ đọc. Rừng và cây của B không thay đổi gì.
- [ ] **SO-94** Mất mạng → **Mong đợi:** `We couldn't load this forest right now.` hoặc `We couldn't load this month right now.`

### 4.10 Reactions

- [ ] **SO-95** Trên cây, rừng hoặc badge của bạn bè → **Mong đợi:**
  - 5 chip theo thứ tự 🔥 🌱 👏 ❤️ ✨.
  - Chip có lượt thì hiện số (`🔥 2`). Accessibility label dạng `Fire, 2`.
  - Thanh chỉ hiện sau khi đã tải xong số đếm.
- [ ] **SO-96** Bấm 🔥 → **Mong đợi:** Chip được chọn, số tăng 1.
- [ ] **SO-97** Bấm 🔥 lần nữa → **Mong đợi:** Gỡ reaction (bỏ chọn, số giảm).
- [ ] **SO-98** Cùng một mục tiêu, bấm nhiều loại khác nhau → **Mong đợi:** Mỗi loại tính 1 lần cho mỗi người. Có thể chọn cả 5 loại cùng lúc.
- [ ] **SO-99** Bấm nhanh liên tục → **Mong đợi:** Chip bị vô hiệu khi đang gửi. Bấm lỗi thì không đổi gì.
- [ ] **SO-100** Máy B: tab Together → **Mong đợi:**
  - Mục `Reactions` hiện các dòng `{tên A} sent 🔥` với phụ đề `On your forest`, `On your October 2026 tree`, `On one of your badges` (hoặc `On your profile`).
  - Mới nhất trước. Dòng không bấm được.
- [ ] **SO-101** Reaction lên chính mình → **Mong đợi:** Không có UI. API trả 422 `You cannot react to your own forest.`
- [ ] **SO-102** Reaction lên nội dung B để `Private` → **Mong đợi:** Không có UI vì nội dung bị ẩn. Gỡ reaction cũ vẫn được (chỉ cần thấy được người đó).
- [ ] **SO-103** Người đã reaction bị suspended → **Mong đợi:** Lượt của họ biến mất khỏi số đếm và danh sách nhận.
- [ ] **SO-104** Vượt 300 reaction/giờ (hoặc giảm `rateLimit.reactions`) → **Mong đợi:** Bấm không có tác dụng, không có thông báo. Gỡ reaction không bị giới hạn.
- [ ] **SO-105** Không có reaction dạng chữ hay bình luận → **Mong đợi:** Xác nhận không có ô nhập nào.

### 4.11 Focus Together – tạo phòng, mã phòng, danh sách

- [ ] **SO-106** Together → mục `Focus rooms` → `Create a room` → **Mong đợi:**
  - Sheet `Create a room` có:
    - `Room name` (tối đa 50 ký tự)
    - `Room topic (optional)` (helper `A label for the room. Everyone focuses on their own topic.`, tối đa 50)
    - `Length`: `15 min` / `25 min` / `50 min` / `90 min`, mặc định 25
    - `People`: `Up to 2` / `4` / `6` / `10`, mặc định 4
    - `Who can join`: `Public` / `Private`, mặc định Public
  - Nút `Create room` bị vô hiệu khi tên trống (hoặc chỉ có khoảng trắng).
- [ ] **SO-107** Tạo phòng → **Mong đợi:**
  - Mở màn phòng: tiêu đề là tên phòng, dòng `25 min · {topic}`, dòng `Code XXXXXX`.
  - Mã gồm 6 ký tự, không có 0/O/1/I.
  - Danh sách người: `{tên} (you) · Host · Not ready yet`.
- [ ] **SO-108** Đang ở một phòng, tạo phòng thứ hai → **Mong đợi:** `You're already in a room. Leave it first.`
- [ ] **SO-109** Mục Focus rooms khi đang ở trong phòng → **Mong đợi:** Có dòng `You're in {name}` (phụ đề `Open the room`). Phòng đó không lặp lại trong danh sách để tham gia.
- [ ] **SO-110** B xem danh sách phòng public → **Mong đợi:**
  - Dòng `{name}` với phụ đề `25 minutes, 1 of 4 · {topic}`.
  - Phòng private, phòng đầy, phòng đã bắt đầu, lobby quá 2 giờ, phòng có người B block hoặc block B: đều không có.
  - Tối đa 50 phòng.
- [ ] **SO-111** B bấm một phòng public trong danh sách → **Mong đợi:** Vào phòng ngay và mở màn phòng. Cách này không tính vào giới hạn roomCodes.
- [ ] **SO-112** B → `Join with a code` → **Mong đợi:** Sheet có ô `Room code` (tự viết hoa, tối đa 6). `Join room` bị vô hiệu khi chưa đủ 6 ký tự.
- [ ] **SO-113** Nhập mã chữ thường hoặc có khoảng trắng hai đầu → **Mong đợi:** Vẫn vào được (không phân biệt hoa/thường, tự trim).
- [ ] **SO-114** Nhập mã của phòng private → **Mong đợi:** Vào được. Có mã là đủ, không cần lời mời.
- [ ] **SO-115** Mã sai → **Mong đợi:** `No open room has that code.`
- [ ] **SO-116** Mã của phòng đầy → **Mong đợi:** `That room is full.`
- [ ] **SO-117** Mã của phòng đã bắt đầu → **Mong đợi:** `That room has already started.`
- [ ] **SO-118** Mã của phòng đã kết thúc hoặc đã đóng → **Mong đợi:** `No open room has that code.`
- [ ] **SO-119** Đang ở phòng khác rồi nhập mã → **Mong đợi:** `You're already in a room. Leave it first.`
- [ ] **SO-120** Nhập sai 20 mã trong 1 giờ (nên giảm `rateLimit.roomCodes`), sau đó nhập mã thứ 21 (kể cả mã đúng) → **Mong đợi:** `Too many codes tried for now. Please wait a few minutes and try again.`
- [ ] **SO-121** Mất mạng khi tham gia → **Mong đợi:** `We couldn't reach the room. Check your connection.` Lỗi tạo phòng khác: `We couldn't create the room. Please try again.`
- [ ] **SO-122** Hai người cùng tham gia vào chỗ trống cuối cùng → **Mong đợi:** Chỉ một người vào được. Người kia nhận `That room is full.`
- [ ] **SO-123** Người chỉ đang xem phòng (đã được mời nhưng chưa vào) → **Mong đợi:** Không thấy dòng `Code …`. Mã chỉ hiện cho thành viên.

### 4.12 Lobby, sẵn sàng, bắt đầu

- [ ] **SO-124** Trong lobby, chưa sẵn sàng → **Mong đợi:**
  - Có nhãn `Your topic` và chip các topic gần đây.
  - Nút `I'm ready` bị vô hiệu với lý do `Choose your topic first.`
  - Có các nút `Invite friends`, `Start now` (chỉ host thấy), `Leave room`.
- [ ] **SO-125** Tài khoản chưa có topic nào → **Mong đợi:** Không có chip, không thể `I'm ready`. Ghi nhận khả năng bị kẹt (chưa xác minh có gợi ý nào không).
- [ ] **SO-126** Chọn topic → `I'm ready` → **Mong đợi:**
  - Trạng thái của mình là `Ready`. Nút đổi thành `Not ready`.
  - Máy kia thấy cập nhật gần như tức thì qua WebSocket `/rooms/live`, hoặc tối đa khoảng 15 giây khi chỉ dựa vào polling.
- [ ] **SO-127** Bấm `Not ready` → **Mong đợi:** Trở về `Not ready yet`.
- [ ] **SO-128** Tất cả người trong phòng (ít nhất 2) đều `Ready` → **Mong đợi:**
  - Phòng tự bắt đầu, đếm ngược 10 giây: `Starting in 10 s` … `Starting in 1 s`.
  - Trạng thái mọi người thành `Focusing`.
- [ ] **SO-129** Host bấm `Start now` khi chỉ có mình host → **Mong đợi:** `At least two people need to be ready to start.`
- [ ] **SO-130** Host chưa sẵn sàng, B sẵn sàng, C chưa sẵn sàng; host bấm `Start now` → **Mong đợi:**
  - Phòng bắt đầu với host và B (host tự được tính là sẵn sàng).
  - C bị loại khỏi phòng lặng lẽ: trên máy C phòng hiện `This room has ended.`
- [ ] **SO-131** Người không phải host → **Mong đợi:** Không thấy nút `Start now`.
- [ ] **SO-132** Host rời lobby → **Mong đợi:** Người vào sớm tiếp theo thành `Host`. Người cuối cùng rời thì lobby đóng.
- [ ] **SO-133** Lobby không ai bắt đầu sau 2 giờ → **Mong đợi:** Phòng thành `ended`. Không còn trong danh sách. Nhập mã: `No open room has that code.`
- [ ] **SO-134** Đổi trạng thái ready sau khi phòng đã bắt đầu (hai máy cùng lúc) → **Mong đợi:** Server trả 409 `This room has already started.`
- [ ] **SO-135** Không có chat → **Mong đợi:** Xác nhận không có ô nhắn tin nào.

### 4.13 Mời bạn vào phòng (invites)

- [ ] **SO-136** Trong lobby → `Invite friends` → **Mong đợi:**
  - Sheet `Invite friends` với chip các bạn bè (chỉ người follow nhau, chưa ở trong phòng).
  - Không có bạn nào: `Friends are people you follow who follow you back.`
  - `Send invitations` bị vô hiệu với lý do `Choose at least one friend.`
- [ ] **SO-137** Gửi lời mời → **Mong đợi:** Sheet đóng, hiện `Invitations sent.`
- [ ] **SO-138** Máy B (được mời) → Together → Focus rooms → **Mong đợi:**
  - Có `{tên A} invited you to {room}` với nút `Open` và `Decline`.
  - Lời mời private cho phép B mở và vào bằng nút `Join room` mà không cần mã.
- [ ] **SO-139** B bấm `Decline` → **Mong đợi:** Lời mời biến mất. Làm lại không lỗi.
- [ ] **SO-140** B vào phòng → **Mong đợi:** Lời mời tự bị xoá.
- [ ] **SO-141** B bật thông báo `Focus room invites` (`When a friend invites you to a focus room.`), A mời trong khung 9–21 giờ → **Mong đợi:**
  - Push `{A} invited you to focus` với nội dung `The room "{name}" is gathering. Join if you have time.`
  - Bấm vào thì mở màn phòng.
  - Nếu phòng không còn là lobby thì không gửi. Mỗi phòng tối đa 1 thông báo. Giới hạn 2 thông báo mỗi ngày.
- [ ] **SO-142** Phòng đã bắt đầu → **Mong đợi:** Không còn nút `Invite friends` (chỉ có ở lobby). Nếu gọi qua API: `The room has already started.`
- [ ] **SO-143** Mời người không phải bạn (ví dụ quan hệ bạn bè vừa mất trong lúc sheet đang mở) → **Mong đợi:** `Only friends (people who follow you back) can be invited.`
- [ ] **SO-144** Mời tối đa 10 người mỗi lần (API: `Invite at most 10 friends at once.`). Vượt giới hạn invites 50/giờ (dùng chung với tạo/mời thử thách) → **Mong đợi:** `We couldn't send the invitations. Please try again.` Khi mất mạng: `We couldn't send the invitations. Check your connection.`
- [ ] **SO-145** Phòng bị huỷ hoặc hết hạn khi lời mời còn đó → **Mong đợi:** Lời mời không còn hiện (chỉ hiện phòng đang gom người).
- [ ] **SO-146** Người được mời đã block một thành viên trong phòng → **Mong đợi:** Lời mời không hiện. Vào phòng ra `No open room has that code.` hoặc 404.

### 4.14 Phiên tập trung chung, hiện diện, rời phòng, mất kết nối, hoàn thành

- [ ] **SO-147** Đếm ngược về 0 → **Mong đợi:**
  - App tự bắt đầu timer **riêng** của mỗi người với thời lượng của phòng và topic đã chọn, rồi chuyển sang màn Focus.
  - Trên timer có dòng `Focusing together · N people`. Không có tên, không có hoạt động.
- [ ] **SO-148** Màn phòng khi đang tập trung → **Mong đợi:** Hiện `Focusing together`.
- [ ] **SO-149** Hoàn thành phiên (từ 5 phút trở lên, được tính) → **Mong đợi:**
  - Phòng được hoàn thành bằng phiên đó: trạng thái của mình là `Done`, màn phòng hiện `You focused together.`
  - Lần đầu nhận badge `First Focus Together`. Nếu có ít nhất một bạn (follow nhau) cũng đã bắt đầu trong phòng: badge `Focus Buddy`.
  - Tên badge hiện ngay dưới trạng thái.
  - Nút `Leave room` biến mất.
- [ ] **SO-150** Kết thúc sớm dưới 5 phút (không được tính) → **Mong đợi:**
  - Phòng không hoàn thành (`Only a counted session completes a room.`).
  - Liên kết phòng–phiên bị xoá lặng lẽ, không có thông báo (chưa xác minh chữ hiển thị cuối cùng).
- [ ] **SO-151** Hoàn thành khi mất mạng → **Mong đợi:**
  - `We're saving your session; the room completes once it's saved.`
  - Khi có mạng lại (lần đọc phòng tiếp theo, khoảng 15 giây) thì tự hoàn thành.
- [ ] **SO-152** Vào phòng hoặc mở lại app khi phòng đã bắt đầu hơn 10 phút → **Mong đợi:** `This room started more than ten minutes ago, so this session can't join it.` Timer không tự chạy.
- [ ] **SO-153** Rời phòng (`Leave room`) giữa phiên → **Mong đợi:**
  - Về Together. Người đó biến mất khỏi phòng lặng lẽ, không có thông báo cho ai.
  - Phiên vẫn là của họ và vẫn được tính cho cây, nhưng không hoàn thành phòng.
  - Người còn lại thấy số trong `Focusing together · N people` giảm.
- [ ] **SO-154** Mất mạng hoặc đưa app xuống nền trong lobby hay khi đang tập trung → **Mong đợi:**
  - Server **không** tự cho người đó rời phòng. Rớt WebSocket không ảnh hưởng gì, họ vẫn ở trong phòng.
  - Khi mở lại, màn phòng đọc lại trạng thái (polling 15 giây).
- [ ] **SO-155** Thoát app hẳn rồi mở lại khi phòng đang chạy → **Mong đợi:** Liên kết phòng–phiên lưu trên máy (AsyncStorage) nên vẫn hoàn thành phòng được sau khi lưu phiên.
- [ ] **SO-156** Phòng hết hạn sau thời lượng + 30 phút pause (`maxPauseMinutes`) → **Mong đợi:**
  - Phòng `ended`. Người ngoài thấy `This room has ended.`
  - Hoàn thành muộn vẫn được tính nếu phiên đã bắt đầu đúng giờ.
- [ ] **SO-157** Hai máy cùng một tài khoản → **Mong đợi:**
  - Chỉ ở được một phòng tại một thời điểm. Máy thứ hai thấy `You're in {name}`.
  - Timer chỉ tự chạy trên máy đã bấm `I'm ready`, vì liên kết topic lưu theo máy (chưa xác minh).
- [ ] **SO-158** Admin → `Rooms` → **Mong đợi:**
  - Danh sách phòng đang mở (`No open rooms.` nếu rỗng).
  - `Close “{name}”?` yêu cầu lý do 3–500 ký tự. Được ghi vào audit.
  - Thành viên: hoàn thành sau đó bị từ chối (`This room was closed.`). Phiên của họ không bị đụng tới. Hiển thị trên app sau khi đóng: chưa xác minh.
- [ ] **SO-159** Thành viên xoá tài khoản khi đang trong phòng → **Mong đợi:** Chỗ của họ biến mất, phòng vẫn tiếp tục.

### 4.15 Challenges

- [ ] **SO-160** Together → `Challenges` → `Start a challenge` → **Mong đợi:** Màn `Start a challenge` liệt kê các mẫu:
  - `7 days of 30 min` – `Just you`
  - `10 hours in 7 days` – `Just you`
  - `30 sessions in 30 days` – `Just you`
  - `7 days of 15 min, together` – `With friends, up to 5`
  - `10 hours each in 14 days` – `With friends, up to 5`
  - `50 hours as a team in 7 days` – `Group, up to 10`
- [ ] **SO-161** Chưa chọn mẫu → **Mong đợi:** `Start challenge` bị vô hiệu với lý do `Choose a challenge first.` Mẫu đã chọn có meta `Chosen`.
- [ ] **SO-162** Chọn mẫu cá nhân → **Mong đợi:** Không có bộ chọn bạn bè. Bấm `Start challenge` mở màn chi tiết.
- [ ] **SO-163** Chọn mẫu friend/group → **Mong đợi:** Có bộ chọn `Invite friends` (chỉ người follow nhau).
- [ ] **SO-164** Màn chi tiết → **Mong đợi:**
  - Tiêu đề là tên mẫu.
  - Có `Just you` / `With friends` / `Group`, khoảng ngày `12 Oct – 18 Oct`, trạng thái `Until 18 Oct` (sắp bắt đầu thì `Starts …`).
  - Thanh tiến độ, ví dụ `0 of 7 days` hoặc `<1 min of 10 h` khi bằng 0.
  - Danh sách người dạng `{tên} (you) · 3 of 7 days · Reached`; người đã mời: `{tên} · Invited`.
- [ ] **SO-165** Thử thách bắt đầu từ "hôm nay" theo time zone của người tạo → **Mong đợi:**
  - Chỉ phiên được tính trong khung ngày mới được cộng. Phiên trước ngày bắt đầu không tính.
  - Mục tiêu `active_days` cần đủ số phút mỗi ngày (ví dụ 15 hoặc 30 phút).
- [ ] **SO-166** B nhận lời mời → **Mong đợi:**
  - Mục Challenges có `Invitations`: tiêu đề kèm `Accept` / `Decline`.
  - Nếu bật `Friend invites`: push `{A} invited you to a challenge` với nội dung `Take a look together, if you'd like.`
- [ ] **SO-167** B `Accept` → **Mong đợi:**
  - B có trong danh sách tham gia.
  - Nếu A bật `Challenge updates`: A nhận `{B} joined your challenge` với nội dung `You're working toward it together now.`
- [ ] **SO-168** B `Decline` → **Mong đợi:** Lời mời biến mất lặng lẽ. Mở link thử thách: `This challenge isn't available.`
- [ ] **SO-169** Mục tiêu `each` → **Mong đợi:** Chỉ hoàn thành khi **mọi** người đạt. Mục tiêu `shared` (team) cộng dồn tất cả, ví dụ `12 h 34 min of 50 h together`.
- [ ] **SO-170** Đạt mục tiêu → **Mong đợi:**
  - `Completed together` (cá nhân: `Completed`).
  - Người khác nhận push `Your challenge is complete` với nội dung `You reached it together. Nicely done.`
- [ ] **SO-171** Hết khung ngày mà chưa đạt → **Mong đợi:** `Ended`. Không bao giờ có chữ "failed", không bị phạt. Thử thách biến khỏi danh sách hiện tại của mục Challenges.
- [ ] **SO-172** `Invite friends` trong màn chi tiết → **Mong đợi:**
  - Loại trừ người đang tham gia và người đã được mời.
  - Mời vượt sức chứa (người tham gia + người được mời > max): `This challenge has no room for more people.`
- [ ] **SO-173** Mời vào thử thách đã kết thúc → **Mong đợi:** `This challenge has finished.`
- [ ] **SO-174** `Leave challenge` → **Mong đợi:**
  - Hộp xác nhận `Leave this challenge?` với `Your place is removed. Nothing is counted against you.`, nút `Leave`.
  - Về Together.
- [ ] **SO-175** Người tạo xoá tài khoản → **Mong đợi:** Thử thách vẫn tiếp tục cho những người còn lại.
- [ ] **SO-176** Người lạ mở link thử thách → **Mong đợi:** `This challenge isn't available.`
- [ ] **SO-177** Tài khoản chưa có time zone → **Mong đợi:** `Set your time zone first, so the challenge knows your days.`
- [ ] **SO-178** Giới hạn invites 50/giờ: **tạo** thử thách (kể cả thử thách cá nhân) cũng bị tính → **Mong đợi:** Khi vượt: `Something went wrong. Please try again.` Mất mạng: `We couldn't reach the server. Check your connection.`
- [ ] **SO-179** Màn hoàn thành phiên khi có thử thách đang chạy → **Mong đợi:** Có một dòng `{tên thử thách} · {tiến độ}`.

### 4.16 Events (thẻ Home, missions, rewards)

- [ ] **SO-180** Admin → `Live` → `Events` → `New event` → **Mong đợi:**
  - Tạo được sự kiện với Status `Active`, `Starts at` / `Ends at`, `Entry: counted sessions`, `Leaderboard`, Teams.
  - Missions có measure `focus_minutes` / `sessions` / `active_days` / `streak_days` / `focus_together_sessions`.
  - Có Milestones (badge, trait) và Community Tree.
  - Event `Planned` thì không hiện cho ai.
- [ ] **SO-181** Không có sự kiện → **Mong đợi:** Home không có thẻ. Together không có mục `Events`.
- [ ] **SO-182** Có sự kiện chưa tham gia → **Mong đợi:** Home có tối đa **một** thẻ: tên sự kiện và `Starts 15 Oct` hoặc `Live until 22 Oct`. Bấm vào mở chi tiết.
- [ ] **SO-183** Đã tham gia → **Mong đợi:** Thẻ hiện `1 of 3 missions`. Ưu tiên sự kiện đã tham gia sắp kết thúc nhất.
- [ ] **SO-184** Mục `Events` trong Together → **Mong đợi:** Liệt kê sự kiện live và sắp tới, kèm `… · Joined` nếu đã tham gia.
- [ ] **SO-185** Chi tiết sự kiện chưa tham gia → **Mong đợi:**
  - Có mô tả, `15 Oct – 22 Oct · Live until 22 Oct`, nút `Join event`.
  - `Missions` chỉ hiện mục tiêu (`Focus 5 hours · 5 h`).
  - `Milestones` (`{name} · 2 missions`) kèm phần thưởng (`The X badge, Y, and a keepsake on your tree`).
- [ ] **SO-186** `Join event` → **Mong đợi:**
  - Tiến độ tính cả các phiên đã làm trong khung sự kiện **trước** khi tham gia (`… · 3 h of 5 h`).
  - Milestone đã đạt: `· Reached`. Phần thưởng sở hữu vĩnh viễn.
- [ ] **SO-187** Sự kiện có điều kiện vào (ví dụ 3 phiên) mà chưa đủ → **Mong đợi:** `This event opens after 3 focus sessions.`
- [ ] **SO-188** Sự kiện đã kết thúc → **Mong đợi:** `Ended`, không có nút Join. Tham gia qua API: `This event has ended.` Sự kiện retired mà chưa tham gia: `This event isn't available.`
- [ ] **SO-189** Màn hoàn thành phiên → **Mong đợi:** Có `{event} · Mission complete: {mission}` hoặc `{event} · N of M missions done`.
- [ ] **SO-190** Thông báo (đã bật `eventStart` / `eventEndingSoon`) → **Mong đợi:**
  - Bắt đầu: `{event} has begun` / `Join whenever you like. Your usual focus counts toward its missions.`
  - 48 giờ trước khi kết thúc: `{event} ends soon` / `It wraps up soon. Thank you for taking part.`
- [ ] **SO-191** Mission `focus_together_sessions` → **Mong đợi:** Chỉ tăng khi hoàn thành một phòng Focus Together có phiên bắt đầu trong khung sự kiện.
- [ ] **SO-192** Mất mạng khi Join → **Mong đợi:** `We couldn't reach the server. Check your connection.` Lỗi khác: `We couldn't join the event. Please try again.`

### 4.17 Community Tree (Shared Blossom)

- [ ] **SO-193** Sự kiện có Community Tree → **Mong đợi:** Chi tiết sự kiện có dòng `Community Tree` với phụ đề `{N} minutes together · {stage}`. Bấm vào mở màn riêng.
- [ ] **SO-194** Màn Community Tree → **Mong đợi:**
  - Cây màu hồng (species Shared Blossom), trông giống nhau trên mọi máy.
  - Có `{1,234} minutes grown together by {N} people`.
  - Có `Now in Seedling` / `Growing Tree` / `Bloom` / `Final Form`, hoặc `A seed, waiting for the first minutes`.
  - Danh sách `Milestones` dạng `Bloom · 500 minutes · Reached`.
  - Không xếp hạng ai.
- [ ] **SO-195** Chưa tham gia sự kiện → **Mong đợi:** Không có dòng `You added … minutes`.
- [ ] **SO-196** Tham gia → **Mong đợi:**
  - Các phiên được tính trong khung (≥ 1 phút) được cộng **một lần**: `You added {N} minutes`.
  - A và B cùng tham gia, cùng làm phiên thì tổng tăng đúng bằng tổng hai người.
- [ ] **SO-197** Đạt một mốc → **Mong đợi:**
  - Mở màn có modal `The Community Tree reached {Stage}` với `Everyone's focus grew it together. Your share of the reward is in your collection.`, nút `Continue`.
  - Chỉ hiện một lần cho mỗi người. Người tham gia muộn sau mốc vẫn nhận phần thưởng.
  - Badge `Community Contributor` (`Helped a Community Tree grow.`).
- [ ] **SO-198** Tổng không bao giờ giảm, kể cả khi một người đóng góp xoá tài khoản.
- [ ] **SO-199** Sự kiện không có cây → **Mong đợi:** `This event has no Community Tree.` Lỗi mạng: `We couldn't load the Community Tree right now.`

### 4.18 Leaderboards (opt-in, loại trừ, integrity)

- [ ] **SO-200** Together → `Leaderboards` → **Mong đợi:**
  - Màn `Leaderboards`. Chip `Friends` và `Global` (`Event` khi mở từ sự kiện), chip `This week` / `This month`.
  - Mặc định Friends + This week. Có khoảng ngày `12 Oct – 18 Oct`.
- [ ] **SO-201** Chưa opt-in → **Mong đợi:**
  - `You're not on leaderboards. You can turn it on in Privacy.` kèm nút `Privacy settings`.
  - Vẫn xem được bảng. Bản thân không có trên bảng.
- [ ] **SO-202** Bật `Appear on leaderboards` (A và B là bạn, cả hai đã opt-in và có focus tuần này) → **Mong đợi:**
  - Dòng `1 · {tên} (you) · 450`, dòng của mình được tô sáng.
  - Điểm từ 0 đến 1000. Hoà điểm thì cùng hạng (1, 2, 2, 4) và sắp theo tên.
- [ ] **SO-203** Người chỉ follow một chiều → **Mong đợi:** Không có trong bảng Friends.
- [ ] **SO-204** Người điểm 0, người bị suspended/banned, người bị block (hai chiều) → **Mong đợi:** Không hiện.
- [ ] **SO-205** Bảng trống → **Mong đợi:** `Nobody is on this board yet. Each week starts fresh.` / `… Each month starts fresh.`
- [ ] **SO-206** Tối đa 50 dòng. Nếu mình ngoài top → **Mong đợi:** Dòng của mình nằm riêng ở cuối.
- [ ] **SO-207** Kiểm tra tính công bằng: ngày rất dài (ví dụ 5 giờ) so với nhiều ngày đều đặn → **Mong đợi:** Mỗi ngày tính tối đa 120 phút. Người đều đặn có thể cao điểm hơn.
- [ ] **SO-208** Tuần reset vào thứ Hai, tháng reset vào ngày 1, theo ngày địa phương của người xem.
- [ ] **SO-209** Bảng sự kiện (sự kiện bật Leaderboard) → **Mong đợi:**
  - Dòng `Leaderboard` (`People` hoặc `People and teams`).
  - Mục `Teams` dạng `1 · {team} · {score}`. Team chia đều khi tham gia.
  - Sự kiện không có bảng thì không có dòng này.
- [ ] **SO-210** Lỗi mạng → **Mong đợi:** `We couldn't load this leaderboard right now.`
- [ ] **SO-211** Admin → `Live` → `Leaderboards` → chọn `Global, weekly` → exclude B (cần lý do 3–500 ký tự) → **Mong đợi:**
  - B biến khỏi mọi bảng và không được tính vào team.
  - B vẫn dùng app bình thường.
  - `Restore … to the boards?` thì B trở lại.
  - Danh sách `Excluded accounts` (rỗng: `No account is excluded.`).
- [ ] **SO-212** Admin → `Integrity` → **Mong đợi:**
  - Chỉ xét người đã opt-in và chưa bị loại, trong 28 ngày.
  - Các loại cờ:
    - `{N} minutes of focus on {date}` khi một ngày > 960 phút.
    - `A session stored {N} hours after it ended` khi nộp trễ > 72 giờ.
    - `Week of …: N minutes, usually M` khi tăng ≥ 5 lần và ≥ 600 phút.
    - `Two sessions at once`.
  - Không có cờ: `Nothing looks unusual.`
  - `Dismiss` cần lý do, cờ đã dismiss không quay lại. `Exclude {email} from boards` ngay từ trang này.
  - Cờ không bao giờ tự loại ai.
  - Lưu ý: server từ chối các phiên chồng nhau (`session_overlap`), nên cờ overlap khó tạo ra từ app. Cờ trễ 72 giờ cần giữ phiên offline hơn 3 ngày (chưa xác minh là làm được trên thiết bị).

### 4.19 Seasons

- [ ] **SO-213** Profile → Settings → mục `Seasons` → **Mong đợi:**
  - Có `Northern hemisphere, from your time zone` (hoặc `by default` / `chosen by you`).
  - Chip `Automatic` / `Northern` / `Southern`.
  - Time zone ở Nam bán cầu (ví dụ `Australia/Sydney`) thì hiện `Southern hemisphere, from your time zone`.
- [ ] **SO-214** Chọn `Southern` → **Mong đợi:** `Southern hemisphere, chosen by you`. Chọn `Automatic` thì quay lại theo time zone.
- [ ] **SO-215** Admin → `Live` → `Seasonal themes` → tạo theme Active cho bán cầu của người dùng, có reward (`Active days`) → **Mong đợi:**
  - Home có hiệu ứng mùa quanh cây (tắt khi bật reduce motion). Cây đã đạt được không bị thay đổi.
  - Collection Book có `This season: {name}`, mô tả, `{item} · 2 of 5 days with focus`. Khi đạt: `{item} · In your collection` (sở hữu vĩnh viễn).
- [ ] **SO-216** Ngoài mùa hoặc khác bán cầu → **Mong đợi:** Collection không có mục mùa.

### 4.20 Ca biên tổng hợp

- [ ] **SO-217** B xoá tài khoản → **Mong đợi:**
  - Trên máy A: B biến khỏi Following/Followers, reaction của B biến mất, profile ra `This person isn't available.`
  - Report do B gửi vẫn còn trong admin (Reporter: `Deleted account`).
  - Phút B đã góp vào Community Tree vẫn giữ.
- [ ] **SO-218** Hai máy cùng tài khoản: follow hoặc block trên máy 1 → **Mong đợi:** Máy 2 thấy sau khi tải lại danh sách hoặc profile (không realtime).
- [ ] **SO-219** Bấm link thông báo khi đang đăng xuất → **Mong đợi:** Đăng nhập xong mới mở `/together/room/…`, `/together/challenges/…`, `/together/events/…`. Link không hợp lệ thì về Home.
- [ ] **SO-220** Chỉ dùng mạng chậm hoặc offline trên toàn tab Together → **Mong đợi:** Mỗi phần hiện skeleton rồi đến ErrorState riêng. App không crash, không bị đăng xuất vì mất mạng.
## 5. Hồ sơ, cài đặt, thông báo, trợ năng, offline, admin

### 5.1 Profile tab
- [ ] **ST-6** Mở tab Profile (tab cuối; thứ tự tab: Home, Forest, Together, Insights, Profile) → **Mong đợi:** tiêu đề "Profile". Trong lúc tải có skeleton, TalkBack đọc "Loading your profile". Sau đó hiện card gồm avatar, tên (role header), bio và "Joined <Month YYYY>" (ví dụ "Joined September 2026", theo time zone của profile).
- [ ] **ST-7** Avatar với tên "Mai Anh" → **Mong đợi:** initials "MA": chữ đầu của tối đa 2 từ đầu, viết hoa. Thử "nguyễn văn an" → "NV". Thử tên một từ "Đặng" → "Đ".
- [ ] **ST-8** Tài khoản chưa có display name → **Mong đợi:** avatar hiện hình hạt giống thay cho initials. Chỗ tên là nút tertiary "Add your name"; bấm vào thì mở Edit profile với ô Name trống.
- [ ] **ST-9** Profile không có bio → **Mong đợi:** không có dòng bio trống.
- [ ] **ST-10** Đã trang bị khung avatar (Twig Frame) trong Collection → **Mong đợi:** avatar có vòng cành lá. Vòng này là trang trí, TalkBack không đọc.
- [ ] **ST-11** Dưới card → **Mong đợi:** có nút "Edit profile". Nếu đã có cây được archive thì có vignette rừng nhỏ, TalkBack đọc "Your forest, N recent trees" ("tree" khi chỉ có 1); bấm vào mở Forest.
- [ ] **ST-12** Lifetime stats → **Mong đợi:** hiện các dòng "X h Y min focused", "N sessions", "Current streak: N days", "Longest streak: N days", "N monthly trees". Khi tất cả bằng 0: "Your lifetime focus starts with your first session."
- [ ] **ST-13** Cho API stats lỗi (tắt mạng ngay sau khi profile đã tải) → **Mong đợi:** "Your lifetime stats aren't available right now." kèm nút "Try again". Phần identity vẫn hiện.
- [ ] **ST-14** Các ListRow "Goals and rest days", "Topics", "Settings" → **Mong đợi:** mở đúng màn ở cấp dưới Profile, tab Profile vẫn được chọn, back quay về Profile. Hint TalkBack lần lượt là "Opens your daily and weekly goals, rest days, and streak.", "Opens your topics, to create, edit, archive, or restore them." và "Opens theme, sound, motion, and notification settings."
- [ ] **ST-15** Profile không tải được (offline, chưa có cache) → **Mong đợi:** "We couldn't load your profile right now." kèm "Try again". Nút "Edit profile" không hiện. Query tự retry 2 lần với lỗi mạng, nên sẽ chờ vài giây mới hiện lỗi.

### 5.2 Edit profile
- [ ] **ST-16** Mở Edit profile → **Mong đợi:** tiêu đề "Edit profile". Các ô Name, Username, Bio đã điền giá trị hiện tại. Dòng "Joined" chỉ để đọc (meta "September 2026"), không phải ô nhập.
- [ ] **ST-17** Kiểm tra helper text → **Mong đợi:**
  - Name: "This is how Focus Forest greets you." (đã có tên) hoặc "Add the name you would like to be called." (chưa có).
  - Username: "Friends find you by this name." hoặc "Choose a username so friends can find you.".
  - Bio: bộ đếm "N / 160".
- [ ] **ST-18** Gõ Name dài hơn 50 ký tự → **Mong đợi:** ô dừng nhận ở 50 ký tự (maxLength). Nếu có cách đưa 51 ký tự vào và bấm Save: "Keep your name to 50 characters or fewer.", không gửi request.
- [ ] **ST-19** Name đúng 1 ký tự và đúng 50 ký tự → Save → **Mong đợi:** lưu được, quay về Profile và thấy tên mới.
- [ ] **ST-20** Dán vào Name một chuỗi có xuống dòng hoặc tab (ví dụ "Mai⏎Anh") → Save → **Mong đợi:** "Keep your name on one line.", không gửi request.
- [ ] **ST-21** Đã có tên, xoá hết hoặc chỉ để khoảng trắng → Save → **Mong đợi:** "Add the name you would like to be called.". Tên không thể bị xoá.
- [ ] **ST-22** Chưa có tên, để trống Name, chỉ nhập Bio → Save → **Mong đợi:** chỉ gửi bio, lưu thành công. Name được để dành sau.
- [ ] **ST-23** Nhập "  Mai  " có khoảng trắng hai đầu → **Mong đợi:** lưu thành "Mai" (đã trim).
- [ ] **ST-24** Bio: gõ quá 160 ký tự → **Mong đợi:** ô dừng ở 160 và bộ đếm "160 / 160". Ô cho nhiều dòng. Nếu vượt (ví dụ dán): "Keep your bio to 160 characters or fewer.".
- [ ] **ST-25** Xoá hết Bio → Save → **Mong đợi:** bio bị xoá (gửi `null`), Profile không còn dòng bio.
- [ ] **ST-26** Username có 1–2 ký tự, có dấu cách, dấu "-" hoặc ký tự có dấu ("mai-anh", "an") → Save → **Mong đợi:** "Use 3 to 20 letters, numbers, or underscores.", không gửi request. Ô dừng nhận ở 20 ký tự.
- [ ] **ST-27** Username "Mai_Anh01" → Save → **Mong đợi:** lưu dạng chữ thường "mai_anh01". Ô không tự viết hoa, không autocorrect.
- [ ] **ST-28** Đã có username, xoá trống ô Username → Save → **Mong đợi:** username giữ nguyên. Username đổi được nhưng không xoá được.
- [ ] **ST-29** Username đã có người dùng (lấy username của B) → **Mong đợi:** "That username is taken. Try another one.".
- [ ] **ST-30** Username bị giữ chỗ: admin, administrator, moderator, mod, support, help, staff, team, official, system, root, focusforest, focus_forest, forest → **Mong đợi:** "That username is reserved. Try another one.".
- [ ] **ST-31** Không thay đổi gì → Save → **Mong đợi:** quay lại ngay, không có request PATCH.
- [ ] **ST-32** Bấm Save liên tục nhiều lần → **Mong đợi:** nút đổi thành "Saving…" và bị disabled. Chỉ có 1 PATCH.
- [ ] **ST-33** Tắt mạng, sửa bio → Save → **Mong đợi:** "We couldn't reach Focus Forest. Check your connection and try again.". Vẫn ở màn Edit, nội dung đã sửa còn nguyên, nút Save dùng lại được.
- [ ] **ST-34** Server trả lỗi lạ (ví dụ 500) → **Mong đợi:** "We couldn't save your profile just now. Please try again.". Không bao giờ hiện thông điệp thô của server.
- [ ] **ST-35** Trong ô Name, bấm Next trên bàn phím → **Mong đợi:** con trỏ nhảy sang ô Bio.

### 5.3 Settings: tổng quan
- [ ] **ST-36** Profile → Settings → **Mong đợi:** tiêu đề "Settings", lúc tải có skeleton "Loading your settings". Các section theo thứ tự: Appearance, Sound and haptics, Motion, Privacy, Seasons, Notifications, Account, About.
- [ ] **ST-37** Tài khoản mới, xem giá trị mặc định → **Mong đợi:** chip "System" được chọn. Sound bật, Haptics bật, Reduce motion tắt, Share usage data bật. Cả 10 notification đều tắt và chưa có giờ.
- [ ] **ST-38** Settings không tải được (offline, mở lần đầu) → **Mong đợi:** "We couldn't load your settings right now." kèm "Try again". Section Account (Download my data, Sign out, Delete account) vẫn hiện bên dưới.
- [ ] **ST-39** About → **Mong đợi:** dòng "Version" với giá trị "0.1.0" (theo `app.json`).
- [ ] **ST-40** Mỗi thay đổi được lưu riêng (PATCH /me/preferences) → **Mong đợi:** không có nút Save chung. Bật/tắt nhanh nhiều switch liên tiếp: cái nào cũng giữ đúng trạng thái, công tắc không nhảy qua lại.
- [ ] **ST-41** Tắt mạng rồi gạt một switch (ví dụ Sound) → **Mong đợi:** switch lật ngay rồi quay về trạng thái cũ đúng một lần, hiện "We couldn't save that change. Check your connection and try again.". Lỗi server (5xx) thì hiện "We couldn't save that change. Please try again.". Các switch khác không bị ảnh hưởng.

### 5.4 Settings: Appearance (theme)
- [ ] **ST-42** Chọn "Dark" → **Mong đợi:** toàn bộ app chuyển tối ngay, trước cả khi server trả lời. Status bar chữ sáng. Chuyển qua các tab khác vẫn tối.
- [ ] **ST-43** Chọn "Light" khi điện thoại đang ở dark mode → **Mong đợi:** app sáng, không theo hệ thống.
- [ ] **ST-44** Chọn "System", rồi đổi dark/light trong cài đặt Android → **Mong đợi:** app đổi theo hệ thống.
- [ ] **ST-45** Kill app khi đang Dark rồi mở lại (online) → **Mong đợi:** mở thẳng vào giao diện tối, không lóe màn sáng (launch screen che cho tới khi đọc xong preferences).
- [ ] **ST-46** Bấm lại chip đang được chọn → **Mong đợi:** không có request.
- [ ] **ST-47** Đổi theme khi offline → **Mong đợi:** theme quay về giá trị cũ và hiện thông báo lỗi lưu như ST-41.
- [ ] **ST-48** Đã lưu Dark, bật chế độ máy bay, kill rồi mở app → **Mong đợi:** app vẫn mở được, nhưng theme theo hệ thống vì preferences không đọc được. Đây là hành vi đã được test tự động; ghi lại xem có chấp nhận được không.
- [ ] **ST-49** Đã đăng xuất → **Mong đợi:** màn auth luôn theo theme hệ thống.

### 5.5 Settings: Sound and haptics
- [ ] **ST-50** Kiểm tra mô tả → **Mong đợi:** Sound: "Sounds for focus sessions, such as the end of a session.". Haptics: "Gentle vibrations for focus sessions.".
- [ ] **ST-51** Tắt Sound, start focus, khoá máy chờ hết giờ → **Mong đợi:** notification "Focus complete" vẫn hiện nhưng không kêu (kênh Android `focus-timer-silent`, tên "Focus timer (silent)"). Bật Sound lại thì dùng kênh `focus-timer` ("Focus timer"), âm mặc định của hệ thống.
- [ ] **ST-52** Đổi Sound trong lúc timer đang chạy → **Mong đợi:** notification đã lên lịch được lên lịch lại theo giá trị mới.
- [ ] **ST-53** Bật/tắt Haptics → **Mong đợi:** giá trị được lưu và giữ sau khi mở lại app. Hiện app không có rung nào: không có dependency `expo-haptics`, giá trị chỉ được lưu. Ghi lại như gap đã biết, không phải bug mới.
- [ ] **ST-54** Trong app có âm thanh nào ngoài notification không? → **Mong đợi:** không. Sound chỉ chọn kênh notification của timer.

### 5.6 Settings: Reduce motion
- [ ] **ST-55** Remove animations của hệ thống đang tắt → **Mong đợi:** mô tả "Uses gentle fades instead of movement.".
- [ ] **ST-56** Bật "Reduce motion" trong app → về Home → **Mong đợi:** cây đứng yên hoàn toàn: không lắc, không gió, không phấn hoa hay đom đóm. Tăng trưởng chỉ là cross-fade. Badge unlock chỉ fade. Áp dụng ngay, không cần mở lại app.
- [ ] **ST-57** Kill rồi mở lại khi đã lưu reduce motion → **Mong đợi:** mở ra đã giảm chuyển động.
- [ ] **ST-58** Bật "Remove animations" của Android, switch trong app đang tắt → **Mong đợi:** mô tả đổi thành "Your device already reduces motion, so it stays reduced here too.". Switch vẫn hiện trạng thái tắt (giá trị của app), nhưng motion vẫn bị giảm (hệ thống OR app).
- [ ] **ST-59** Đổi setting hệ thống trong lúc app đang mở → **Mong đợi:** app cập nhật ngay, không cần khởi động lại.
- [ ] **ST-60** Ceremony cuối tháng và reaction ở Together khi reduce motion → **Mong đợi:** đi thẳng tới kết quả hoặc chỉ fade, thông tin vẫn đọc được.

### 5.7 Settings: Privacy và Blocked people
- [ ] **ST-61** Section Privacy → **Mong đợi:** ListRow "Privacy" (subtitle "Who sees each part of your profile"), ListRow "Blocked people", switch "Share usage data".
- [ ] **ST-63** Switch "Appear on leaderboards" → **Mong đợi:** mô tả "Off by default. You can read leaderboards either way.", mặc định tắt. Bật thì tên mình hiện trên leaderboard; tắt thì biến mất.

### 5.8 Share usage data (analytics consent) và client error reports
- [ ] **ST-71** Switch "Share usage data" → **Mong đợi:** mô tả "Helps us see whether Focus Forest is useful: when the app is opened and which screens are used. Your notes and topic names are never shared.", mặc định bật.
- [ ] **ST-72** Bật sharing, mở app, vào Forest, Insights, Recap, Tree Details, start một focus → **Mong đợi:** gửi các event `app_opened` (một lần mỗi launch), `forest_opened`, `insights_opened`, `recap_opened`, `tree_details_opened`, `focus_started` (chỉ kèm plannedMinutes). Admin → Checkpoint thấy ngày active tăng.
- [ ] **ST-73** Đưa app vào nền hơn 30 phút rồi quay lại → **Mong đợi:** có event `app_foregrounded`. Quay lại trước 30 phút thì không có.
- [ ] **ST-74** Tắt "Share usage data" → **Mong đợi:** không gửi thêm event nào. Admin → Users → user → "Usage data: Not shared"; bật lại thì "Shared".
- [ ] **ST-75** Offline vài phút, mở vài màn hình, rồi online lại → **Mong đợi:** event được gửi sau, không mất. Queue lưu trên máy, tối đa 500 event, gửi theo lô 50, gom trong 2 giây.
- [ ] **ST-76** Có event đang chờ (offline) → Sign out → **Mong đợi:** queue của user đó bị xoá, không gửi sau đó.
- [ ] **ST-77** Tắt sharing → **Mong đợi:** lỗi/crash của app không được gửi lên admin "App errors" (xem mục 15).

### 5.9 Settings: Seasons (xem SO-213 → SO-216)

### 5.10 Settings: Notifications (10 mục)
- [ ] **ST-84** Section "Notifications" (role header) → **Mong đợi:** đủ 10 switch, mỗi cái có nhãn và mô tả đúng như sau:
  - "Daily goal reminder": "At a time you choose, if today’s goal is still open."
  - "Scheduled focus reminder": "At a time you choose, to start your planned focus."
  - "Streak reminder": "At a time you choose, on days without focus yet."
  - "Event starts": "When an event begins."
  - "Event ending soon": "Two days before an event you joined ends."
  - "Friend invites": "When a friend invites you to a challenge."
  - "Focus room invites": "When a friend invites you to a focus room."
  - "Challenge updates": "When a friend joins your challenge, or it is complete."
  - "Badge unlocked": "When a Community Tree you helped grow earns you a badge."
  - "Monthly recap ready": "When last month’s recap is ready."
- [ ] **ST-85** Mở Settings lần đầu sau khi cài → **Mong đợi:** không có hộp thoại xin quyền. Quyền không được hỏi lúc launch hay lúc mở Settings.
- [ ] **ST-86** Bật một mục lần đầu (quyền đang undetermined) → **Mong đợi:** Android hỏi quyền đúng lúc đó. Allow thì thiết bị được đăng ký (`PUT` device).
- [ ] **ST-87** Tắt một mục → **Mong đợi:** không hỏi quyền.
- [ ] **ST-88** Bấm Deny khi được hỏi → **Mong đợi:** switch vẫn giữ trạng thái bật (lựa chọn được lưu). Hiện ghi chú "Notifications are off for Focus Forest in your phone’s settings, so none can arrive yet." kèm nút "Open phone settings", nút này mở trang cài đặt của app.
- [ ] **ST-89** Tắt quyền trong cài đặt Android trong khi có ít nhất một mục đang bật, rồi mở Settings → **Mong đợi:** ghi chú trên hiện ngay mà không hỏi quyền lại. Khi tất cả mục đều tắt thì ghi chú không hiện.
- [ ] **ST-90** Bật "Daily goal reminder" lần đầu → **Mong đợi:** hiện "Reminder at 19:00" với 2 nút "Earlier" và "Later". TalkBack đọc "Daily goal reminder 15 minutes earlier" / "Daily goal reminder 15 minutes later".
- [ ] **ST-91** Giờ gợi ý cho hai reminder còn lại → **Mong đợi:** "Scheduled focus reminder" bật lần đầu là 09:00, "Streak reminder" là 20:00.
- [ ] **ST-92** Bấm Later một lần → **Mong đợi:** "19:15". Bấm Earlier hai lần nhanh → "18:45", mỗi lần bấm đều được tính.
- [ ] **ST-93** Đặt 23:45 rồi bấm Later → **Mong đợi:** "00:00" (quay vòng qua nửa đêm). Ở 00:00 bấm Earlier → "23:45".
- [ ] **ST-94** Tắt một reminder rồi bật lại → **Mong đợi:** giữ giờ đã chọn trước đó, không reset về giờ gợi ý. Khi reminder đang tắt thì không hiện dòng giờ.
- [ ] **ST-95** Đổi giờ, kill app rồi mở lại → **Mong đợi:** giờ vẫn được giữ.

### 5.11 Notifications: điều kiện gửi push (server)
- [ ] **ST-96** Đặt Daily goal reminder ở quarter-hour kế tiếp (ví dụ 15 phút sau), chưa đạt goal hôm nay → **Mong đợi:** nhận "A little focus today?" / "Your daily goal is N minutes. Your tree is ready when you are." đúng giờ địa phương. Job chạy mỗi 15 phút, nên có thể trễ trong phạm vi slot đó (chưa xác minh độ trễ thực tế).
- [ ] **ST-97** Đã đạt daily goal hôm nay → **Mong đợi:** Daily goal reminder không gửi.
- [ ] **ST-98** Hôm nay là rest day → **Mong đợi:** không có reminder nào trong 3 loại.
- [ ] **ST-99** Scheduled focus reminder → **Mong đợi:** "Time to focus" / "You planned a focus session for now. Your tree is ready when you are.".
- [ ] **ST-100** Streak reminder khi có streak ≥1 và hôm nay chưa focus → **Mong đợi:** "Your forest is waiting" / "N days of steady focus so far. A short session today keeps the rhythm, if it suits you.". Streak bằng 0 hoặc hôm nay đã focus thì không gửi.
- [ ] **ST-101** Mỗi loại reminder → **Mong đợi:** tối đa một lần mỗi ngày địa phương. Đổi giờ sau khi đã lên lịch thì bản cũ bị bỏ.
- [ ] **ST-102** Đang focus (solo hoặc trong room) khi tới giờ reminder → **Mong đợi:** không nhận. Kết thúc focus thì push được giữ lại sẽ đến; reminder bị giữ quá 2 giờ thì bị bỏ.
- [ ] **ST-103** Notification thông tin (Event starts/ending soon, Friend invites, Focus room invites, Challenge updates, Badge unlocked, Monthly recap ready) phát sinh ngoài 09:00–21:00 giờ địa phương → **Mong đợi:** chờ tới 09:00. Mặc định tối đa 2 notification thông tin mỗi ngày; vượt quá thì bị bỏ, không để dành. Có thể chỉnh `notifications.informationalHours` và `maxUnrequestedPerDay` trong admin → Configuration để test.
- [ ] **ST-104** Copy từng loại → **Mong đợi:**
  - Event starts: "<Event> has begun" / "Join whenever you like. Your usual focus counts toward its missions."
  - Event ending soon: "<Event> ends soon" / "It wraps up soon. Thank you for taking part.". Gửi 48 giờ trước khi kết thúc (`eventEndingSoonHours`).
  - Friend invites: "<Name> invited you to a challenge" / "Take a look together, if you'd like."
  - Focus room invites: "<Name> invited you to focus" / `The room "<Room>" is gathering. Join if you have time.`
  - Challenge updates: "Your challenge is complete" / "You reached it together. Nicely done." hoặc "<Name> joined your challenge" / "You're working toward it together now."
  - Badge unlocked: "A new badge: <Badge>" / "It is in your collection now."
  - Monthly recap ready: "Your <Month> recap is ready" / "Take a look back at the tree you grew this month."
  - Tên dài bị rút gọn kèm "…" (event 24 ký tự, tên bạn 20, room 40, badge 30). Người không có tên hiện username, không có cả hai thì "A friend".
- [ ] **ST-105** Monthly recap ready → **Mong đợi:** chỉ gửi vào ngày 1 của tháng lúc 09:00 địa phương, và chỉ khi tháng trước có ít nhất một session được tính. Hết hạn sau 3 ngày.
- [ ] **ST-106** Một mục đang tắt → **Mong đợi:** không nhận loại đó.
- [ ] **ST-107** Tài khoản bị suspend hoặc ban → **Mong đợi:** không nhận push nào.
- [ ] **ST-108** Đọc toàn bộ copy → **Mong đợi:** không có dấu chấm than, không có ngôn ngữ gây áp lực hay tội lỗi.

### 5.12 Notifications: hiển thị và chạm
- [ ] **ST-109** App đang mở (không focus) khi push đến → **Mong đợi:** có banner, có trong danh sách và có âm thanh.
- [ ] **ST-110** App đang mở và đang focus khi push đến → **Mong đợi:** không có banner, không có âm thanh.
- [ ] **ST-111** Notification của timer đến khi app đang foreground → **Mong đợi:** không có banner hệ thống. Màn Focus tự hiện kết thúc.
- [ ] **ST-112** App ở background, chạm push lời mời vào room → **Mong đợi:** mở đúng `/together/room/<id>`, nút back về Together.
- [ ] **ST-113** Chạm các link khác → **Mong đợi:** recap mở `/recap/YYYY/M`, event mở `/together/events/<slug>`, challenge mở `/together/challenges/<id>`, badge mở `/profile/achievements`.
- [ ] **ST-114** Cold start: kill app rồi chạm push → **Mong đợi:** app mở, khôi phục session, rồi vào đúng màn. Màn tab gốc nằm bên dưới để back.
- [ ] **ST-115** Chạm cùng một notification nhiều lần, hoặc chạm 2 cái giống nhau → **Mong đợi:** mỗi lần chạm mở một lần, không mở chồng vô hạn (chưa xác minh trên máy).
- [ ] **ST-116** Đang đăng xuất mà chạm push → **Mong đợi:** link được giữ, mở ngay sau khi đăng nhập xong. Lưu ý: người đăng nhập kế tiếp sẽ được dẫn tới link đó dù là tài khoản khác (ghi lại hành vi).
- [ ] **ST-117** Link lạ (ví dụ `focusforest://abc`) → **Mong đợi:** mở Home.
- [ ] **ST-118** Sign out (online) → **Mong đợi:** thiết bị bị huỷ đăng ký trước (`DELETE` device), sau đó không còn nhận push của tài khoản này. Lần launch sau, nếu quyền đã được cấp, thiết bị tự đăng ký lại mà không hỏi quyền.
- [ ] **ST-119** Sign out khi offline → **Mong đợi:** vẫn đăng xuất được. Server có thể vẫn giữ token nên push của tài khoản cũ có thể còn đến máy này (chưa xác minh).

### 5.13 Timer notification và focus lease
- [ ] **ST-120** Cài mới, bấm Start focus lần đầu → **Mong đợi:** hỏi quyền notification lúc này, mỗi lần launch hỏi tối đa một lần. Deny thì timer vẫn chạy bình thường và không hỏi lại.
- [ ] **ST-121** Start focus 5 phút, khoá máy → **Mong đợi:** đúng mốc hoàn thành có notification "Focus complete" / "Your focus session is ready.".
- [ ] **ST-122** Pause rồi đưa app vào nền → **Mong đợi:** notification chuyển sang mốc giới hạn pause (30 phút sau khi pause), nội dung "Focus session ended" / "Your paused session has been saved.". Resume thì quay về mốc hoàn thành mới.
- [ ] **ST-123** End sớm → **Mong đợi:** không còn notification thừa nào kêu sau đó.
- [ ] **ST-124** Chạm notification timer khi app ở background → **Mong đợi:** mở Session Completion của đúng session. Chạm khi app đã bị kill → Completion hiện dữ liệu server. Nếu lúc đó chưa sync (offline) thì có thể hiện "Focus session finished" / "Saved on this device. Your tree and progress update once it syncs.".
- [ ] **ST-125** A có notification timer đang chờ → A sign out, B sign in → chạm notification của A → **Mong đợi:** không mở Completion của A (request cho user khác bị bỏ).
- [ ] **ST-126** Focus lease: start focus rồi để server sinh một push (ví dụ B mời A vào room) → **Mong đợi:** A không nhận trong lúc focus. Push được giữ cho tới hết focus cộng grace 30 phút nếu đang pause (`focusLeaseGraceMinutes`). Kết thúc focus thì lease được xoá và push đến.
- [ ] **ST-127** App crash hoặc bị kill khi đang focus → **Mong đợi:** lease tự hết theo mốc đã gửi cộng grace. Lease tối đa khoảng 24 giờ. Mở lại app thì lease được đồng bộ lại khi app về foreground.

### 5.14 Dữ liệu: Download my data, Delete account, Sign out
- [ ] **ST-128** Settings → Account → "Download my data" → **Mong đợi:** nút bị disabled trong lúc chuẩn bị. Share sheet mở với title "Focus Forest data" và nội dung JSON thụt lề 2 khoảng. Các khoá chính: `exportedAt`, `account` (có `signInMethods`), `preferences` (settings/notifications/privacy), `topics`, `sessions`, `goals`, `trees`, `rewards`, `social` (following/followers/blocked/reactions…).
- [ ] **ST-129** Đọc JSON xuất ra → **Mong đợi:** không có password hash, token hay push token, không có email của người khác, không có báo cáo về mình.
- [ ] **ST-130** Download khi offline → **Mong đợi:** "We couldn't prepare your data. Check your connection and try again.". Lỗi khác thì "We couldn't prepare your data. Please try again.".
- [ ] **ST-131** Huỷ share sheet → **Mong đợi:** quay lại Settings bình thường (chưa xác minh có báo lỗi hay không).
- [ ] **ST-132** "Delete account" (nút đỏ, TalkBack hint "Asks you to confirm before anything changes.") → **Mong đợi:** mở màn "Delete account" với các đoạn:
  - "Your sessions, notes, trees, rewards, and friends are erased from Focus Forest right away. This cannot be undone."
  - "Minutes you gave to a Community Tree stay in its total, without your name."
  - "You can download a copy of your data first, from Settings."
- [ ] **ST-133** Nút "Delete my account" → **Mong đợi:** disabled cho tới khi có cả Password lẫn ô "Type DELETE to confirm" đúng "DELETE" viết hoa. Gõ "delete" thì vẫn disabled; khoảng trắng hai đầu được bỏ qua. TalkBack hint khi disabled: "Enter your password and type DELETE first.".
- [ ] **ST-134** Sai mật khẩu → **Mong đợi:** "That password is not right.", không có gì bị xoá.
- [ ] **ST-135** Xoá khi offline → **Mong đợi:** "We couldn't reach Focus Forest, so nothing was deleted. Check your connection and try again.".
- [ ] **ST-136** Thử sai quá 5 lần trong 1 giờ → **Mong đợi:** "We couldn't delete your account. Nothing was deleted; please try again." (rate limit `deleteAttempts`).
- [ ] **ST-137** Xoá thành công → **Mong đợi:** về màn auth, dữ liệu của user này trên máy bị xoá (dữ liệu của tài khoản khác thì giữ). Đăng nhập lại bằng tài khoản đó báo "Email or password is incorrect.".
- [ ] **ST-138** Tài khoản Google → **Mong đợi:** không có ô Password mà có dòng "Google asks you to confirm it is your account."; nút chỉ cần DELETE (hint "Type DELETE first."). Chọn tài khoản Google khác → "That Google account is not the one you sign in with. Nothing was deleted.". Huỷ chooser thì không báo lỗi. Lỗi Google khác → "We couldn't confirm with Google. Nothing was deleted; please try again.".
- [ ] **ST-140** A có timer đang chạy, topic đang chờ, note chưa sync → sign out → B sign in → **Mong đợi:** B không thấy gì của A. A đăng nhập lại thì dữ liệu còn và tiếp tục sync.

### 5.15 Lỗi và crash reporting
- [ ] **ST-141** Gây lỗi render trên một màn. Không có trigger sẵn: cần sửa code tạm, ví dụ throw trong một screen. Trong dev build, LogBox có thể che trước → **Mong đợi:** thay vì màn trắng là màn calm fallback "Something went wrong on this screen." / "Your focus and your forest are safe." với 2 nút "Try again" và "Go to Home". TalkBack coi đây là alert.
- [ ] **ST-142** Bấm "Try again" → **Mong đợi:** render lại màn đó. "Go to Home" → về Home. Chuyển sang màn khác bằng tab → fallback tự reset.
- [ ] **ST-143** Sharing đang bật → **Mong đợi:** admin → "App errors" thấy lỗi gồm Kind "Crash", Message, App (platform/version), Screen (ví dụ `/profile/settings`), Count, Last seen. "Show stack"/"Hide stack" mở và đóng stack. Report không mang danh tính (không có Authorization).
- [ ] **ST-144** Sharing đang tắt → **Mong đợi:** không có report nào lên admin, kể cả sau khi bật lại (report cũ bị bỏ).
- [ ] **ST-145** Lỗi xảy ra khi offline → **Mong đợi:** report giữ trong bộ nhớ (tối đa 20) và gửi lại ở lần report sau hoặc khi preferences tải lại. Kill app thì mất (không lưu xuống đĩa; chưa xác minh trên máy).
- [ ] **ST-146** Admin App errors → **Mong đợi:** bộ lọc "Period" với "Last day" / "Last 7 days" (mặc định) / "Last 30 days". Khi trống: "No errors reported in the last 7 days.". Dữ liệu giữ 30 ngày. Có bảng "Rate limits" ("Since …. Counts only: nothing says who.").
- [ ] **ST-147** Các màn khi tải lỗi → **Mong đợi:** luôn dùng ErrorState bình tĩnh với "Try again", không hiện thông điệp kỹ thuật.

### 5.16 Accessibility
- [ ] **ST-148** TalkBack ở tab bar → **Mong đợi:** đọc "Home", "Forest", "Together", "Insights", "Profile" và trạng thái selected.
- [ ] **ST-149** TalkBack ở Settings → **Mong đợi:**
  - Tiêu đề các section được đọc là heading.
  - Mỗi switch đọc đúng nhãn ("Sound", "Haptics", "Reduce motion", "Share usage data", 10 nhãn notification) kèm trạng thái on/off.
  - Chip theme đọc là button kèm trạng thái selected.
  - Nút Earlier/Later đọc nhãn đầy đủ (ST-90).
  - Ghi chú quyền bị chặn được đọc tự động (live).
- [ ] **ST-150** TalkBack ở Edit profile → **Mong đợi:** mỗi ô chỉ đọc tên ô một lần (Name, Username, Bio, Password, "Type DELETE to confirm"), không đọc nhãn thừa. Lỗi validation được đọc.
- [ ] **ST-151** TalkBack ở màn đang tải → **Mong đợi:** skeleton đọc "Loading your profile", "Loading your settings", "Loading your privacy settings", "Loading blocked people", "Loading your tree".
- [ ] **ST-152** TalkBack trên cây Home/Forest → **Mong đợi:** mỗi TreeScene đọc đúng một mô tả, không đọc từng layer SVG. Avatar frame không được đọc.
- [ ] **ST-153** Màn Focus → **Mong đợi:** countdown không tự đọc mỗi giây. Chạm "Time left" (hint "Reads the time left aloud.") thì đọc thời gian còn lại. Nhãn `Focusing` / `Paused` đọc được; Pause, Resume và End rõ nghĩa; trạng thái không chỉ dựa vào màu.
- [ ] **ST-154** Cỡ chữ và display size Android lên tối đa (khoảng 200%) → **Mong đợi:** Profile, Edit profile, Settings (gồm Notifications có dòng giờ), Privacy, Blocked, Delete account, Home, Focus, Completion và History không bị cắt chữ, cuộn tới được mọi nút. Không có Text nào tắt font scaling.
- [ ] **ST-155** Touch target → **Mong đợi:** mọi nút, chip, switch và nút Earlier/Later bấm dễ, vùng chạm tối thiểu 44×44.
- [ ] **ST-156** Dark mode → **Mong đợi:** chữ thường đạt độ tương phản ≥4.5:1, chữ lớn và icon/viền ô nhập ≥3:1. Kiểm tra bằng mắt hoặc công cụ ở Settings, Edit profile (helper text, lỗi), nút đỏ "Delete account", InlineStatus, ErrorState và overlay mùa.
- [ ] **ST-157** Không dựa vào màu → **Mong đợi:** trạng thái selected và lỗi đều có chữ hoặc trạng thái được đọc, không chỉ là màu.
- [ ] **ST-158** Reduce motion (hệ thống hoặc app) → **Mong đợi:** như ST-56 và ST-58. Không có nội dung nhấp nháy.

### 5.17 Offline và độ bền
- [ ] **ST-159** Mở app online một lần, rồi bật chế độ máy bay, kill và mở lại → **Mong đợi:**
  - Vẫn đăng nhập.
  - Home hiện cây đã lưu kèm "Showing your tree as last saved on this device.".
  - Start Focus và Topics hiện "Showing topics saved on this device.".
  - Goals hiện "Showing your goals as last saved on this device.".
- [ ] **ST-160** Home offline khi chưa từng có cache → **Mong đợi:** "We couldn't load your tree right now." + "Your focus sessions are safe on this device." + "Try again".
- [ ] **ST-161** Insights → History offline → **Mong đợi:** "Showing history saved on this device." kèm "Try again". Mở một dòng cũ vẫn xem được chi tiết. Không có "Load more" khi đang dùng dữ liệu trên máy.
- [ ] **ST-162** Insights offline khi đã tải trước đó → **Mong đợi:** "Showing the numbers last loaded." (chưa xác minh sau khi kill app).
- [ ] **ST-163** Profile, Settings, Privacy, Blocked và Lifetime stats offline → **Mong đợi:** không có cache, hiện ErrorState tương ứng (ST-15, ST-38, ST-65, ST-70, ST-13).
- [ ] **ST-164** Offline: tạo topic → **Mong đợi:** hiện ngay với nhãn "Waiting to sync". Start → End thì Completion hiện "Focus session finished" kèm "Saved on this device. Your tree and progress update once it syncs.". Viết note → "Note saved on this device.".
- [ ] **ST-165** Bật mạng lại và đưa app về foreground → **Mong đợi:** outbox session rồi note tự gửi, topic hết nhãn chờ. Màn hiện tại có thể cần "Try again" hoặc chuyển màn mới thấy dữ liệu mới, vì không có tự refetch khi foreground (chưa xác minh).
- [ ] **ST-166** Các thao tác cần mạng khi offline → **Mong đợi:** báo rõ và không đổi gì: "Choosing a species needs a connection. Nothing was changed.", "Highlighting needs a connection. Nothing was changed.", "Changing your showcase needs a connection. Nothing was changed.", và lỗi lưu ở Settings, Profile, Privacy, Export, Delete.
- [ ] **ST-167** Lỗi mạng tạm thời → **Mong đợi:** query tự thử lại tối đa 2 lần trước khi hiện lỗi. Lỗi 4xx không retry.

### 5.18 Khôi phục session và token
- [ ] **ST-171** Server từ chối refresh: dùng tài khoản A trên điện thoại; trên máy khác reset password của A ("Setting a new password signs you out on your other devices"), hoặc admin suspend/ban A → trên điện thoại thực hiện một thao tác cần server → **Mong đợi:** bị đăng xuất, về "Welcome back".

### 5.19 Rate limit
- [ ] **ST-178** Thử mã room sai hơn 20 lần trong 1 giờ → **Mong đợi:** "Too many codes tried for now. Please wait a few minutes and try again.".
- [ ] **ST-179** Sau khi chạm giới hạn, xem admin → App errors → bảng Rate limits → **Mong đợi:** cột Refused và Refused keys tăng ở dòng tương ứng ("Sign-in attempts", "New accounts", "Account deletion attempts", "Room codes tried"…). Có thể hạ giới hạn trong Configuration để test nhanh, sau đó trả lại.

### 5.20 Admin (kiểm tra cơ bản)
- [ ] **ST-180** Mở `http://localhost:3001` → **Mong đợi:** form "Focus Forest Admin" với Email, Password và nút "Sign in" (disabled khi đang gửi). Sai mật khẩu thì báo lỗi.
- [ ] **ST-181** Menu theo role → **Mong đợi:**
  - admin thấy Dashboard, Users, Reports, Rooms, Content, Live, Integrity, App errors, Checkpoint, Configuration, Audit log.
  - support không thấy Reports/Content.
  - moderator thấy Users, Reports, Rooms.
  - content thấy Content, Live, Integrity.
- [ ] **ST-182** Users → tìm A → chi tiết → **Mong đợi:** có dòng "Usage data: Shared/Not shared", khớp với switch trên điện thoại.
- [ ] **ST-183** Từ app, B report A, rồi vào admin Reports → **Mong đợi:** bộ lọc Status mặc định "Waiting (open and in review)". Bảng có cột Category, Status, Reported user, Open about them, Reporter, Filed. Khi trống: "No reports waiting.".
- [ ] **ST-184** Mở report → **Mong đợi:** có phần "Reported profile, as it is now". Mỗi hành động đều có hộp xác nhận:
  - "Resolve the report without action?"
  - "Warn this user and resolve the report?"
  - "Reset this user's username and resolve the report?"
  - "Reset this user's bio…"
  - "Reset this user's avatar…"
  - "Suspend this user…"
  - "Ban this user…"
- [ ] **ST-185** Warn → trên máy A mở Together → **Mong đợi:** card "A note from the Focus Forest team" với nội dung cảnh báo và nút "I understand". Bấm thì card biến mất.
- [ ] **ST-186** Reset username hoặc bio → **Mong đợi:** trên máy A, Edit profile có helper "Choose a username so friends can find you." hoặc bio trống.
- [ ] **ST-187** Suspend hoặc Ban → **Mong đợi:** A bị đăng xuất ở mọi nơi (ST-171) và đăng nhập lại thì báo như ST-172.
- [ ] **ST-188** Checkpoint → **Mong đợi:** ngày active và các event tăng sau ST-72.
- [ ] **ST-189** Configuration → **Mong đợi:** xem được các giá trị đang dùng: `notifications.maxUnrequestedPerDay` = 2, `informationalHours` = {9, 21}, `focusLeaseGraceMinutes` = 30, `eventEndingSoonHours` = 48, các `rateLimit.*`. Tạo version mới thì có hiệu lực.

**Lưu ý chung**
- Không xác minh được bằng code: chưa có trigger crash sẵn. Hai mục ST-48 và ST-116 là hành vi thực tế mà team nên quyết định có chấp nhận hay không.
- Cần ghi lại để team quyết định: Haptics chưa có tác dụng gì (ST-53), và app không tự refetch khi quay lại foreground (ST-165).
- Nguồn chính: `focus-forest-mobile/src/app/(tabs)/profile/*`, `src/preferences/*`, `src/notifications/*`, `src/monitoring/*`, `src/account/*`, `src/api/session.ts`, `src/auth/describe-error.ts`, `focus-forest-mobile/MANUAL_QA.md`, các test trong `src/__tests__/`, và phía API trong `focus-forest-api/src/notifications/*` và `prisma/migrations/*`.
## 6. Những điểm đã biết cần anh quyết định

Khi soạn danh sách, đọc code thấy mấy hành vi sau. Đây không hẳn là lỗi, nhưng nên quyết là giữ hay sửa:

| Case | Hành vi hiện tại |
|---|---|
| ST-53 | Công tắc **Haptics** chỉ được lưu; app chưa rung ở đâu cả (chưa có `expo-haptics`). |
| CL-140 | Gõ note ở Completion rồi bấm **Back** cứng (không Save, không Done) thì bản nháp mất. |
| CL-53 | Docs có nói **gợi ý tên topic**, nhưng code chưa có. |
| ST-48 | Đã chọn theme Dark, mở app khi offline thì app theo theme hệ thống (vì không đọc được cài đặt). |
| ST-116 | Bấm thông báo khi đang đăng xuất: link được giữ và mở cho **người đăng nhập kế tiếp**, kể cả tài khoản khác. |
| ST-165 | Quay lại app từ nền không tự tải lại dữ liệu; phải chuyển màn hoặc "Try again". |
| SO-37, SO-38, SO-104 | Follow hoặc reaction thất bại (mất mạng, quá giới hạn) không hiện thông báo nào. |
| SO-125 | Tài khoản chưa có topic vào phòng Focus Together thì không bấm được "I'm ready" và không có gợi ý tạo topic. |
| SO-62 | Block một người đang ở chung phòng thì cả hai vẫn ở trong phòng. |

## 7. Ghi lỗi

Mỗi lỗi ghi một khối như sau (dán vào issue hoặc gửi em):

```
Case: CL-91
Máy / Android: Pixel 7 / Android 15
Build: dev build ngày …, commit …
Tài khoản: A (mật khẩu) / Google
Online hay offline:
Các bước:
1.
2.
Mong đợi:
Thực tế:
Ảnh / video:
Log API (nếu có):
```
