# KẾ HOẠCH TRIỂN KHAI SOLO (TỪ A - Z DÀNH CHO 1 NGƯỜI)
# Dự án: CVAT 3D Copilot — Minimalist Tooling Edition

> **Mục tiêu tối thượng:** Tự tay xây dựng một công cụ hoàn chỉnh, đạt chuẩn Minimalist công nghiệp, hoạt động mượt mà trên nền tảng CVAT 3D nội bộ để tạo ra **1 bản Demo hoàn chỉnh trong vòng 5–6 ngày** và trình lên Sếp xin chuyển sang **Team Tool**.

---

## NGUYÊN TẮC THIẾT KẾ GIAO DIỆN (MINIMALIST UI DIRECTIVE)

Để tool mang phong thái của một phần mềm nội bộ chuyên nghiệp cao cấp (Enterprise Tooling) thay vì sản phẩm đồ án sinh viên màu mè, toàn bộ giao diện tuân thủ các quy tắc sau:

1. **Tuyệt đối cấm Icon và Emoji màu mè:**
   - Không sử dụng các ký tự emoji (như 🚀, ⚠️, ❌, ✅, 💡, 🔥...).
   - Chỉ sử dụng typography sắc nét, nhãn text viết hoa tinh tế (ví dụ: `CRITICAL`, `WARNING`, `OK`), hoặc ký hiệu hình học cơ bản (`•`, `—`, `▲`, `▼`).
2. **Bảng màu đơn sắc (Monochrome + Muted Semantic Accents):**
   - Nền (Dark Surface): `#121214` (Off-black) hoặc `#18181B` (Zinc-900).
   - Đường viền (Borders): `1px solid #27272A` (Zinc-800).
   - Màu chữ chính (Primary Text): `#F4F4F5` (Zinc-100).
   - Màu chữ phụ (Secondary/Meta): `#A1A1AA` (Zinc-400).
   - Màu cảnh báo có kiểm soát (Muted Desaturated Colors):
     - Lỗi nặng: Chữ `#F87171` trên nền `#450A0A` (Muted dark red).
     - Cảnh báo: Chữ `#FBBF24` trên nền `#451A03` (Muted dark amber).
     - Chuẩn: Chữ `#34D399` trên nền `#064E3B` (Muted dark emerald).
3. **Typography & Phím tắt kỹ thuật:**
   - Font giao diện: System font sạch (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`).
   - Font số đo & tọa độ: Monospace (`'JetBrains Mono', 'SF Mono', Consolas, monospace`).
   - Phím tắt hiển thị dưới dạng thẻ phím vật lý `<kbd>` tối giản (nền `#27272A`, viền `#3F3F46`, chữ `#E4E4E7`).

---

## LỘ TRÌNH 6 PHASE NHỎ TRIỂN KHAI ĐỘC LẬP (SOLO ROADMAP)

```
Phase 1: Nền tảng Extension & Bắt dữ liệu CVAT 3D (DOM/Canvas Hooks)
   │
   ▼
Phase 2: Bộ máy Thuật toán Hình học 3D Thuần JavaScript (Geometry Core)
   │
   ▼
Phase 3: Xây dựng Giao diện HUD Widget Tối giản (Minimalist Overlay)
   │
   ▼
Phase 4: Các Thao tác Năng suất Tự động (Auto Ground Snap & Flip Yaw)
   │
   ▼
Phase 5: Kiểm thử trên Job 3D Thực tế & Thu thập Số liệu Đối chứng
   │
   ▼
Phase 6: Đóng gói Bản Demo Hoàn chỉnh & Kịch bản Trình bày lên Sếp
```

---

## CHI TIẾT TỪNG PHASE

### PHASE 1: NỀN TẢNG EXTENSION & BẮT DỮ LIỆU CVAT 3D (NGÀY 1)
*Mục tiêu: Đọc được ID, Class và 16 tọa độ của mọi hộp 3D đang hiển thị trên màn hình CVAT.*

- [ ] **Bước 1.1: Thiết lập cấu trúc Extension (Manifest V3)**
  - Tạo file `extension/manifest.json`:
    - Khai báo quyền `activeTab`, `storage`, match URL với `*://cvat.note.transformerlabs.ai/*`, `*://*.cvat.ai/*`.
    - Đăng ký `content_script.js` và `styles.css`.
  - Cài thử nghiệm Extension vào trình duyệt Edge/Chrome ở chế độ Developer Mode.
- [ ] **Bước 1.2: Phân tích và bắt dữ liệu đối tượng 3D từ CVAT**
  - Trong CVAT 3D, dữ liệu annotation được lưu trong bộ nhớ client và render qua WebGL.
  - Viết logic trích xuất trong `extension/cvat_extractor.js`:
    - **Cách 1 (DOM / State Inspector):** Đọc đối tượng đang active khi người dùng click vào hộp trên danh sách đối tượng bên sidebar phải của CVAT.
    - **Cách 2 (CVAT Internal API Interception):** Bắt request `GET /api/jobs/{id}/annotations` ngay khi trang vừa tải để lưu toàn bộ mảng `shapes` vào bộ nhớ đệm client của extension.
- [ ] **Bước 1.3: Xác minh đầu ra**
  - Mở một Job 3D thật (ví dụ Job 9398/9400).
  - Mở Console (F12), gõ lệnh kiểm tra `window.__CVAT_COPILOT_DATA` $\rightarrow$ in ra đúng mảng danh sách các hộp với 16 tọa độ `points`.

---

### PHASE 2: BỘ MÁY THUẬT TOÁN HÌNH HỌC 3D THUẦN JAVASCRIPT (NGÀY 2)
*Mục tiêu: Viết engine toán học chạy trực tiếp trên client để giải mã và kiểm tra lỗi hình học trong 50ms.*

- [ ] **Bước 2.1: Module giải mã tọa độ (`geometry_math.js`)**
  - Chuyển đổi mảng 16 phần tử sang các đại lượng vật lý:
    - Tâm $(x_c, y_c, z_c) = (points[0], points[1], points[2])$.
    - Góc xoay $(r_x, r_y, r_z) = (points[3], points[4], points[5])$.
    - Kích thước $(s_x, s_y, s_z) = (points[6], points[7], points[8])$ (chiều dài $L$, chiều rộng $W$, chiều cao $H$).
    - Tọa độ đáy hộp: $z_{bottom} = z_c - \frac{s_z}{2}$.
    - Góc hướng đầu xe quy đổi sang độ: $\text{yaw\_deg} = r_z \times \frac{180}{\pi}$.
- [ ] **Bước 2.2: Module kiểm tra quy chuẩn kích thước (`dimension_linter.js`)**
  - Định nghĩa bảng thông số chuẩn dựa trên guideline thực tế:
    - `vehicles` (Car/Sedan): $L \in [3.5, 5.5\text{m}]$, $W \in [1.6, 2.3\text{m}]$, $H \in [1.3, 2.1\text{m}]$.
    - `vehicles` (Bus/Truck): $L \in [6.0, 13.0\text{m}]$, $W \in [2.2, 3.0\text{m}]$, $H \in [2.5, 4.2\text{m}]$.
    - `pedestrian`: $L \in [0.4, 0.9\text{m}]$, $W \in [0.4, 0.9\text{m}]$, $H \in [1.4, 2.0\text{m}]$.
    - `two-wheels`: $L \in [1.5, 2.4\text{m}]$, $W \in [0.6, 1.2\text{m}]$, $H \in [1.0, 1.8\text{m}]$.
  - Phát hiện các bất thường:
    - Box quá ngắn (do co cụm theo điểm thưa ở xa).
    - Tráo đổi trục (Length < Width).
- [ ] **Bước 2.3: Module kiểm tra mặt đất và va chạm (`ground_collision.js`)**
  - **Kiểm tra độ chìm/bay của đáy:** Lấy phân vị $Z$ nhỏ nhất của các điểm lân cận footprint hoặc mặt đất trung bình $z_{ground}$ $\rightarrow$ nếu $|z_{bottom} - z_{ground}| > 0.15\text{m} \rightarrow$ báo lỗi chìm/bay.
  - **Kiểm tra va chạm (3D IoU):** Tính giao nhau của footprint 2D kết hợp khoảng đè cao độ $Z$. Nếu $\text{IoU}_{3D} > 0.15 \rightarrow$ báo lỗi trùng hộp.

---

### PHASE 3: GIAO DIỆN HUD WIDGET TỐI GIẢN (MINIMALIST OVERLAY) (NGÀY 3)
*Mục tiêu: Tạo thanh công cụ nổi tinh tế, gắn trực tiếp vào CVAT mà không làm rối mắt người dùng.*

- [ ] **Bước 3.1: Dựng cấu trúc HTML/CSS của Widget**
  - Đặt ở góc trên bên phải màn hình (hoặc có thể thu gọn thành một tab nhỏ).
  - Kích thước cố định: Rộng $320\text{px}$, padding $16\text{px}$, bo góc $8\text{px}$.
  - Nền `#121214`, viền `1px solid #27272A`, không đổ bóng màu mè.
- [ ] **Bước 3.2: Các khối chức năng trên Widget:**
  - **Header:** Tiêu đề `CVAT 3D COPILOT` (font chữ viết hoa nhỏ, tracking rộng, kèm trạng thái `ONLINE`).
  - **Thống kê nhanh (Health Metric):**
    - `TOTAL BOXES`: Hiển thị số lượng.
    - `HEALTH SCORE`: Điểm chất lượng $0 - 100$ (tính dựa trên tỷ lệ hộp không lỗi).
  - **Nút điều khiển tối giản:**
    - Button `[SCAN QUALITY]` (Nền `#27272A`, hover `#3F3F46`, chữ `#F4F4F5`).
  - **Bảng danh sách lỗi (Issue Feed):**
    - Từng dòng lỗi hiển thị gọn gàng:
      `[CRITICAL] Box #17 — Ground penetration (-24cm)`
      `[WARNING]  Box #04 — Axis swapped (L < W)`
  - **Khối đối tượng đang chọn (Active Box Inspector):**
    - Hiển thị ID, Class, kích thước $(L \times W \times H)$ và góc Yaw.
- [ ] **Bước 3.3: Tương tác Auto-Focus**
  - Khi click vào 1 dòng lỗi trong danh sách, canvas CVAT tự động kích hoạt chọn đúng hộp đó để người dùng thấy ngay.

---

### PHASE 4: CÁC THAO TÁC NĂNG SUẤT TỰ ĐỘNG (NGÀY 4)
*Mục tiêu: Đưa vào các phím tắt "ăn tiền" nhất: Hít đất tự động, lật đầu xe 180°, copy feedback QC.*

- [ ] **Bước 4.1: Tính năng Auto Ground Snap (`Alt + G`)**
  - Khi người dùng đang chọn 1 hộp cuboid và bấm `Alt + G`:
  - Tool tự động tính $z_c^{new} = z_{ground} + \frac{s_z}{2}$.
  - Cập nhật trực tiếp tọa độ $Z$ mới vào đối tượng $\rightarrow$ đáy hộp chạm sát mặt đất cục bộ.
  - Hiển thị thông báo Toast siêu nhẹ: `Adjusted Box #17 Z by +0.24m`.
- [ ] **Bước 4.2: Tính năng Flip Yaw 180° (`Alt + F`)**
  - Khi đối chiếu ảnh camera thấy đầu xe bị ngược:
  - Bấm `Alt + F` $\rightarrow$ góc $r_z$ lập tức cộng thêm $\pi$ ($180^\circ$).
  - Không thay đổi tâm hay kích thước, chỉ đảo mũi tên hướng đầu xe.
- [ ] **Bước 4.3: Tính năng 1-Click Copy QC Feedback**
  - Khi reviewer click vào một hộp có lỗi trên HUD Widget:
  - Tool tự động tạo câu text chuẩn theo quy cách của dự án:
    `Box #17 | Ground Inconsistency | Side view shows bottom submerged by 24cm | Adjust Z upward`
  - Tự động copy vào Clipboard để dán ngay vào cổng feedback/portal.

---

### PHASE 5: KIỂM THỬ TRÊN JOB THỰC TẾ & ĐO SỐ LIỆU ĐỐI CHỨNG (NGÀY 5)
*Mục tiêu: Chạy thử nghiệm trên 50–100 frame thật để thu thập số liệu "biết nói" chuẩn bị trình Sếp.*

- [ ] **Bước 5.1: Thực nghiệm đo thời gian căn chỉnh (Efficiency Test)**
  - Chọn 20 hộp cuboid cần chỉnh đáy và hướng:
    - Đợt 1 (Không dùng tool): Dùng chuột kéo thủ công ở góc Side $\rightarrow$ Bấm đồng hồ đo thời gian (trung bình ~24 giây/hộp).
    - Đợt 2 (Dùng tool): Bấm `Alt + G` và `Alt + F` $\rightarrow$ Đo thời gian (trung bình ~6–7 giây/hộp).
    - $\rightarrow$ **Kết luận thực tế: Giảm 70% thời gian căn chỉnh hình học.**
- [ ] **Bước 5.2: Thực nghiệm quét lỗi sót (Quality Audit Test)**
  - Lấy 10 frame đã hoàn thành trước đây của annotator:
  - Bấm nút `[SCAN QUALITY]` $\rightarrow$ Thống kê xem tool bắt được bao nhiêu lỗi chìm đất và lệch kích thước mà mắt thường bỏ sót.
- [ ] **Bước 5.3: Ghi chép số liệu**
  - Lưu toàn bộ kết quả vào bảng Markdown [docs/PITCH_TO_BOSS.md](file:///d:/Project/CVAT-3D-Copilot/docs/PITCH_TO_BOSS.md).

---

### PHASE 6: ĐÓNG GÓI BẢN DEMO HOÀN CHỈNH & TRÌNH LÊN SẾP (NGÀY 6)
*Mục tiêu: Hoàn thiện video demo 2 phút, tài liệu đề xuất và xin lịch gặp Sếp.*

- [ ] **Bước 6.1: Dọn dẹp mã nguồn & Đóng gói Extension**
  - Xóa toàn bộ `console.log` thừa, đảm bảo extension chạy ổn định 100%, không sinh lỗi đỏ trong console F12.
  - Đóng gói thư mục thành file `cvat-3d-copilot-v1.0.zip` sẵn sàng cài đặt.
- [ ] **Bước 6.2: Chuẩn bị kịch bản Live Demo 3 phút**
  - Chuẩn bị 1 tab CVAT mở sẵn một frame có 3 lỗi điển hình (1 hộp chìm đất, 1 hộp ngược yaw, 1 hộp vẽ quá bé).
  - Trình tự demo trước mặt Sếp:
    1. Bấm `[SCAN QUALITY]` $\rightarrow$ Lập tức phát hiện 3 lỗi.
    2. Click vào lỗi số 1 $\rightarrow$ Camera focus tới hộp $\rightarrow$ Bấm `Alt + G` $\rightarrow$ Hộp tự hít khít mặt đường.
    3. Bấm `Alt + F` $\rightarrow$ Đầu xe xoay đúng chiều.
    4. Bấm Copy QC Feedback $\rightarrow$ Dán vào ô nhận xét trong 1 giây.
- [ ] **Bước 6.3: Gửi email/tin nhắn xin gặp Sếp**
  - Sử dụng mẫu thư trang trọng đã soạn trong `docs/PITCH_TO_BOSS.md`.

---

---

## BẢNG THEO DÕI TIẾN ĐỘ SOLO (DAILY CHECKLIST — CẬP NHẬT BẢN 1.2.2)

| Ngày | Phase | Trọng tâm công việc | Trạng thái |
| :---: | :---: | :--- | :---: |
| **Ngày 1** | **Phase 1 & 2** | Nền tảng Native Adapter CVAT 2.76 + Engine RANSAC Ground + Oriented IoU | [x] Đã hoàn thành (19/19 Unit Tests Pass) |
| **Ngày 1** | **Phase 3 & 4** | HUD Widget (CVAT 3D TOOL) + Phím tắt an toàn (Alt+Shift+G/F/C/L) + Free Cam | [x] Đã hoàn thành |
| **Ngày 1** | **Phase 5** | Đóng gói Demo ngoại tuyến (`dist/CVAT-3D-Copilot-Demo.html`) + Test Playwright | [x] Đã hoàn thành (5/5 E2E Tests Pass) |
| **Ngày 2** | **Phase 6** | Nghiệm thu thực tế trên CVAT 2.76 thật (Job 9426): Test Live Adapter & Native Save | [ ] Đang tiến hành (Theo DEMO_GUIDE.md) |
| **Ngày 3** | **Phase 7** | Ghi hình demo 3 phút + Gửi Proposal xin gặp Sếp chuyển sang Team Tool | [ ] Chờ nghiệm thu Ngày 2 |
