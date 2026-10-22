# Focus Forest: kịch bản demo

Thay cho danh sách test dài (`MANUAL_TEST_CASES.md`, giữ lại để tra khi cần). Đây là **các flow để trình bày cho mentor**, theo thứ tự. Mỗi flow mất 1–3 phút. Đi lần lượt; vấp chỗ nào thì ghi số flow và bước đó để sửa.

Trên điện thoại chỉ đăng nhập **một tài khoản** (Gmail demo). Bạn bè (Mai, Khoa, Linh) do admin điều khiển bằng nút bấm, không cần đăng nhập vào họ.

Ký hiệu: **📱** làm trên điện thoại · **💻** làm trên admin (laptop) · **🗣** câu nói gợi ý.

---

## 0. Chuẩn bị (trước buổi demo, khoảng 5 phút)

1. 💻 API: trong `focus-forest-api` chạy `npm run start:dev`. Admin: trong `focus-forest-admin` chạy `npm run dev`, mở `http://localhost:3001`, đăng nhập `admin@focusforest.test` / `admin123`.
2. 📱 App: `npx expo start`, mở app trên máy. IP trong `focus-forest-mobile/.env` phải đúng IP của Mac (`ipconfig getifaddr en0`).
3. 💻 **Demo** → nhập Gmail dùng để demo (chưa từng đăng ký app) → **Make a demo world**. Cần từ ngày 8 trong tháng trở đi.
4. 💻 Ngay trước khi bắt đầu: **Open a fresh waiting room** (phòng chờ chỉ sống 2 giờ).
5. 📱 Đăng xuất nếu đang đăng nhập; bật thông báo cho app; để máy không ở chế độ im lặng (để thấy rung).

---

## 1. Người dùng mới, rồi chuyển sang tài khoản demo

- 📱 Mở app → 4 trang giới thiệu. Vuốt qua.
- 🗣 "Đây là app hẹn giờ tập trung. Mỗi tháng tập trung nuôi một cái cây, các tháng thành khu rừng."
- 📱 **Create account** bằng một email bất kỳ → **Thấy:** Home với cây hạt giống của tháng này, chưa có lịch sử.
- 🗣 "Đây là trải nghiệm ngày đầu. Để xem app sau vài tháng dùng, em chuyển sang một tài khoản đã có sẵn dữ liệu."
- 📱 Profile → Settings → **Sign out** → **Sign in** ở góc trên → **Continue with Google** → chọn Gmail demo.
- **Thấy:** vào thẳng tài khoản đã có lịch sử. Từ đây tới hết buổi chỉ dùng tài khoản này.

## 2. Lễ trồng cây và recap tháng trước

- **Thấy:** lần mở đầu tiên, app mở lễ trồng cây của tháng trước.
- 📱 Bấm **Plant in your forest** → cây thu nhỏ vào rừng, hạt mới cho tháng này. Máy rung nhẹ.
- 📱 **View recap** → lướt vài trang: tổng giờ, chủ đề nổi bật, badge, ghi chú.
- 🗣 "Hết tháng, cây không mất đi: nó được trồng vào khu rừng, kèm bản tóm tắt tháng."

## 3. Home: cây là trung tâm

- **Thấy:** cây tháng này ở giữa, vòng mục tiêu ngày, chuỗi **6 ngày**, phút tuần này.
- 📱 Bấm **Tree details**: giai đoạn, số phút, số ngày có học, mục tiêu đã đạt.
- 🗣 "Không có bảng số liệu: cây là thứ chính, con số chỉ đi kèm."

## 4. Một phiên tập trung

- 📱 **Start Focus** → **New topic** → chạm gợi ý **Study** (có sẵn biểu tượng) → **Create** → chọn **25 min**.
- **Thấy:** màn Focus đếm ngược, cây trong vòng tròn, chữ "Focusing".
- 📱 Bấm **Pause** → chữ đổi "Paused", hiện thời gian tạm dừng còn lại → **Resume** → **End session** → xác nhận.
- 🗣 "Phiên dưới 5 phút không được tính. Tắt app hay mất mạng thì đồng hồ vẫn đúng."
- Để thấy một phiên đầy đủ mà không phải đợi 25 phút, chuyển sang flow 5.

## 5. Phần thưởng sau một phiên (admin giả lập phiên vừa xong)

- 📱 Để app ở Home.
- 💻 Demo → thẻ **Tree and streak** → **Add a finished session** (sẵn 25 phút).
- **Thấy (vài giây sau, không cần chạm):** cây lớn lên **Mature Tree**, badge **50 Hours** kèm cây Phong, chuỗi thành **7 ngày** kèm cây Thông, máy rung.
- 🗣 "Phần thưởng chỉ đến sau khi xong phiên, không bao giờ trong lúc đang tập trung."

## 6. Ngày nghỉ và chuỗi ngày

- 💻 **Make today a rest day**.
- **Thấy:** Home đổi thành "Rest day today · your … streak is kept".
- 🗣 "Ngày nghỉ là chính thức: tối đa 2 ngày mỗi tuần mà không mất chuỗi. Cây không bao giờ chết, vắng lâu thì chỉ 'nghỉ yên'."

## 7. Khu rừng và thống kê

- 📱 Tab **Forest**: các cây theo tháng, cây tháng 8 và tháng 9 đã vào rừng.
- 📱 Tab **Insights**: tuần, tháng, bản đồ nhiệt, kỷ lục, chủ đề nhiều nhất.

## 8. Bạn bè

- 📱 Tab **Together** → thẻ **Your people**: Following / Followers (5 người theo dõi).
- 💻 **A friend reacts to the forest** (mỗi lần bấm là một bạn khác: Linh, Mai, Khoa).
- **Thấy:** thẻ **Reactions** có reaction mới ngay.
- 📱 Bấm vào một người → xem cây và khu rừng của họ, thả cảm xúc.
- 🗣 "Chỉ có cảm xúc tích cực, không bình luận, không so sánh."

## 9. Focus Together (tập trung cùng nhau)

- 📱 Together → thẻ **Focus rooms** → lời mời **Study with Mai** → **Join**.
- **Thấy:** Mai và Khoa đã ở trong phòng, Khoa **Ready**.
- 📱 Chọn chủ đề → **I'm ready** → đếm ngược chung bắt đầu.
- 🗣 "Không có chat, chỉ thấy ai đang có mặt và sẵn sàng."

## 10. Sự kiện và Community Tree

- 📱 Together → thẻ **Events** → **Demo Grove**.
- **Thấy:** sau flow 5, Community Tree đã vượt mốc đầu.
- 🗣 "Phút của mọi người cùng nuôi một cây chung; ai góp cũng có phần thưởng."

## 11. Thông báo

- 📱 Khoá máy.
- 💻 Thẻ **Send a notification now** → bấm **Monthly recap ready** (mỗi loại thông báo là một nút).
- **Thấy:** thông báo đến trong vài giây; chạm vào thì mở đúng màn recap.
- 🗣 "Không gửi khi đang tập trung, và có giới hạn mỗi ngày để không làm phiền."

## 12. Web admin

- 💻 **Users**: tìm theo email, xem phiên và cây của người dùng.
- 💻 **Configuration**: các con số như phiên tối thiểu 5 phút, tạm dừng tối đa 30 phút, đổi được mà không cần cập nhật app.
- 💻 **Demo**: chính là công cụ vừa dùng suốt buổi.

---

## Câu hỏi mentor hay hỏi

- **Học 1 giờ và 100 giờ một tháng khác gì?** Cây lớn theo tổng phút: 2 giờ thành cây non, 12 giờ trưởng thành, 30 giờ đạt hình dáng cuối, sau đó thêm độ phong phú tới khoảng 51 giờ là hết. Học dồn bị giảm (mỗi ngày chỉ 4 giờ đầu tính đủ). Tán dày và hoa phụ thuộc **sự đều đặn**, không phụ thuộc số giờ. App thưởng thói quen, không thưởng cày.
- **Cây đủ lớn rồi thì học thêm làm gì?** Home nói rõ điều gì còn tiến được: độ phong phú, tán, hoa, chuỗi ngày.
- **Mất mạng thì sao?** Phiên, ghi chú, chủ đề lưu trên máy và tự gửi khi có mạng lại.
- **Ai quyết định cây lớn thế nào?** Server. App chỉ hiển thị và tạo chuyển động; quy tắc chỉnh được trên admin.

## Khi có trục trặc

| Hiện tượng | Cách xử lý |
|---|---|
| App báo "We couldn't reach Focus Forest" | IP Mac đổi: sửa `.env` của mobile rồi `npx expo start -c` |
| Admin nền trống | Mở bằng `http://localhost:3001`, không dùng IP |
| Không có lời mời phòng | 💻 **Open a fresh waiting room** |
| Không thấy lễ trồng cây | Lễ chỉ có một lần mỗi tài khoản: tạo demo world mới với Gmail khác |
| "Add a finished session" báo phải chờ | Phiên không được chồng nhau: chờ vài phút hoặc giảm số phút |

---

Xong hết các flow trên máy local thì làm tiếp [DEPLOY_AFTER_DEMO.md](DEPLOY_AFTER_DEMO.md).
