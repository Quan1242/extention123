# Batch Track Review 1.8.0

## Đã làm
- Native annotations.export()/annotations.get(frame,true,[]) đọc cùng collection editor, không GET bản server cũ.
- Native FrameData.data().imageData PCD blob và Three.js PCDLoader; không đổi frame đang xem để tính.
- Bộ refine position-only tự triển khai: seed ROI, loại interior của box lân cận ngoài seed, lọc ground, cụm3D, min/max robust trong yaw đã khóa; giữ yaw/LWH, giới hạn dịch chuyển1,2m XY và0,5m Z, chặn mất support quá10%.
- Chỉ đề xuất giữa hai keyframe hiện diện; giữ toàn bộ native keyframe, outside, box khóa/ground truth và bảo vệ tạm trong batch.
- UI7frame, Top/Side/Front, cam/xanh before/after, explicit accept, native navigation, export sampled preview.
- Apply native save từng frame, tối đa20; revalidate track signature/identity/mode, chặn gửi lặp. Không tự Save server. Không hứa transaction hoặc rollback hàng loạt.
- Hủy read giải phóng cache; chống kết quả read cũ làm ô nhiễm batch mới; không cache điểm ROI trong bridge completed-response map.
- THREE MIT license kèm extension. Không sao chép mã SUSTechPOINTS (GPL-3.0).

## API đối chiếu
CVAT v2.77.0:
https://github.com/cvat-ai/cvat/blob/v2.77.0/cvat-core/src/session-implementation.ts
https://github.com/cvat-ai/cvat/blob/v2.77.0/cvat-core/src/annotations-objects/track.ts
https://github.com/cvat-ai/cvat/blob/v2.77.0/cvat-core/src/annotations-history.ts
https://github.com/cvat-ai/cvat/blob/v2.77.0/cvat-canvas3d/src/typescript/canvas3dView.ts
History transaction native chỉ hỗ trợ cùng frame; bản này mỗi frame có Undo riêng. Serverjob6012.77.1 đã audit chỉ đọc, batch mới chưa được cài/chạy trên tab đó.

## Kiểm thử
Trước khi đẩy GitHub ngày 2026-10-15: 64/64 unit tests và toàn bộ 17/17 browser tests pass (32.4s), gồm test chặn phím tắt trong dialog. Xem batch-1.8.0-tests.json.
Test batch gồm giả lập ObjectState/native collection và PCD ASCII thật được parser Three.js đọc trong browser, không phải cloud thật job601.
Bao phủ anchors không đổi, áp dụng có lựa chọn, dimensions/yaw không đổi, stale data/read-only/job change, lỗi ghi một phần, concurrent apply, cancel/read race, không lan khi thiếu anchor, UI projections và native frame navigation.
Ảnh batch-track-preview-1.8.0.png là fixture mô phỏng, không phải kết quả đã sửa job601.

## Chưa làm và giới hạn
Không ego-motion, odometry, timestamp-based dynamics, scene registration, forward/backward fusion, learned tracker, temporal QC toàn diện. Chưa tinh chỉnh yaw/size theo batch, chưa lưu finalize tạm qua lần đóng/mở, chưa có atomic batch Undo. Thao tác Open in CVAT đã kiểm thử DOM fixture; cần kiểm tra native control của deployment thật.
Support tăng không chứng minh đúng vật thể. Người dùng cần xem từng đề xuất. Bản đầu phù hợp thử nghiệm0–14, chưa chứng nhận giảm số lần chỉnh tay hoặc đạt độ chính xác trên toàn66frame.
