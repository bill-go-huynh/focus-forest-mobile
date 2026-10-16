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

## Phase 4: Progression và chuẩn bị Checkpoint (HOÃN, ghi lại ở CR.7)

X4 và CR.X đã kiểm tra tự động contract, logic và màn hình. Các mục dưới cần thiết bị hoặc mắt người.

### P4.1 Unlock và badge
- [ ] Session vượt mốc (ví dụ first session): cây phản ứng trước, rồi tới badge, một badge nổi bật, phần còn lại gói trong một dòng "Also unlocked"; không có gì hiện trong lúc đang focus.
- [ ] Có ceremony cuối tháng cùng lúc: unlock đọc xong mới tới ceremony, không chồng lên nhau.
- [ ] Reduce Motion: badge chỉ fade, vẫn đọc được tên.
- [ ] Badge mới (FR.Q1–Q2, 2026-10-15). Để khỏi chờ 10 phiên, hạ target trong admin (Content → Achievements) xuống 1–2 rồi trả lại sau:
  - Early Bird: phiên bắt đầu trước 07:00 giờ máy; 07:00 đúng thì không tính.
  - Night Owl: phiên bắt đầu từ 22:00.
  - Weekend Warrior: Collection Book hiện tiến độ "x / 4 weekends"; chỉ tăng khi có focus cả thứ Bảy lẫn Chủ nhật.
  - Community Contributor: tham gia event đang chạy, focus một phiên đủ tính, badge hiện ngay sau phiên đó (một lần duy nhất).

### P4.2 Loài và garden
- [ ] Chọn loài khi cây còn là Seed (Home → "Choose this month's tree"): preview Seed và Final Form của mỗi loài nhìn hợp lý (art vẫn là placeholder).
- [ ] Sau session đầu tiên của tháng: Tree Details không còn "Change species", màn chọn loài báo đã khoá.
- [ ] Garden đã trang bị (Misty Hills, Stone Lantern) chỉ hiện quanh cây tháng hiện tại, không hiện ở tháng đã lưu trữ hay recap.

### P4.3 Collection Book
- [ ] Forest → Collection Book: lưới đều, món chưa có là silhouette, hint không có chữ gây gấp gáp.
- [ ] Trang bị và bỏ trang bị một decoration, quay lại Home thấy đổi ngay; offline thì báo cần kết nối, không đổi gì.
- [ ] Profile: vignette 3 cây gần nhất, bấm vào mở Forest; khung avatar (Twig Frame) khi đã trang bị.

### P4.4 Analytics (Checkpoint)
- [ ] Settings → Privacy → "Share usage data" bật sẵn, có dòng giải thích; tắt thì không còn event nào được gửi (xem admin → user → Usage data: Not shared).
- [ ] Mở app, vào Forest, Recap, Insights, bắt đầu một focus: admin → Checkpoint thấy ngày active tăng.
- [ ] Offline vài phút rồi online lại: event được gửi sau, không mất.

## Phase 5: Together (HOÃN, ghi lại ở Phase 5 REVIEW, bổ sung ở X7)

Cần hai máy (hoặc một máy và một simulator) với hai tài khoản, cùng trỏ vào một API.

### P5.1 Room và kênh live
- [ ] Tạo room, máy kia vào bằng mã: cả hai thấy nhau trong lobby gần như ngay lập tức.
- [ ] Chủ room bắt đầu: máy kia tự bắt đầu focus cùng giờ; rời room giữa chừng thì người còn lại thấy thay đổi, focus của mình không bị ảnh hưởng.
- [ ] Tắt mạng một máy vài giây rồi bật lại: room tự nối lại, không nhân đôi người.

### P5.2 Bạn bè và reaction
- [ ] Follow, xem Forest của bạn; reaction bay lên nhẹ nhàng, Reduce Motion thì chỉ fade.
- [ ] Block một người: họ biến khỏi lobby, bảng xếp hạng và danh sách theo dõi.

### P5.3 Event, Community Tree, season
- [ ] Overlay theo mùa và ribbon kỷ niệm của event nhìn hợp lý (art vẫn là placeholder).
- [ ] Community Tree lớn dần khi focus trong event; số phút khớp với admin.
- [ ] Bảng xếp hạng chỉ hiện người đã bật; tắt trong Privacy thì mình biến khỏi bảng.

## Phase 6: Notifications (HOÃN, ghi lại ở X6)

Cần development build, một EAS project (`expo.extra.eas.projectId`), và API chạy với `PUSH_PROVIDER=expo`. Thiếu EAS project thì app vẫn hỏi quyền nhưng không đăng ký thiết bị, nên không có push nào đến.

### P6.1 Quyền và cài đặt
- [ ] Cài mới, mở app lần đầu: không có hộp thoại xin quyền notification.
- [ ] Settings → Notifications: đủ 10 mục, mỗi mục có một dòng nói rõ sẽ gửi gì.
- [ ] Bật một mục lần đầu: hệ điều hành hỏi quyền đúng lúc đó. Tắt một mục thì không hỏi.
- [ ] Từ chối quyền: Settings hiện ghi chú bình tĩnh và nút "Open phone settings" mở đúng trang cài đặt của app.
- [ ] Bật nhắc mục tiêu ngày: hiện "Reminder at 19:00"; Earlier/Later đổi theo 15 phút; tắt rồi mở lại app vẫn giữ giờ đã chọn.

### P6.2 Push thật
- [ ] Đặt nhắc mục tiêu ngày sớm hơn hiện tại 15 phút: nhận đúng giờ địa phương; chữ không gây áp lực.
- [ ] Đang focus (solo hoặc trong room): không nhận push nào; kết thúc focus thì push bị giữ đến ngay (hoặc bị bỏ nếu đã hết hạn).
- [ ] Mở app trong lúc focus: push đến không hiện banner; khi không focus thì có banner.
- [ ] Đăng xuất: không còn nhận push của tài khoản đó trên máy này.

### P6.3 Bấm vào notification
- [ ] App đang chạy: bấm lời mời vào room mở đúng room; nút back về Together.
- [ ] App đã bị kill: bấm notification mở app rồi vào đúng màn sau khi đăng nhập xong.
- [ ] Link lạ (`focusforest://abc`) mở Home.
- [ ] Mời bạn từ lobby của room; bạn thấy lời mời ở Together, Open rồi Join room được, Decline thì lời mời biến mất.

## Phase 7: Release hardening (HOÃN, ghi lại ở M7.4 và X7)

### P7.1 Hiệu năng trên máy tầm trung
- [ ] Mở app lạnh tới Home dưới 2,5 giây.
- [ ] Cây ở Home không giật (khung hình dưới 16 ms) khi chuyển tab qua lại.
- [ ] Forest 12 tháng cuộn mượt 60 fps; có trang trí và theme theo mùa.

### P7.2 Trợ năng trên máy thật
- [ ] VoiceOver và TalkBack: mỗi ô nhập chỉ đọc một lần (tên ô), không đọc nhãn thừa.
- [ ] Chữ 200%: không mất nội dung ở Home, Focus, Settings, xoá tài khoản.

### P7.3 Dữ liệu của bạn
- [ ] Settings → Download my data mở share sheet với JSON đầy đủ.
- [ ] Xoá tài khoản: cần mật khẩu và gõ DELETE; sau đó về màn bắt đầu, đăng nhập lại báo sai.

### P7.4 Lỗi
- [ ] Màn lỗi bình tĩnh hiện thay vì màn trắng; "Try again" và "Go to Home" hoạt động.

## Art pass: hướng B, font, animation (ART.1–ART.9, 2026-10-16/17)

Xem trước không cần chạy app: `../art-preview/art-pass.html`. Các mục dưới cần máy thật.

### A1. Cây và cảnh (quality gate, docs/10 §4)
- [ ] Home: cây đẹp ở cả 7 stage, cả ngày, hoàng hôn, đêm (đổi giờ máy để thấy dawn/day/golden/dusk/night).
- [ ] Forest: thumbnail 96px vẫn đọc được hình cây; không có grain ở thumbnail.
- [ ] Grain giấy nhìn tinh tế, không bẩn; cụm lá không có cạnh răng cưa lạ.
- [ ] Đặt cạnh app cùng loại: cây không thua về chất lượng (quyết định của chủ dự án).

### A2. Animation (docs/04 §5, §7)
- [ ] Lá sau, lá chính, lá trước đung đưa lệch nhịp; thân không bao giờ cong.
- [ ] Thỉnh thoảng có gió nhẹ (15–40 s); cây Quiet thì không.
- [ ] Phấn hoa trôi; ban đêm cây giàu nhất có đom đóm lập lòe nhẹ.
- [ ] Bật Reduce Motion: cây đứng yên hoàn toàn.
- [ ] Máy tầm trung: Home không giật khung hình; pin không tụt rõ trong một phiên focus dài.

### A3. Font (Fraunces + Inter)
- [ ] Tiêu đề tháng và recap dùng Fraunces; còn lại Inter; timer số không nhảy (tabular).
- [ ] Mở app lần đầu không thấy chữ đổi font giữa chừng.
- [ ] Cỡ chữ hệ thống 200%: không cắt chữ.
- [ ] Expo Go và development build đều có font.

### A4. Badge, icon, hình minh hoạ, Collection
- [ ] Badge đọc được ở 48px; độ hiếm (mờ, vàng, vàng có hào quang) phân biệt được, không lòe loẹt.
- [ ] Icon tab: tab đang chọn tô đặc; tab Forest là hai cây.
- [ ] Hình minh hoạ ở empty/error state đẹp ở cả chế độ sáng và tối.
- [ ] Collection Book: vignette cosmetic và khung avatar nhìn hợp lý.

### A5. Chọn icon chủ đề (ART.9)
- [ ] Profile → Topics → một chủ đề → mục "Icon": 50 icon có tên, icon hiện tại được chọn.
- [ ] Đổi icon, Save: icon mới hiện ở danh sách chủ đề, chip chọn chủ đề, màn focus và history.
- [ ] VoiceOver/TalkBack đọc tên icon và trạng thái đã chọn.

### A6. Community Tree hồng (Shared Blossom)
- [ ] Màn Community Tree: cây dáng sakura, hoa hồng dày dần theo mốc, cánh hoa bay; lá vẫn xanh.

## Khi gặp lỗi, ghi lại

- Bước đang làm, hành vi mong đợi và hành vi thực tế.
- Online hay offline, foreground hay background, có kill app không.
- Nền tảng và máy (Android hoặc iOS).
- Log API (`PUT /me/sessions/:id`, `PATCH …/note`, mã lỗi).
- Chụp màn hình, hoặc quay màn hình nếu lỗi liên quan tới thời gian.
