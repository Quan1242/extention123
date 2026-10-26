# Audit job 601: keyframe 0–7–14

Ngày 15/10/2026. Chỉ đọc bằng tab Edge đã đăng nhập và GET API; không đọc sessionID, không Save/sửa annotation.

## Xác nhận
API annotations trả đủ 3 keyframe ở frame 0, 7, 14 cho server track 36284, 42336, 42339 (UI #1, #2, #5). Bảy track còn lại chỉ có keyframe0. Editor báo không có thay đổi chưa lưu lúc bắt đầu.
Kiểm tra UI các frame3,4,10,11; hình chiếu #5 ở frame4/10/11, #1 và #2 tại frame11.

## Mức chỉnh tại frame7 so với nội suy trước đó
Đây là độ thay đổi annotation, KHÔNG phải sai số tracker hoặc ground truth:
- #1: delta XYZ (-0.0268,+0.2275,0) m; tổng 0.2291 m.
- #2: delta XYZ (-0.0640,+0.3067,+0.2230) m; tổng 0.3846 m.
- #5: delta XYZ (-0.3979,+0.7804,0) m; tổng 0.8760 m.
Cả ba giữ cùng kích thước và yaw tại 0/7/14.

## Quan sát
#5 frame4 có cụm điểm nằm trong các hình chiếu, tốt hơn quan sát đường nội suy cũ tại frame7. Tuy nhiên ở frame10–11, Top cho thấy cụm điểm sát/vượt mép box; Side/Front chưa bao hết một phần điểm. Không có box tay tại frame4/10/11 để tính sai số mét/IoU.
#1 frame11 vẫn có điểm vật thể trong Top/Side/Front. #2 frame11 có điểm hỗ trợ trong box nhưng thưa, chưa đủ chứng nhận đúng toàn hình học.
Z #2 ở 0/7/14 là 0.5866/0.8096/0.5866 m; hai đoạn nội suy tạo một đỉnh ở frame7. Cần so với ground từng frame để quyết định đỉnh này là đúng hay sai; không kết luận chỉ dựa Z toàn cục.
Sau frame14 chưa có keyframe mới cho 3 track này; không được xem đoạn15–65 là đã tracking.
QC hình học hiện không chứng nhận độ bám point cloud và chưa có temporal QC. Không dùng con số no issues để kết luận track đúng.
Khôi phục tab về frame7, box2 như lúc bắt đầu. Không sửa code trong audit.

## Tham khảo
https://github.com/naurril/SUSTechPOINTS/blob/dev-auto-annotate/README_guide.md
https://github.com/naurril/SUSTechPOINTS/blob/dev-auto-annotate/public/js/box_editor.js
https://github.com/naurril/SUSTechPOINTS/blob/dev-auto-annotate/LICENSE
