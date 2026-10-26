# Historical Python tracking suite documentation

Preserved from upstream commit 3567ebe. This describes the separate experimental Python suite; its tracking and deployment claims were not revalidated for extension 1.8.0. For the current extension, installation, native edit safeguards and verified limitations, see ../README.md.

# CVAT 3D Tool & Copilot Suite (v1.6.0)

Bộ công cụ toàn diện hỗ trợ gán nhãn 3D LiDAR Bounding Box trên nền tảng **CVAT (Computer Vision Annotation Tool)** dành cho xe tự hành (Autonomous Vehicles / ADAS).

Dự án tích hợp 2 hệ thống phối hợp đồng bộ:
1. **Chrome/Edge Browser Extension (`extension/`)**: Copilot trực tiếp trên WebGL 3D canvas của CVAT (Auto-Fit Box, Ground Snap, Quick Yaw 90°/180°, Auto QC, Focus Camera, Overlap Detector).
2. **Python Automation & Tracking Suite (`scripts/`)**: Pipeline xử lý đám mây điểm LiDAR (.pcd), tracking 3D bounding box theo vận tốc/quán tính, chuẩn hóa keyframe và đồng bộ REST API với CVAT Server.

---

## 📌 Hướng dẫn cho Codex / AI Coding Agents

> [!IMPORTANT]
> **Dành cho Codex / AI Agents khi đọc và phát triển codebase này:**
> Đọc kỹ mục [Kiến trúc & Những thay đổi then chốt so với phiên bản trước](#-kiến-trúc--những-thay-đổi-then-chốt-so-với-phiên-bản-trước) trước khi viết hoặc sửa bất kỳ mã nguồn nào. Việc vi phạm các quy tắc về **Keyframe locking** hoặc **Z-ground clamp** sẽ phá hủy hoàn toàn chuyển động nội suy 3D của CVAT.

---

## 🚀 Kiến trúc & Những thay đổi then chốt so với phiên bản trước

### 1. Sự cố Khóa cứng Keyframe (Keyframe Over-Saturation Bug) & Cách khắc phục
* **Hiện tượng trước đây**:
  - Khi chạy pipeline prelabeling hoặc tracker tự động trên đoạn frame 20–29, các script cũ đã ghi shape lên **tất cả** các frame liên tiếp (frame 20, 21, 22, ..., 29).
  - Khi annotator chỉnh sửa thủ công tại frame 23 và frame 29, các frame trung gian (24, 25, 26, 27, 28) **hoàn toàn không tự nội suy**. Bounding box bị giật cục dữ dội, nhảy loạn xạ giữa các vị trí cũ và mới.
* **Nguyên nhân cốt lõi trong Data Model của CVAT 3D**:
  - Trong cấu trúc JSON của CVAT, **mọi shape nằm trong mảng `track["shapes"]` đều được CVAT coi là một hard keyframe (mốc cố định)**.
  - CVAT có bộ nội suy tuyến tính 3D (Linear Interpolator) tự động tính toán vị trí giữa 2 keyframe. Nếu một frame trung gian đã có shape sẵn, CVAT sẽ ưu tiên hiển thị shape đó thay vì nội suy!
* **Giải pháp chuẩn hóa (Clean Keyframes Cadence)**:
  - Loại bỏ toàn bộ các shape trung gian tự sinh trên các frame không phải mốc chính.
  - Chỉ lưu giữ các keyframe thực sự (ví dụ: `[0, 5, 8, 9, 10, 15, 16, 19, 23, 29]`).
  - Khi đó, CVAT tự động nội suy mượt mà 100% cho các frame 20–22 và 24–28.
  - Mã nguồn thực thi: [`scripts/clean_keyframes_pipeline.py`](file:///D:/Project/VinPrj/CVAT_Tool/scripts/clean_keyframes_pipeline.py).

---

### 2. Khóa cao độ mặt đường (Ground Z-Elevation Clamp / Chống văng Box)
* **Hiện tượng trước đây**:
  - Khi fit cụm điểm LiDAR hoặc ngoại suy vận tốc, các điểm phản xạ từ nóc xe, giá chở đồ hoặc nhiễu tầm xa kéo tâm Z lên cao dần. Xe bị văng lên không trung (từng ghi nhận xe bay lên Z = 12.5m).
* **Giải pháp chuẩn hóa**:
  - **Z-Ground Invariant**: Cao độ tâm Z của xe chỉ được phép dao động tối đa $\pm 0.15\text{ m}$ so với cao độ ban đầu tại mặt đất:
    ```python
    curr_center[2] = np.clip(curr_center[2], z_start - 0.15, z_start + 0.15)
    curr_vel[2] = 0.0  # Vận tốc thẳng đứng bị triệt tiêu
    ```
  - Lọc bỏ điểm mặt đường trước khi tính offset: chỉ lấy các điểm LiDAR cao hơn đáy box $+0.12\text{ m}$.
  - Mã nguồn thực thi: [`scripts/tracker_3d_pipeline.py`](file:///D:/Project/VinPrj/CVAT_Tool/scripts/tracker_3d_pipeline.py).

---

### 3. Bất biến kích thước vật thể cứng (Rigid Dimension Invariance)
* **Quy tắc**: Kích thước 3 chiều của một phương tiện $[L, W, H]$ (Length, Width, Height) là **bất biến tuyệt đối** trong suốt toàn bộ chu kỳ sống của track.
* **Cải tiến**: Không bao giờ tính lại $dx, dy, dz$ trên từng frame trung gian vì mật độ điểm LiDAR thay đổi theo khoảng cách và góc quét. Kích thước chuẩn được xác lập từ keyframe ban đầu và giữ nguyên qua mọi frame.

---

### 4. Triệt tiêu hiện tượng đảo hướng 180° (Yaw Angle-Wrapping)
* **Hiện tượng trước đây**: Thuật toán PCA thuần túy trên mặt phẳng XY không phân biệt được đầu xe và đuôi xe, dẫn tới việc box đột ngột quay ngược 180° khi đổi frame.
* **Giải pháp**: Đồng bộ Yaw theo vector vận tốc di chuyển $\vec{v} = (v_x, v_y)$. Áp dụng hàm bọc góc (angle wrapping) để đảm bảo góc xoay biến thiên liên tục, không nhảy góc.

---

### 5. Xử lý trạng thái rời khỏi cảnh (`outside = True`)
* **Quy tắc**: Khi phương tiện di chuyển ra khỏi tầm quét LiDAR ($R > 65\text{ m}$) hoặc không có đủ điểm LiDAR ($\le 4$ điểm trong 4 frame liên tiếp), track phải được gán `outside = True` ngay tại frame đó và ngừng tạo shape ở các frame sau.

---

## 📂 Cấu trúc thư mục

```text
CVAT_Tool/
├── extension/                      # Chrome/Edge Extension mã nguồn
│   ├── manifest.json               # Manifest V3 cấu hình domain CVAT
│   ├── content_script.js           # Content script nhúng vào trang
│   ├── copilot_main.js             # Logic khởi tạo & điều phối chính
│   ├── copilot_panel.js            # Giao diện điều khiển nổi (Floating UI)
│   ├── cvat_adapter.js             # Adapter giao tiếp React/Redux/Canvas 3D của CVAT
│   ├── geometry_math.js            # RANSAC ground fitting, PCA, IoU 3D
│   └── styles.css                  # Giao diện dark theme chuẩn WCAG 2.1
├── scripts/                        # Automation & Python Processing Suite
│   ├── cvat_client.py              # REST API Client (GET/PUT annotations, tải PCD)
│   ├── clean_keyframes_pipeline.py # Script chuẩn hóa keyframe, sửa lỗi giật box
│   ├── tracker_3d_pipeline.py      # Bộ bám vết 3D LiDAR & khớp bounding box
│   ├── build-extension.cjs         # Script đóng gói extension
│   ├── build-demo.cjs              # Script đóng gói bản demo WebGL
│   └── demo-server.cjs             # Máy chủ chạy thử nghiệm cục bộ
├── config/                         # Cấu hình môi trường & bảo mật
│   ├── cvat_config.py              # Tự động nạp cấu hình từ .env hoặc môi trường
│   └── .env.example                # File mẫu cấu hình biến môi trường
├── samples/                        # Dữ liệu payload mẫu đã kiểm thử
│   └── job58_clean_keyframes_payload.json # Payload Job 58 chuẩn hóa mượt mà
├── tests/                          # Bộ kiểm thử tự động
│   ├── geometry.test.cjs           # Test toán học hình học 3D, PCA & RANSAC
│   ├── adapter.test.cjs            # Test adapter kết nối CVAT
│   └── browser/                    # E2E Playwright tests
├── docs/                           # Tài liệu chi tiết & báo cáo kiểm chứng
│   ├── QC_ISSUE_FOCUS_DESIGN.md    # Thiết kế tính năng Focus Box & Camera
│   └── DEMO_GUIDE.md               # Hướng dẫn chạy demo WebGL
├── package.json                    # Cấu hình npm & dependencies
└── .gitignore                      # Loại bỏ pcd, node_modules và credentials
```

---

## 🛠️ Hướng dẫn cài đặt & Sử dụng

### 1. Cài đặt Browser Extension vào Chrome / Edge
1. Mở trình duyệt, truy cập `chrome://extensions/` hoặc `edge://extensions/`.
2. Bật chế độ **Developer mode** (Góc trên cùng bên phải).
3. Nhấn **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục:
   `D:\Project\VinPrj\CVAT_Tool\extension`
4. Mở tab CVAT 3D job (ví dụ: `https://cvat-test.vantixapps.net/tasks/.../jobs/58`).
5. Menu tiện ích **CVAT 3D TOOL** sẽ xuất hiện ở góc phải màn hình.

#### Phím tắt tiện ích:
* **Alt + Shift + A**: Auto-fit Bounding Box theo cụm điểm LiDAR hiện tại.
* **Alt + Shift + G**: Snap đáy box sát mặt đường (RANSAC Ground Plane).
* **Alt + Shift + [** / **]**: Xoay box nhanh $\pm 90^\circ$.
* **Alt + Shift + F**: Đảo hướng đầu/đuôi xe $180^\circ$.
* **Alt + Shift + C**: Bật/tắt chế độ Free Camera (WASD / QE di chuyển tự do).
* **Alt + Shift + L**: Mở bảng danh sách lỗi Auto QC (kiểm tra lún sàn, bay box, lệch kích thước).

---

### 2. Sử dụng Python Automation Pipeline

#### Thiết lập môi trường:
Tạo file `.env` tại thư mục gốc `CVAT_Tool/` từ mẫu `.env.example`:
```bash
cp config/.env.example .env
```
Điền thông tin đăng nhập hoặc cookie của bạn vào `.env`:
```ini
CVAT_BASE_URL=https://cvat-test.vantixapps.net
CVAT_SESSION_ID=your_session_id_here
CVAT_CSRF_TOKEN=your_csrf_token_here
CVAT_JOB_ID=58
```

#### A. Chuẩn hóa Keyframe & Khắc phục giật Box:
Để sửa một Job bị lỗi giật box do chèn shape liên tục, chạy lệnh:
```powershell
python scripts/clean_keyframes_pipeline.py --job-id 58 --upload
```
Lệnh sẽ tự động:
1. Tải toàn bộ annotation hiện tại của Job 58 về máy.
2. Lọc bỏ các shape thừa ở các frame trung gian, chỉ giữ lại các keyframe mốc chuẩn (ví dụ: 0, 5, 8, 9, 10, 15, 16, 19, 23, 29).
3. Upload payload sạch lên server qua method `PUT /api/jobs/58/annotations`.
4. Kích hoạt tính năng nội suy 3D mượt mà gốc của CVAT.

#### B. Tải dữ liệu Point Cloud (.pcd) hàng loạt:
```powershell
python -c "from scripts.cvat_client import CVATClient; client = CVATClient(); client.download_pointclouds(job_id=58, total_frames=30)"
```

#### C. Chạy bộ kiểm thử tự động (Unit Tests & E2E):
```powershell
# Kiểm thử hình học & adapter
node --test tests/*.test.cjs

# Đóng gói tiện ích
node scripts/build-extension.cjs
```

---

## 🛡️ Tiêu chuẩn dữ liệu Bounding Box (CVAT 3D Format)

Trong payload JSON của CVAT, mỗi shape 3D được biểu diễn qua mảng 16 giá trị hoặc 9 giá trị chính:
$$\text{points} = [X, Y, Z, R_x, R_y, R_z, D_x, D_y, D_z]$$

| Chỉ số | Tên thuộc tính | Đơn vị | Ý nghĩa |
|---|---|---|---|
| `points[0..2]` | Center $(X, Y, Z)$ | mét | Tọa độ tâm 3D của bounding box |
| `points[3..5]` | Rotation $(R_x, R_y, R_z)$ | radian | Góc quay Euler ($R_z$ là góc Yaw trên mặt đường) |
| `points[6..8]` | Dimensions $(L, W, H)$ | mét | Kích thước Chiều dài ($D_x$), Chiều rộng ($D_y$), Chiều cao ($D_z$) |

---

## 📝 Thông tin bản quyền & Đóng góp
Dự án được xây dựng và tối ưu riêng cho môi trường kiểm thử dữ liệu 3D LiDAR của VinFast / Vantix. Mọi thắc mắc hoặc yêu cầu bổ sung tính năng xin vui lòng mở Issue hoặc liên hệ nhóm phát triển.