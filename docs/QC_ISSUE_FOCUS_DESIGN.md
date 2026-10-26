# Chọn lỗi và Focus box — 1.6.0

## Hành vi
Nhấn dòng lỗi chọn clientID của box chính trong CVAT, chuyển bộ lọc mức lỗi sang Tất cả, rồi đưa camera perspective tới box. Danh sách được lọc theo activeBoxId và boxIds của lỗi; selectedIssue không giới hạn danh sách. Box có ba lỗi tiếp tục hiện ba lỗi. Chọn trực tiếp trong CVAT vẫn tôn trọng bộ lọc mức lỗi hiện tại.

Lỗi overlap liên kết hai box: dòng chính chọn box thứ nhất; nút Chọn #ID chọn và Focus box thứ hai. Mỗi lần chọn hiện các lỗi liên quan box tương ứng.

## Camera
Giữ hướng nhìn hiện tại. Lấy tâm box làm target. Bán kính bao là nửa đường chéo 3D; khoảng cách dùng FOV nhỏ hơn giữa chiều ngang và dọc, thêm hệ số 1,25. Camera-controls setLookAt hoặc OrbitControls target được cập nhật. Chuyển ngay tới vị trí mới; chưa có animation. Focus kết thúc Free Cam để tránh camera tiếp tục bay.

## Dữ liệu và lỗi
Dùng bridge SELECT_OBJECT với focus=true, session/job/frame/revision/clientID. Không ghi annotation, không gọi ObjectState.save, không thêm history. Nếu chỉ chọn được box mà không truy cập camera, trả focused=false và hiển thị thông báo. Nếu build chỉ có canvas.focus, sử dụng API native đó.

## Kiểm chứng
Native adapter mock cùng Three.js PerspectiveCamera xác nhận đúng clientID, hướng camera, toàn bộ đỉnh trong khung và history không thay đổi. Browser fixture xác nhận ba lỗi vẫn hiện và filter trở về ALL. Browser demo kiểm tra camera thực sự thay đổi khi nhấn lỗi.
Chưa nghiệm thu trên tab CVAT thật.
