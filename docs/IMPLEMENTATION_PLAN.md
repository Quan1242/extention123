# KẾ HOẠCH TRIỂN KHAI CHI TIẾT: CVAT 3D COPILOT
## Smart Quality Linter & Geometric Assistant for LiDAR 3D Annotation

> **Nhóm thực hiện:**
> - **Lê Đức Mạnh (Lead Developer & System Architect):** Phụ trách kiến trúc Extension/Userscript, giao diện HUD Widget nhúng vào CVAT, bắt sự kiện Canvas/DOM, tích hợp phím tắt, đóng gói sản phẩm và xây dựng kịch bản thuyết phục Sếp.
> - **Phạm Hoàng Anh (3D Math & Algorithm Specialist):** Phụ trách giải thuật hình học 3D, chuẩn hóa 16-point cuboid, thuật toán ước lượng mặt đất cục bộ RANSAC (Ground Snap), bộ luật kiểm tra kích thước (Dimension Rules), tính 3D IoU và đối chiếu ảnh Camera 2D.

---

## MỤC TIÊU DỰ ÁN (PROJECT GOALS)

1. **Sản phẩm kỹ thuật:** Xây dựng một công cụ hỗ trợ gán nhãn và kiểm định 3D LiDAR hoàn chỉnh chạy trực tiếp trên trình duyệt (Chrome/Edge Extension hoặc Tampermonkey Userscript), tích hợp mượt mà vào hệ thống CVAT 3D của công ty.
2. **Giá trị vận hành (Business Impact):**
   - Giảm **30–40% thời gian căn chỉnh** mỗi hộp cuboid 3D (nhờ tính năng Auto Ground Snap và Flip Yaw).
   - Giảm **> 70% lỗi sơ đẳng bị QC Reject** (nhờ tính năng Real-time 3D Linter quét lỗi trước khi Save).
   - Tăng tốc độ bắt lỗi của Reviewer/QC lên gấp **3 lần** (nhờ 1-Click QC Feedback Generator).
3. **Mục tiêu nghề nghiệp cá nhân:** Sử dụng sản phẩm thực tế và số liệu kiểm chứng này làm "bằng chứng thép" để **trình bày lên Sếp và xin chuyển sang Team Tool**.

---

## TỔNG QUAN TIẾN ĐỘ THEO CÁC PHASE (ROADMAP)

```
Phase 0: Khởi tạo Kiến trúc & Chuẩn hóa Hình học 3D (Setup & 3D Geometry Spec)
   │
   ▼
Phase 1: Xây dựng Giao diện HUD Widget & Bắt sự kiện CVAT (UI & DOM Hooks)
   │
   ▼
Phase 2: Hiện thực 3D Linter Engine (Quét lỗi Chìm đất, Kích thước, 3D IoU)
   │
   ▼
Phase 3: Tính năng Năng suất cao (Auto Ground Snap, Flip Yaw 180°, Quick QC)
   │
   ▼
Phase 4: Thử nghiệm thực tế trên Job CVAT & Đo lường số liệu ROI
   │
   ▼
Phase 5: Đóng gói Sản phẩm, Video Demo & Chiến lược "Trình lên Sếp"
```

---

## CHI TIẾT CÁC PHASE THỰC HIỆN

### PHASE 0: KHỞI TẠO KIẾN TRÚC & CHUẨN HÓA HÌNH HỌC 3D
*Thời lượng: 1 ngày*

#### Mục tiêu:
Thống nhất cấu trúc dữ liệu của CVAT 3D (mảng 16 phần tử của cuboid), thiết lập repository và môi trường phát triển giữa Đức Mạnh và Hoàng Anh.

#### Nhiệm vụ cụ thể:
- [ ] **Lê Đức Mạnh:**
  - Khởi tạo thư mục dự án `d:/Project/CVAT-3D-Copilot/`.
  - Thiết lập khung sườn Extension: `manifest.json` (Manifest V3), cấu hình quyền truy cập trang (`*://*.transformerlabs.ai/*`, `*://*.cvat.ai/*`, `*://localhost/*`).
  - Viết module `content_script.js` khung khởi tạo: tiêm (inject) thử một banner thông báo chào mừng vào giao diện CVAT để xác nhận extension load thành công.
- [ ] **Phạm Hoàng Anh:**
  - Nghiên cứu và chuẩn hóa định dạng tọa độ 3D cuboid trong CVAT:
    $$\text{points}[16] = [x_c, y_c, z_c, r_x, r_y, r_z, s_x, s_y, s_z, \dots]$$
    (Tâm $(x, y, z)$, góc xoay Euler $(rx, ry, rz)$ và kích thước $(dx, dy, dz)$).
  - Viết module toán học JavaScript thuần `geometry.js`:
    - Hàm chuyển đổi: `cuboid16ToBox3D(points)` $\rightarrow$ trả về đối tượng có cấu trúc rõ ràng: `{center, rotation, dimensions, yaw_deg}`.
    - Hàm tính toán tọa độ 8 đỉnh trong không gian 3D và đáy hộp $z_{bottom} = z_c - \frac{s_z}{2}$.
  - Xây dựng bộ từ điển kích thước chuẩn (Prior Statistics) cho các class phổ biến (Car, Bus, Truck, Pedestrian, Two-wheels).

**Sản phẩm bàn giao Phase 0:**
- Extension cài được vào Chrome/Edge ở chế độ Developer Mode.
- Thư viện `geometry.js` tính toán chuẩn xác các thông số 3D từ raw points của CVAT.

---

### PHASE 1: GIAO DIỆN HUD WIDGET & BẮT SỰ KIỆN CVAT
*Thời lượng: 2 ngày*

#### Mục tiêu:
Tạo thanh công cụ nổi (HUD Toolbar) hiện đại ngay trên Canvas 3D của CVAT và xây dựng cơ chế tự động đọc/ghi dữ liệu cuboid từ giao diện web.

#### Nhiệm vụ cụ thể:
- [ ] **Lê Đức Mạnh:**
  - Thiết kế giao diện thanh công cụ nổi **CVAT 3D Copilot HUD**:
    - Thiết kế giao diện hiện đại (Dark theme chuẩn công nghệ xe tự hành, bán trong suốt glassmorphism).
    - Các nút bấm thao tác nhanh: `[⚡ 3D Linter]`, `[🏔️ Auto Ground]`, `[🔄 Flip Yaw]`, `[📋 QC Report]`.
    - Danh sách hiển thị các lỗi phát hiện kèm mã màu (Đỏ = Lỗi nặng, Vàng = Cảnh báo, Xanh = Chuẩn).
  - Bắt sự kiện bàn phím (Global Hotkeys) trong trang CVAT:
    - `Alt + G`: Gọi hàm Auto Ground Snap.
    - `Alt + F`: Gọi hàm Flip Yaw 180°.
    - `Alt + L`: Kích hoạt quét nhanh 3D Linter.
- [ ] **Phạm Hoàng Anh:**
  - Viết bộ lắng nghe sự kiện DOM/Canvas của CVAT (`cvat_hooks.js`):
    - Bắt sự kiện khi người dùng click chọn 1 box (Active Object): Trích xuất ngay ID của box, class name, và mảng 16 tọa độ `points`.
    - Trích xuất toàn bộ danh sách các hộp trong frame hiện tại để chuẩn bị cho việc quét đồng thời (Batch Linter).
    - Viết hàm mô phỏng cập nhật dữ liệu ngược lại canvas CVAT khi annotator chấp nhận sửa.

**Sản phẩm bàn giao Phase 1:**
- Mở CVAT 3D lên, thanh HUD Widget xuất hiện gọn gàng ở góc màn hình.
- Click vào hộp nào, HUD hiển thị ngay ID, class, kích thước $(L, W, H)$ và tọa độ đáy $z_{bottom}$ của hộp đó.

---

### PHASE 2: HIỆN THỰC 3D LINTER ENGINE (BỘ MÁY QUÉT LỖI TỰ ĐỘNG)
*Thời lượng: 2 ngày*

#### Mục tiêu:
Hiện thực hóa "trái tim" của công cụ: Tự động phát hiện 4 nhóm lỗi 3D nghiêm trọng nhất trong vòng chưa đầy 1 giây.

#### Nhiệm vụ cụ thể:
- [ ] **Phạm Hoàng Anh (Core Linter Logic):**
  - Viết `linter_rules.js`:
    - **Rule 1: Dimension & Aspect Ratio Checker:**
      + So sánh $(L, W, H)$ với khoảng min/max của class tương ứng.
      + Bắt lỗi xe con nhưng dài $< 2.8\text{m}$ (co cụm điểm thưa) hoặc $> 6.0\text{m}$ (quá khổ).
      + Bắt lỗi tráo đổi trục dài/rộng (Length < Width).
    - **Rule 2: Ground Penetration & Floating Checker:**
      + Tính toán độ chìm/nổi của đáy hộp so với mặt đất tham chiếu cục bộ: $\Delta z = z_{bottom} - z_{ground}$.
      + Đánh cờ đỏ nếu $|\Delta z| > 15\text{cm}$ (chìm dưới đường hoặc bay trên không).
    - **Rule 3: 3D Box Collision & Overlap (3D IoU):**
      + Tính toán diện tích giao nhau 2D footprint kết hợp khoảng giao độ cao $Z$.
      + Bắt lỗi 2 xe đè lên nhau $> 15\%$ (duplicate box).
- [ ] **Lê Đức Mạnh (Linter UX & Interactivity):**
  - Tích hợp logic của Hoàng Anh vào nút `[⚡ 3D Linter]` trên HUD Widget.
  - Khi bấm Scan:
    - Hiển thị danh sách tổng hợp lỗi theo từng hộp.
    - **Tính năng Auto-Focus:** Khi click vào một dòng lỗi (ví dụ: *"🔴 Box #17: Chìm đất 22cm"*), extension tự động kích hoạt chọn box đó trên CVAT để annotator thấy ngay vị trí cần sửa.
    - Tính điểm chất lượng toàn frame (**Frame Health Score: 0 – 100 điểm**).

**Sản phẩm bàn giao Phase 2:**
- Chức năng quét lỗi tự động 3D hoạt động mượt mà 100% trên client, không có độ trễ mạng.

---

### PHASE 3: TÍNH NĂNG NĂNG SUẤT CAO (AUTO GROUND SNAP, FLIP YAW & QUICK QC)
*Thời lượng: 2 ngày*

#### Mục tiêu:
Cung cấp các công cụ thao tác tự động giúp annotator và reviewer giảm tối đa số lần click chuột và gõ phím.

#### Nhiệm vụ cụ thể:
- [ ] **Phạm Hoàng Anh:**
  - **Thuật toán Auto Ground Snap:**
    - Tính toán độ dốc mặt đường cục bộ quanh vị trí $(x_c, y_c)$.
    - Tự động hiệu chỉnh tọa độ tâm $z_c^{new} = z_{ground} + \frac{s_z}{2}$ sao cho đáy hộp chạm sát mặt đường $\pm 2\text{cm}$.
  - **Thuật toán Flip Yaw 180°:**
    - Xoay góc quay quanh trục $Z$: $r_z^{new} = (r_z + \pi) \pmod{2\pi}$.
    - Giữ nguyên tâm và kích thước, chỉ đảo chiều hướng vector đầu xe.
- [ ] **Lê Đức Mạnh:**
  - **Module 1-Click QC Feedback Generator:**
    - Dành cho Reviewer: Khi phát hiện box lỗi, mở menu phụ gồm các nút: `[Chìm đất]`, `[Lơ lửng]`, `[Sai hướng Yaw]`, `[Box quá ngắn]`, `[Hộp thừa]`.
    - Khi click nút, tool tự động sinh câu nhận xét chuẩn format:
      > *"ID #{id}; {loại lỗi}; Góc nhìn Side cho thấy đáy hộp bị chìm ~{dz}cm; Đề xuất nâng z đáy chạm mặt đường."*
    - Tự động copy vào Clipboard hoặc điền thẳng vào form nhận xét của CVAT/Portal.
  - **2D Camera Thumbnail (Mini-Crop Preview):**
    - Hiển thị góc nhìn ảnh camera 2D tương ứng để đối chiếu đầu xe siêu nhanh.

**Sản phẩm bàn giao Phase 3:**
- Bấm phím tắt `Alt + G` đáy hộp tự động hít sát mặt đường.
- Bấm phím tắt `Alt + F` đầu xe tự quay ngược 180°.
- Reviewer có thể tạo feedback hoàn chỉnh trong vòng 2 giây.

---

### PHASE 4: THỰC NGHIỆM THỰC TẾ & THU THẬP SỐ LIỆU ROI
*Thời lượng: 1 – 2 ngày*

#### Mục tiêu:
Dùng tool trên các Job CVAT thật (tận dụng các Job Day 12, Day 13), mời 3–5 bạn đồng nghiệp dùng thử để lấy số liệu thực tế làm bằng chứng thuyết phục Sếp.

#### Nhiệm vụ cụ thể:
- [ ] **Lê Đức Mạnh & Phạm Hoàng Anh cùng thực hiện:**
  - Thử nghiệm trên **50 – 100 frame 3D LiDAR thật**:
    - **Bài test 1 (Đo tốc độ chỉnh hộp):**
      + Cách cũ: Dùng chuột kéo tay căn chỉnh đáy hộp bám đất $\rightarrow$ đo thời gian trung bình (giây/hộp).
      + Dùng Tool: Bấm `Alt + G` và `Alt + F` $\rightarrow$ đo thời gian trung bình.
      + $\rightarrow$ *Kết quả kỳ vọng:* Giảm từ **~25s/hộp** xuống còn **~8s/hộp** (**tiết kiệm 68% thời gian**).
    - **Bài test 2 (Đo tỷ lệ phát hiện lỗi QC):**
      + Chạy 3D Linter trên 20 frame đã gán nhãn xong $\rightarrow$ phát hiện được bao nhiêu lỗi chìm đất, lệch yaw mà annotator vô tình bỏ sót?
      + $\rightarrow$ *Kết quả kỳ vọng:* Bắt được **100% các lỗi hình học cơ bản** trước khi nộp vào hàng đợi QC.
  - Tổng hợp số liệu thành các biểu đồ so sánh rõ ràng.

**Sản phẩm bàn giao Phase 4:**
- Bảng số liệu thực nghiệm chứng minh hiệu quả (ROI Dashboard).

---

### PHASE 5: ĐÓNG GÓI SẢN PHẨM & KỊCH BẢN TRÌNH LÊN SẾP
*Thời lượng: 1 ngày*

#### Mục tiêu:
Chuẩn bị bộ hồ sơ đề xuất (Tooling Proposal), video demo 2 phút và kịch bản trình bày trực tiếp để xin chuyển sang Team Tool.

#### Nhiệm vụ cụ thể:
- [ ] **Lê Đức Mạnh:**
  - Quay **Video Demo 2 phút (chất lượng cao, không nói dài dòng):**
    - 0:00 – 0:30: Chỉ ra nỗi đau kéo Z thủ công và soi lỗi mỏi mắt trên CVAT 3D.
    - 0:30 – 1:30: Demo Live các tính năng: Scan Linter đỏ rực, bấm `Alt + G` hít đất trong 1 giây, bấm `Alt + F` đảo đầu xe, sinh QC feedback trong 1 click.
    - 1:30 – 2:00: Biểu đồ số liệu thực tế (Tiết kiệm 35% thời gian, giảm 70% lỗi).
  - Soạn thảo tài liệu đề xuất **`docs/PITCH_TO_BOSS.md`** (Bản Proposal 1 trang gửi Sếp).
- [ ] **Phạm Hoàng Anh:**
  - Soạn tài liệu hướng dẫn cài đặt và sử dụng nhanh (`docs/USER_GUIDE.md`).
  - Chuẩn bị bộ câu hỏi phản biện kỹ thuật (FAQ):
    - *Tool có làm nặng trình duyệt không?* $\rightarrow$ Không, toàn bộ giải thuật chạy bằng JavaScript nhẹ, chỉ kích hoạt khi bấm nút.
    - *Có can thiệp trái phép vào server CVAT không?* $\rightarrow$ Không, extension chỉ hoạt động ở phía client (DOM/Canvas) và dùng Token chính thống của người dùng.

---

## BẢNG MA TRẬN PHÂN CÔNG TRÁCH NHIỆM (RACI MATRIX)

| Hạng mục công việc | Lê Đức Mạnh | Phạm Hoàng Anh | Sản phẩm đầu ra |
| :--- | :---: | :---: | :--- |
| **1. Khởi tạo Extension & Manifest V3** | **Chủ trì (A)** | Tham vấn (C) | Chrome Extension base |
| **2. Chuẩn hóa hình học 3D (16-points)** | Tham vấn (C) | **Chủ trì (A)** | Thư viện `geometry.js` |
| **3. Thiết kế HUD Toolbar & Hotkeys** | **Chủ trì (A)** | Phối hợp (R) | Giao diện thanh công cụ nổi |
| **4. CVAT DOM Hooks & Canvas Listener** | Phối hợp (R) | **Chủ trì (A)** | Trích xuất box từ CVAT |
| **5. Core 3D Linter Rules (Chìm đất, Kích thước)** | Tham vấn (C) | **Chủ trì (A)** | Bộ luật `linter_rules.js` |
| **6. Auto-Focus Box & Frame Health Score** | **Chủ trì (A)** | Phối hợp (R) | UX điều hướng box lỗi |
| **7. Giải thuật Auto Ground Snap & Flip Yaw** | Tham vấn (C) | **Chủ trì (A)** | Phím tắt `Alt+G`, `Alt+F` |
| **8. 1-Click QC Feedback Generator** | **Chủ trì (A)** | Tham vấn (C) | Menu tạo nhận xét chuẩn |
| **9. Thử nghiệm trên Job thật & Lấy số liệu ROI** | **Đồng chủ trì (A)** | **Đồng chủ trì (A)** | Bảng số liệu tiết kiệm thời gian |
| **10. Video Demo 2 phút & Kịch bản Trình Sếp** | **Chủ trì (A)** | Phối hợp (R) | Proposal & Video Demo |

*(A: Chịu trách nhiệm chính/Lead; R: Cùng thực hiện; C: Tham vấn/Đóng góp ý kiến)*
