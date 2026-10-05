# Manual QA còn nợ

> **Trạng thái: HOÃN** (2026-10-03, theo quyết định của chủ dự án để phát triển nhanh hơn).
> Phase 2 mới chỉ được đóng bằng kiểm tra tự động: `npm run check` (unit, integration, mutation), API `npm run check`, và integration checkpoint `5e9b784`.
> **Chưa có buổi QA nào trên thiết bị thật.** Phải chạy hết file này trước khi phát hành, hoặc ở checkpoint lớn kế tiếp.
>
> **Cập nhật X3 (2026-10-04):** Phase 3 (Core Loop) cũng chỉ được đóng bằng kiểm tra tự động (integration X3 trên HTTP + PostgreSQL thật, contract capture dùng chung với mobile, mutation có mục tiêu). Phần còn nợ của Phase 3 nằm ở mục **Phase 3: Core Loop** bên dưới. Vẫn **HOÃN**: không làm trong X3, làm cùng đợt QA hoặc phát hành.

## Trước mỗi buổi QA

- API (`focus-forest-api`):
  ```bash
  npm run db:up
  npm run prisma:migrate:deploy   # DB dev từng thiếu 5 migration Phase 2
  npm run start:dev
  ```
- Mobile: đặt `EXPO_PUBLIC_API_URL` là **IP LAN** của Mac (thiết bị thật không gọi được `localhost`).
- Profile của user phải có time zone. Nếu thiếu, session đứng ở `blocked_timezone` và không sync.
- Cần 2 tài khoản (A, B) để test tách user.
- Mốc thời gian: session ngắn nhất được tính là 5 phút; pause tối đa 30 phút.

## Chạy trên thiết bị: Expo Go hay development build

- **Expo Go trên Android:** từ SDK 53, chỉ cần load `expo-notifications` là app văng lỗi. App có guard (`src/notifications/os-timer-notifications.ts`) nên vẫn chạy được, nhưng **tắt hẳn notification**: không hỏi quyền, không lên lịch, chạm notification không mở gì. Dùng được cho mọi mục trừ phần notification.
- **Expo Go trên iOS:** local notification vẫn chạy (chỉ có warning). Nhưng notification mang danh Expo Go, nên cold launch vẫn phải test lại trên development build.
- **Development build:** cần cho mục 3, 4 và phần notification của mục 8. Đây mới là bản phản ánh đúng app thật: đúng tên, icon, kênh Android, cold launch vào đúng app.

### Development build bằng EAS (đã chuẩn bị một phần)

Đã có trong repo: dependency `expo-dev-client`, và `eas.json` với profile `development` (dev client, cài nội bộ, Android ra APK).

Còn phải làm:
1. `npx eas-cli@latest login`
2. `npx eas-cli@latest init --id <project-id trên expo.dev>`. Lệnh này ghi `projectId` và `owner` vào `app.json`.
3. `npx eas-cli@latest build --profile development --platform android`
   - Application id: chọn một lần cho lâu dài, ví dụ `com.<tên>.focusforest`.
   - Keystore: để EAS tự tạo.
4. Cài APK từ link hoặc QR lên điện thoại.
5. `npx expo start` (khác mạng thì thêm `--tunnel`), mở app Focus Forest và quét QR.
   - Chỉ build lại khi đổi phần native. Đổi code JS chỉ cần reload.
   - **Không** dùng profile `production` hay lệnh `eas submit` cho QA.

Cách khác: cài Android Studio và JDK 17, đặt `ANDROID_HOME`, rồi chạy `npx expo run:android` (không cần EAS).

## Checklist

### 1. Online happy path
- [ ] Sign in → tạo topic → Start Focus → Change duration (5 phút) → Start focus: vào Focus toàn màn hình, không có tab bar.
- [ ] Pause khoảng 30 giây → Resume: countdown tiếp tục đúng chỗ dừng.
- [ ] Để session tự kết thúc: Completion tự mở và lên **Session complete** · "N min focused".
- [ ] Viết note → Save note: hiện "Note saved on this device." rồi "Note saved." → Done về Home.
- [ ] Start lại cùng topic: topic nhớ duration lần trước (remembered duration).
- [ ] Insights → Focus history: có heading ngày và dòng "Topic, giờ · Completed, 5 min". Chạm vào thì note đúng; Done quay về History.
- [ ] End sớm sau khoảng 1 phút: Completion là "Focus session saved"; History hiện **Not counted**, lời lẽ nhẹ nhàng.

### 2. Background và khoá máy
- [ ] Khoá máy 2–3 phút khi đang chạy: countdown đúng giờ thật, không lệch.
- [ ] Lặp lại khi đang Pause: thời gian còn lại không giảm.
- [ ] Pause quá 30 phút: session kết thúc, chỉ tính phần focus trước khi pause.

### 3. Notification thật (development build)
- [ ] Không hỏi quyền cho tới khi bấm Start focus lần đầu.
- [ ] Deny: timer vẫn chạy bình thường và không hỏi lại.
- [ ] Bật quyền, khoá máy: có notification đúng lúc C.
- [ ] Settings → tắt Sound: Android vẫn hiện nhưng không có tiếng (kênh `focus-timer-silent`).
- [ ] Pause khi app ở background: notification chuyển sang giờ L. Resume: về C mới.
- [ ] End sớm: không còn notification thừa kêu sau đó.
- [ ] Đang mở app ở foreground khi tới C: không có banner hệ thống.
- [ ] Chạm notification (app ở background): mở đúng Completion.

### 4. Cold launch từ notification (development build)
- [ ] Session đã sync → kill app → chạm notification: Completion hiện dữ liệu server, **không** có "This session isn't on this device.".
- [ ] Chạm nhiều lần không mở chồng Completion.
- [ ] Kill app khi chưa sync (offline) → bật mạng → chạm: hiện "Saving…" hoặc "Focus session finished", rồi lên kết quả server.

### 5. Offline-first
- [ ] Mở app online một lần, rồi bật chế độ máy bay.
- [ ] Tạo topic offline: hiện ngay với nhãn "Waiting to sync".
- [ ] Start → Pause → Resume → End: Completion "Focus session finished" kèm "Saved on this device.".
- [ ] Viết note → Done: về Home ngay, không bị treo.
- [ ] Kill app → mở lại vẫn offline: không có Resume focus, topic vẫn đang chờ, History hiện kèm "Showing history saved on this device.".
- [ ] Bật mạng → đưa app về foreground: History có session kèm note, topic hết nhãn chờ.
- [ ] Tắt mạng, mở một dòng History cũ: chi tiết vẫn mở được; sửa note thì hiện "Note saved on this device.".

### 6. Kill và restart khi timer đang chạy
- [ ] Kill khi đang chạy → mở lại: Home có **Resume focus**, thời gian đúng, không tạo session thứ hai.
- [ ] Kill khi đang Pause: vẫn đang pause, thời gian còn lại giữ nguyên.
- [ ] Kill rồi chờ qua C mới mở: ghi nhận completed đúng C.

### 7. Back và gesture
- [ ] Android back trong Focus: hỏi End session. "Keep focusing" thì tiếp tục; xác nhận thì kết thúc.
- [ ] iOS vuốt từ mép trái: không thoát được Focus.
- [ ] Để hộp xác nhận End mở cho tới khi qua C: ghi nhận **Session complete**, không phải ended early.
- [ ] Done từ Completion tự mở → Home; Done từ History → History.

### 8. Tách user
- [ ] A để timer đang chạy, topic đang chờ và note chưa sync → sign out → B sign in: B không thấy gì của A.
- [ ] (development build) Notification của A kêu khi B đang đăng nhập: chạm vào không mở Completion của A.
- [ ] A đăng nhập lại: dữ liệu còn nguyên và tự sync tiếp.

### 9. Accessibility và layout
- [ ] Cỡ chữ khoảng 200%: Topics, Duration, Focus, Completion, History không bị cắt, cuộn tới được mọi nút.
- [ ] Screen reader: countdown không tự đọc; chạm **Time left** mới đọc; Pause, Resume, End rõ nghĩa.
- [ ] Completion đọc kết quả một lần. History đọc ngày là heading, mỗi dòng đọc đủ topic, giờ, trạng thái, thời lượng.

### 10. Kiểm tra bằng mắt
- [ ] "Not counted" và "Ended early" không tạo cảm giác bị phạt.
- [ ] Topic đã archive vẫn hiện đúng tên trong History.
- [ ] Load more với hơn 30 session, không có dòng trùng.
- [ ] Dark mode dễ đọc trên Focus, Completion, History.
- [ ] Focus chạy 10–15 phút: ring và countdown không giật, máy không nóng hay tốn pin bất thường.

## Phase 3: Core Loop (HOÃN, ghi lại ở X3)

X3 đã kiểm tra tự động toàn bộ chuỗi Focus → session → cây → goals/streak/rest → Home/Completion → đóng tháng → Forest → Recap → Insights. Những mục dưới đây cần thiết bị, OS hoặc mắt người, nên **chưa chạy**.

### P3.1 Ma trận thiết bị
- [ ] iOS (một iPhone gần đây, development build).
- [ ] Android (một máy đời mới, development build).
- [ ] Một máy Android tầm trung (RAM khoảng 4 GB): Home, Forest, Insights cuộn mượt, không nóng máy.
- [ ] Chữ lớn (khoảng 200%) trên cả hai nền tảng.
- [ ] Dark và light theme trên cả hai nền tảng.

### P3.2 Tree renderer
- [ ] SVG cây vẽ đúng ở mọi stage (Seed → Final Form), không vỡ layer, không lệch tỉ lệ.
- [ ] Reanimated: transform origin của canopy đúng (lắc quanh gốc, không quanh góc), gust tắt dần êm.
- [ ] Hero trên Home: reaction tăng trưởng (stage cross-fade, blossoms, trait) chạy một lần, không giật.
- [ ] Forest thumbnails: đứng yên, không có ambient animation; cuộn landscape 36+ tháng vẫn mượt, chỉ vài thumbnail được mount.
- [ ] Background/foreground: idle sway dừng khi app vào nền, chạy lại khi quay về; ánh sáng theo giờ đổi đúng lúc quay lại.

### P3.3 Accessibility
- [ ] VoiceOver (iOS): mỗi TreeScene đọc đúng một mô tả, không đọc layer SVG bên trong.
- [ ] TalkBack (Android): như trên; Forest List view đọc đủ tháng, kể cả tháng nghỉ ("a quiet month").
- [ ] Chữ 200%: Home, Tree Details, Goals, Forest List, Recap, Insights (ngày, topic, records), Profile không bị cắt và cuộn tới mọi nút.
- [ ] Thứ tự focus hợp lý trên Ceremony, Recap (Next, Back, Share) và Insights (chip Week/Month, ngày, bộ lọc History).
- [ ] Bật Reduce Motion của OS: cây không lắc idle; tăng trưởng chỉ là cross-fade ngắn; ceremony đi thẳng tới hạt giống; thông tin vẫn đọc đủ.

### P3.4 Share native
- [ ] Chụp thẻ recap thành ảnh: ảnh đúng thẻ (tháng, cây, stage, focus, ngày active, streak), không có note, topic hay id.
- [ ] Share sheet mở được trên iOS và Android; gửi được qua ít nhất một app.
- [ ] Huỷ share sheet: app quay lại trang share bình thường, không báo lỗi.
- [ ] Share không khả dụng (ví dụ simulator, hoặc không có app nhận): app chia sẻ chữ, hoặc báo "Sharing isn't available right now.".
- [ ] File PNG tạm: không lưu vào thư viện ảnh, không xin quyền ảnh; không dồn file tạm sau nhiều lần share.

### P3.5 Focus timer
- [ ] Khoá màn hình giữa session: hết giờ vẫn đúng mốc, Completion đúng.
- [ ] App vào nền giữa session: quay lại thấy đúng thời gian còn lại.
- [ ] Kill app rồi mở lại giữa session: Resume focus đúng; kill sau khi hết giờ: session được lưu, sync một lần, celebration hiện đúng một lần.
- [ ] Local notification khi hết giờ (development build): chạm mở đúng Completion.

### P3.6 Ranh giới tháng
- [ ] Để app ở foreground qua nửa đêm cuối tháng (giờ thật của máy), rồi qua hết grace period (mặc định 3 giờ): mở Home thấy cây tháng mới và ceremony của tháng vừa đóng.
- [ ] Ceremony hiện một lần; Skip hoặc trồng xong thì không lặp lại; kill trước khi chấp nhận thì lần mở sau hiện lại.
- [ ] Có session vừa sync đúng lúc mở tháng mới: khoảnh khắc tăng trưởng chạy trước, ceremony theo sau, không chồng lên nhau (X3 đã sửa và kiểm tra tự động; cần xem bằng mắt).
- [ ] Highlight note (X3.G): mở một session có note từ History, bấm **Highlight in monthly recap**, thấy dòng đã highlight; bấm **Remove from monthly recap** thì mất. Offline: báo cần kết nối, không đổi gì. Xoá note thì highlight cũng mất.
- [ ] Sau khi tháng đóng: recap và Tree Details của tháng đó giữ đúng note đã highlight lúc archive, kể cả khi sau đó sửa note, bỏ highlight hay highlight note khác của tháng ấy.
- [ ] Session offline thuộc tháng đã đóng, sync sau: lưu bình thường, Completion nói tháng đó đã nằm trong forest, không có celebration; Insights giải thích chênh lệch, Forest/Recap giữ nguyên.

## Khi gặp lỗi, ghi lại

- Bước đang làm, hành vi mong đợi và hành vi thực tế.
- Online hay offline, foreground hay background, có kill app không.
- Nền tảng và máy (Android hoặc iOS).
- Log API (`PUT /me/sessions/:id`, `PATCH …/note`, mã lỗi).
- Chụp màn hình, hoặc quay màn hình nếu lỗi liên quan tới thời gian.
