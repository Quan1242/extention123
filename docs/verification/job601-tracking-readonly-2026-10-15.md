# Job 601 — kiểm tra tracking chỉ đọc, 15/10/2026

URL: https://cvat-test.vantixapps.net/tasks/602/jobs/601

## Quan sát xác nhận
- Dùng tab Edge đang đăng nhập; không đọc/copy sessionID.
- GET /api/server/about trả version 2.77.1.
- GET /api/jobs/601 trả task_id 602, dimension 3d, media_type point_cloud, 66 frame (0–65).
- GET /api/jobs/601/annotations trả 10 tracks, không có shapes độc lập. Mỗi track có đúng một shape/keyframe tại frame 0, outside=false. Tổng cộng 10 keyframes; 9 nhãn label_id 12873 (UI two-wheels), 1 label_id 12872 (UI pedestrian).
- UI box clientID 5 / server track 42339 tại frame 0, 40, 65 giữ cùng tọa độ hiển thị (-35.35, 0.72, 1.10), kích thước (1.50, 0.85, 1.59), yaw 19.2 độ.
- Ở frame 0, các hình chiếu của box5 có điểm vật thể. Ở frame40, phần trong box ở các hình chiếu gần như trống, trong khi box giữ cùng tọa độ. Cảnh/camera context thay đổi giữa hai frame.
- UI frame40 báo box5 không có geometry issues theo rule/filter hiện tại. Đây không phải chứng nhận box đang bám đúng vật thể.
- GET /api/jobs/601/data/meta trả Server Error 500. Chưa xác nhận pose, calibration, timestamp hay frame convention từ endpoint này.

## Kết luận có giới hạn
Trường hợp hiện tại thiếu keyframe chuyển động: box được giữ từ keyframe duy nhất; không có hai keyframe để nội suy quỹ đạo thực tế và không có bằng chứng tracker đã tìm vật thể trong mỗi cloud. Chưa có cơ sở kết luận nâng phiên bản CVAT giải quyết được.
Không quy tất cả hiện tượng bay/chìm cho ego motion; cần đọc PCD/pose hoặc đăng ký nền tĩnh để phân biệt chuyển động cảm biến, vật thể và lỗi hệ tọa độ.

## Hướng tiếp theo
Thử theo dõi một track trên đoạn ngắn, có keyframe được người dùng duyệt; xác minh tọa độ/pose, bù ego motion, giữ kích thước, refine theo điểm, kiểm tra ground và độ tin cậy. So sánh với box tay tại nhiều frame trước khi xử lý toàn job. QC nên thêm kiểm tra điểm hỗ trợ và nhất quán thời gian.

## Không thay đổi dữ liệu
Chỉ GET/API navigation và xem frame. Không gọi save, import, auto-fit hoặc snap. Trả tab về frame40, box5 như lúc bắt đầu. UI báo không có thay đổi chưa lưu.
