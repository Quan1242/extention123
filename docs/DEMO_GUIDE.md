# Demo cho sếp trong 2–3 ngày

## Auto-Fit bản 1.3.0

Chọn “Box lơ lửng”, nhấn AUTO-FIT BOX hoặc Alt+Shift+A: box fit lại cluster cố định, yaw từ PCA, dimensions theo class, đáy chạm ground. Undo → Redo để chứng minh thao tác realtime. Có thể chọn một box class two-wheels từ danh sách, Focus rồi Auto-Fit. Đây là dữ liệu mô phỏng; cần review hướng, điểm thuộc vật thể và giới hạn kích thước. Trên CVAT thật, thêm nghiệm thu native Auto-Fit/Undo/Redo/Save/reload và thử box có <10 điểm, class chưa có rule, ROI chứa vật thể lân cận.

Bản 1.2 có demo 3D ngoại tuyến và extension adapter native. Mở dist/CVAT-3D-Copilot-Demo.html bằng Edge/Chrome, cửa sổ ≥1280px. Nhãn DEMO NGOẠI TUYẾN luôn hiện: 61 cuboid từ cache, ground/point cloud và lỗi mô phỏng, không gửi lên CVAT.

## Kịch bản 3–5 phút

1. **Box lơ lửng**: chọn tình huống 1, chỉ lý do và màu. Đọc confidence/RMSE, Ground Snap: box hạ xuống và lỗi ground biến mất tự động.
2. **Box chìm**: tình huống 2, lỗi đỏ có khoảng cách dưới ground. Bấm mục lỗi để chọn box, Focus, Snap nâng lên.
3. **Quay**: +90°, 180°. Mũi tên trắng biểu thị hướng; tâm/kích thước giữ nguyên. Undo/Redo.
4. **QC/class**: tình huống 3 sai chiều dài, đổi class để rule/màu cập nhật; Undo. Không tuyên bố AI tự nhận class.
5. **Overlap**: tình huống 4, lỗi IoU liên kết hai box; “Chọn #…” chuyển đúng đối tượng. Tắt/bật màu QC so với màu class.
6. **Free Cam**: bật, click vùng 3D, WASD/QE, Shift, giữ chuột phải để nhìn; Esc thoát. Reset cho lượt sau.

Demo Undo/Redo chỉ sửa bộ nhớ trang. Extension dùng native Undo/Redo và Save CVAT.

## Ngày 1 — đã có bản cục bộ

Geometry, local ground RANSAC, UI chung, snapshot/ACK, native adapter, selection/class/QC màu/camera và HTML standalone đã viết. Math/adapter mock và browser test demo đã chạy. Bằng chứng ở tests/ và docs/verification/demo-1.2.png.

## Ngày 2 — nghiệm thu CVAT thật (chưa hoàn tất)

Dùng job thử nghiệm hoặc bản copy có quyền sửa. Load unpacked 1.2, mở CVAT 3D.

| Kiểm tra | Tiêu chí |
|---|---|
| Kết nối | LIVE, số box đúng editor/frame; không dùng cache 61 khi live có 62 |
| Chọn | ≥5 box gồm box mới chưa serverID; panel/sidebar/canvas cùng clientID; mục lỗi và box thứ hai overlap chọn đúng |
| Quay | ±90/180 render ngay, native Undo/Redo đúng, tâm/kích thước giữ nguyên |
| Ground | Đọc point cloud thật; ≥5 box có ground rõ và 1 box thiếu dữ liệu; Snap chỉ mở khi đủ confidence |
| Class | Label/attributes task đúng, native Undo; QC/màu cập nhật |
| Realtime | Kéo/resize/create/delete/native undo cập nhật panel; tắt QC màu trả màu native |
| Camera | WASD/QE/right-drag trên canvas thật; Esc/blur/frame change trả điều khiển |
| Lưu | Native Save thành công; reload sau Save giữ hình học/class |
| Frame/job | Không giữ lỗi/ground/box cũ; edit trễ không chèn box sang frame khác |

Đo thao tác → canvas/QC, ghi version/browser/số điểm/số box. Mục tiêu QC <1 giây trên frame nhỏ, chưa có SLA. Refresh chỉ dùng kiểm tra persistence, không cần để xem thao tác.

Kiểm chứng live thiếu vì điều khiển Windows dừng khi không xác định URL trình duyệt đủ tin cậy. API GET/UI read-only trước đó không thay thế kiểm tra chỉnh sửa và native Save. Adapter dựa vào nội bộ CVAT 2.76; build khác có thể cần điều chỉnh.

## Ngày 3 — tập và đóng gói

Checklist live qua: chọn 4 ca trên job thử, ghi ảnh/chỉ số, tập kịch bản. Nếu live chưa qua, demo file offline có nhãn mô phỏng và trình bày integration đang nghiệm thu. Không dùng kết quả mô phỏng để khẳng định job production.

Ground phẳng cục bộ chưa xử lý mọi curb/bậc; ngưỡng QC tham khảo chưa được đội QC phê duyệt. Chưa có semantic/temporal QC, overlap roll/pitch chính xác, benchmark dữ liệu lớn hoặc hỗ trợ mọi CVAT version. Kế hoạch dài hạn ở REALTIME_IMPLEMENTATION_PLAN.md.
