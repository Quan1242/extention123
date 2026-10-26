# Phiên CVAT và Annotation — 1.7.0

## Kiến trúc
HUD mở session.html qua runtime. Trang extension gọi service worker để kiểm tra tab/domain/job và đọc cookies đúng cookie store của tab. Chỉ session.html được nhận giá trị sessionid/csrftoken; không có giá trị thật trong bundle/storage/log/bridge.

Import/export đi từ session.html qua tabs.sendMessage tới isolated content script. Transport kiểm tra origin/job hiện hành và Save state, gọi các endpoint giới hạn cùng origin với credentials include và CSRF. Không có arbitrary fetch proxy hoặc DELETE/PATCH trong transport mới.

## API đã đối chiếu
CVAT 2.76 source:
https://github.com/cvat-ai/cvat/blob/v2.76.0/cvat/apps/engine/views.py
POST /api/jobs/{id}/dataset/export?format=...&save_images=false&location=local
POST /api/jobs/{id}/annotations/?format=...&location=local (multipart annotation_file)
GET /api/requests/{rq_id}
GET result_url (chỉ cùng origin, đường dẫn requests hoặc dataset của job đích).

## Hành vi
Cookie chỉ đọc khi bấm, che mặc định, xóa trên pagehide/visibilitychange hoặc nút Xóa. Clipboard do người dùng chủ động copy không tự xóa.
Script Python mẫu chỉ xác thực và mô tả endpoint; không nhúng cookie thật.
Import xác nhận hai bước, tải bản export dự phòng hoàn tất trước upload, chặn lặp sau submit, yêu cầu reload editor.
File giới hạn 8 MiB do transport JSON runtime. Trình duyệt có quyền mới cookies/downloads.
Không hỗ trợ cloud storage download khác origin, API cũ trước cơ chế rq_id hoặc cookie tên tùy biến. Các deployment khác/SSO/CSRF phải kiểm chứng.

## Kiểm thử
54 unit tests pass; 12 browser tests pass.
Test mới: host/job scope, cookie sender isolation, authenticated request/CSRF, multipart import, unsaved/read-only/stale block, unsafe download rejection, repeat import block; UI masked/read/copy/clear, script không chứa cookie, export không đọc raw cookie, backup-before-import, canceled backup chặn upload.
Browser session tests mock Chrome APIs/server; các browser demo cũ vẫn pass.
Chưa chạy extension thật với HttpOnly cookie trên CVAT; chưa import hoặc export từ server người dùng. Không có annotation server bị thay đổi trong quá trình phát triển/kiểm thử.
