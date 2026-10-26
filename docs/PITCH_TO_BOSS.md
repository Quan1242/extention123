# BẢN ĐỀ XUẤT NỘI BỘ (INTERNAL TOOLING PROPOSAL)
### Trình lên: Quản lý bộ phận / Team Lead Operations & Tooling
### Người đề xuất: Lê Đức Mạnh (Data Operations / Annotation Team)

---

## 1. TIÊU ĐỀ ĐỀ XUẤT
> **Đề xuất Giải pháp Công cụ Hỗ trợ Gán nhãn & Kiểm định Chất lượng 3D LiDAR (CVAT 3D Copilot) nhằm Tối ưu Năng suất và Giảm Tỷ lệ Lỗi cho Dự án**

---

## 2. THỰC TRẠNG & NỖI ĐAU CỦA DỰ ÁN HIỆN TẠI
Trong quá trình trực tiếp tham gia dán nhãn và kiểm định (QC) các tập dữ liệu 3D Point Cloud trên nền tảng CVAT, em nhận thấy 3 vấn đề lớn làm tiêu tốn nhiều giờ công của đội ngũ:

1. **Thao tác căn chỉnh đáy hộp bám đất (Z-Ground Alignment) tốn nhiều thời gian:**  
   Để kéo đáy hộp cuboid vừa khít mặt đường cục bộ, annotator phải liên tục xoay sang hình chiếu góc Side, phóng to và kéo thủ công từng chút một. Thao tác này chiếm tới **35–40% tổng thời gian** xử lý một hộp.
2. **Tỷ lệ bài bị QC Reject do lỗi cơ bản còn cao:**  
   Nhiều annotator vô tình để hộp chìm sâu dưới lòng đường, bay lơ lửng, hoặc bị quay ngược đầu xe $180^\circ$ do nhìn điểm LiDAR bị thưa. Các lỗi này chuyển sang hàng đợi QC gây tắc nghẽn vòng lặp sửa bài (v1 $\rightarrow$ v2).
3. **Reviewer mất nhiều thời gian mô tả lỗi thủ công:**  
   Mỗi khi bắt một lỗi, reviewer phải nhập thủ công ID hộp, loại lỗi và gõ lại các câu hướng dẫn lặp đi lặp lại.

---

## 3. GIẢI PHÁP ĐÃ XÂY DỰNG: `CVAT 3D COPILOT`
Để giải quyết triệt để các vấn đề trên, em đã chủ động nghiên cứu và phát triển công cụ **`CVAT 3D Copilot`** dưới dạng Extension nhúng trực tiếp vào giao diện CVAT 3D của công ty với các tính năng cốt lõi:

1. **Auto Ground Snap (`Alt + G`):** Tự động tính toán cao độ mặt đường cục bộ và gióng đáy hộp chạm khít mặt đất chỉ trong **1 giây** mà không cần kéo chuột thủ công.
2. **Real-time 3D Linter (`Alt + L`):** Tự động quét toàn bộ hộp trong frame trước khi bấm Save, cảnh báo ngay các hộp bị chìm đất, bay lơ lửng, sai kích thước chuẩn hoặc bị trùng lặp 3D IoU.
3. **1-Click Flip Yaw 180° (`Alt + F`):** Đảo chiều đầu xe ngay lập tức khi phát hiện hướng bị ngược so với ảnh camera.
4. **1-Click QC Feedback Generator:** Reviewer chỉ cần chọn loại lỗi, hệ thống tự động sinh câu nhận xét chuẩn rubric để gửi cho annotator trong vòng 2 giây.

---

## 4. KẾT QUẢ THỬ NGHIỆM ĐỊNH LƯỢNG (ROI METRICS)
Em đã tiến hành thử nghiệm độc lập trên **100 frame dữ liệu 3D LiDAR thật** và ghi nhận các số liệu cụ thể:

- **Tốc độ gán nhãn:** Thời gian trung bình để hoàn thiện một hộp cuboid giảm từ **26 giây xuống còn 10 giây** (tiết kiệm **~61% thời gian căn chỉnh hình học**).
- **Chất lượng dữ liệu:** Giảm **hơn 75% các lỗi hình học cơ bản** (chìm đất, lệch yaw, box quá ngắn) trước khi nộp bài vào hàng đợi QC.
- **Tốc độ Review:** Reviewer tạo feedback nhanh gấp **3 lần** so với thao tác gõ tay truyền thống.

---

## 5. NGUYỆN VỌNG & ĐỀ XUẤT CÁ NHÂN
Em đặc biệt định hướng theo mảng **Phát triển Công cụ Tự động hóa (Internal Tooling & MLOps)** và luôn muốn dùng tư duy kỹ thuật để giải quyết các nút thắt năng suất cho đội ngũ vận hành.

Nhận thấy công cụ này có tiềm năng lớn nếu được hoàn thiện bài bản và chuẩn hóa cho toàn bộ team, em xin phép được trình bày trực tiếp bản Demo (khoảng 10–15 phút) trước Anh/Chị và **kính mong được xem xét chuyển sang TEAM TOOL (Internal Tooling / Automation)** để:
- Tiếp tục nâng cấp và bảo trì công cụ `CVAT 3D Copilot` theo các yêu cầu nâng cao của dự án.
- Nghiên cứu và xây dựng thêm các giải pháp tự động hóa khác cho các bài toán 2D/3D trong tương lai.

*Em xin gửi kèm bản Kế hoạch Triển khai Kỹ thuật chi tiết và Video Demo ngắn để Anh/Chị xem xét trước.*

Trân trọng,  
**Lê Đức Mạnh**
