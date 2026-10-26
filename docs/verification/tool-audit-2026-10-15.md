# Kiểm tra tool — 15/10/2026

Phạm vi: source hiện có, extension ZIP 1.6.0, standalone demo; không sửa mã nguồn và không thao tác CVAT server.

## Kết quả
- node --test tests/*.test.cjs: 49/49 pass.
- Playwright Edge headless: 8/8 pass (43 giây).
- Hai bundle MAIN/ISOLATED khớp chính xác các file nguồn ghép bởi build script.
- Tất cả 8 file trong ZIP 1.6.0 khớp byte với extension hiện tại.
- Standalone HTML chứa đúng geometry_math.js, content_script.js và demo.bundle.js hiện tại.
- Test bao gồm Auto-Fit, Ground Snap sau fit, native selection/history mock, camera framing, lỗi dependency geometry, lọc tất cả lỗi của box, các ROI thật 62/63/17/32.

## Phát hiện cần xử lý
Code hiện tại có VEHICLE_SUBTYPES cho truck, bus, van, pickup và các subtype khác; adapter đọc subtype từ attributes. resolveDimensionSpec dùng profile subtype cho Auto-Fit và QC. Ví dụ box vehicles/subType=bus kích thước 10 x 2,5 x 3 m không có lỗi kích thước. Mặc định vehicles không subtype vẫn dùng giới hạn xe gia đình 2,8–5,8 / 1,4–2,3 / 1,1–2,2 m. Hành vi subtype rộng không nhất quán với yêu cầu trước đó chỉ xe gia đình và README. Không tự xóa thay đổi hiện có trong lần audit.

## Giới hạn
Không kiểm chứng trên tab CVAT đang chạy; native adapter được kiểm thử bằng mock. Pass test không chứng nhận độ chính xác trên mọi point cloud. Fixture box32 không có mẫu tay đúng để tính IoU nghiệm thu. Source được giữ nguyên trong lần kiểm tra này.
