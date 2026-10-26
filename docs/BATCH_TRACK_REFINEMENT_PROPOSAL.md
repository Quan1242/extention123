# Đề xuất Batch Track Review & Refinement

Trạng thái: bản đầu 1.8.0 đã triển khai batch viewer, bảo vệ keyframe, preview position-only và apply các frame đã chọn qua native save/history. Các mục pose/ego motion, forward/backward, AI, finalize lâu dài và temporal QC đầy đủ bên dưới vẫn là thiết kế tiếp theo. Xem README và docs/verification/batch-1.8.0.md để biết phạm vi hiện hành. Cơ sở: audit job601 với keyframe0/7/14 và workflow SUSTechPOINTS.

## Mục tiêu
Giảm đổi frame và số lần chỉnh tay bằng review cùng vật thể trên nhiều frame, giữ mốc đã duyệt, refine các frame còn lại theo point cloud và chuyển động. Không coi batch editing đơn thuần là thuật toán tracking mới.

## Giao diện
Mở từ box/track được chọn. Dùng track identity native; không coi clientID tạm là server ID.
Timeline phân biệt keyframe đã có, mốc đã duyệt và đề xuất chưa áp dụng.
Hiển thị dải 5–7 frame một lượt, mỗi frame có Top/Side/Front của cùng track, đồng bộ hướng và tỷ lệ hiển thị. Tải ROI theo nhu cầu, LRU cache để không giữ toàn job cloud trên RAM.
Chọn một/nhiều frame hoặc đoạn. Click frame quay lại CVAT và chọn đúng box.
Hai trạng thái quan trọng: Existing keyframe (mặc định bảo vệ), Reviewed/Finalized (không tự ghi đè). Finalized là trạng thái riêng của tool; cần thiết kế lưu theo user/server/job/track, không lạm dụng lock hoặc thuộc tính CVAT chưa được cấu hình.
Không tự coi mọi keyframe là ground truth đúng. Người dùng chọn các mốc làm anchor đã duyệt.

## Các lệnh
- Refine position, giữ kích thước/yaw.
- Refine ground/height với khóa kích thước theo lựa chọn.
- Refine yaw riêng, tránh xoay vô căn cứ trong cloud thưa.
- Đồng bộ kích thước từ frame nhìn rõ nhất tới phạm vi đã chọn; rider/pedestrian có thể không phải vật thể cứng, do người dùng quyết định khóa.
- Interpolate preview; refine preview từ cloud; accept/reject từng frame/đoạn.
Không cộng một delta XYZ cố định cho toàn chuỗi LiDAR khi chưa quy về hệ tọa độ chung.

## Thuật toán
1. Kiểm tra timestamp, hệ tọa độ và pose/calibration. Nếu dữ liệu local LiDAR và có pose, bù ego motion trước dự đoán; nếu thiếu, đánh giá registration nền tĩnh. Không hứa tracking toàn job nếu pose không đáng tin.
2. Dùng anchor hai phía và motion prediction làm ROI khởi đầu, giới hạn tốc độ/góc quay theo timestamp, không chỉ số frame.
3. Chọn điểm mục tiêu có cạnh tranh giữa track, ground filtering và temporal template. Ground theo frame; không ép toàn track một Z.
4. Giữ kích thước được duyệt, refine XYZ rồi yaw khi có bằng chứng; không chạy Auto-Fit tự do từng frame.
5. Chạy xuôi/ngược; kiểm tra sai khác và mức hỗ trợ điểm. Mất dấu/che khuất thì dừng hoặc đánh dấu cần review; không tự outside chỉ vì ít điểm.
6. Chỉ dùng smoothing có ràng buộc; cubic spline đơn thuần không khắc phục sai tọa độ và có thể overshoot.

## Temporal QC và chọn keyframe chủ động
Cảnh báo lệch cụm, điểm hỗ trợ giảm đột ngột (cần tính occlusion/range), ground residual, nhảy vị trí/yaw/kích thước, ID conflict và forward/backward disagreement.
Xếp hạng frame nên duyệt tiếp (ví dụ đoạn7–14 của box5), không tự thêm keyframe cách đều vô điều kiện.
Keyframe bổ sung phải cải thiện kết quả đo trên cloud; không dùng số lượng keyframe làm proxy chất lượng.

## Lưu dữ liệu
Preview tách khỏi annotations; áp dụng khi người dùng chọn kết quả. Dùng native track update/history nếu CVAT2.77.1 hỗ trợ ổn định qua nhiều frame; cần kiểm chứng trước khi hứa one-step Undo.
Adapter hiện chỉ sửa ObjectState của frame hiện tại và kiểm tra revision/frame; cần API batch riêng, không bỏ validation để sửa off-screen.
Trước apply, kiểm tra job, track, anchor revisions và unsaved changes; lập journal diff phục hồi, giữ mốc bảo vệ. Nếu phải ghi API/import, cần backup và xử lý reload khác với native Undo; không tự trộn hai đường ghi.
Tác vụ batch cần progress/cancel; kết quả đang tính không ghi editor một phần.

## Các giai đoạn
1. Batch viewer + bảo vệ keyframe + jump-to-frame + temporal QC; chỉ đọc.
2. Position-only refinement preview cho tracks1/2/5, frames0–14. Giữ các anchor0/7/14 và kích thước/yaw.
3. Đo trên frame3/4/10/11 với mẫu tay độc lập; center/yaw/dimension error, IoU, ID switches, số correction và thời gian người dùng sửa.
4. Chỉ sau khi đạt tiêu chí mới mở rộng frames0–65 và các track còn lại; bổ sung pose/backend/mô hình tracking nếu cần.
Test thuật toán phải gồm ego motion, xe đứng yên/di chuyển, che khuất, điểm thưa, ground nghiêng và hai xe sát nhau.

## Tham khảo
SUSTechPOINTS hướng dẫn edit multiple instances, interpolate/auto(no rotation)/auto annotate, finalize anchors, trajectory và sync size/type/attributes. Học workflow và tự triển khai tích hợp CVAT; nếu tái sử dụng mã trực tiếp phải xem GPL-3.0 của repository.
https://github.com/naurril/SUSTechPOINTS/blob/dev-auto-annotate/README_guide.md
https://github.com/naurril/SUSTechPOINTS/blob/dev-auto-annotate/public/js/box_editor.js
https://github.com/naurril/SUSTechPOINTS/blob/dev-auto-annotate/LICENSE
