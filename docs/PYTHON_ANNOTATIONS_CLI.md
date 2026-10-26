# Python annotation CLI — 1.12.0

File chính: `extension/cvat_annotations.py`. Python 3.10+, chỉ dùng standard library; không cần pip install. Các script tracking Python cũ không bị thay thế.

Trong **Phiên CVAT & Import/Export**, bấm **Tải Python CLI**, mở PowerShell tại thư mục chứa file tải về và dùng các nút copy lệnh. Lệnh chứa đúng origin/job và không chứa cookie thật. Đây là script chạy thủ công trong terminal, không phải native-messaging host: extension không tự khởi chạy Python, không gửi cookie cho localhost/service và không đọc profile trình duyệt bằng Python.

## Xác thực

`--prompt-auth` hỏi sessionID và CSRF qua getpass (ẩn khi nhập). Có thể lấy giá trị bằng các nút phiên hiện có trong extension rồi dán vào prompt. Bỏ trống CSRF chỉ phù hợp thao tác GET. Không đưa secret vào command line hoặc file source.

Có thể bỏ `--prompt-auth` và đặt biến môi trường trong terminal: `CVAT_SESSIONID` / `CVAT_CSRFTOKEN`; chấp nhận cả tên cũ `CVAT_SESSION_ID` / `CVAT_CSRF_TOKEN`. CLI không tự đọc/lưu `.env`. Nếu chủ động cấu hình `CVAT_API_TOKEN`, nó dùng Authorization với `CVAT_TOKEN_SCHEME=Token` mặc định hoặc `Bearer` theo loại token server hỗ trợ. Session cookie không cần API token.

Cookie phiên và CSRF là thông tin xác thực; CLI không in ra log, nhúng vào file xuất hay tự chuyển sang server khác. Chặn redirect và URL tải khác origin. Chỉ chấp nhận HTTPS, ngoại trừ loopback dành cho kiểm thử. Quyền tài khoản trên CVAT vẫn áp dụng; Python không sửa được export403.

## Lệnh

Ví dụ job601; thay bằng server/job thực tế. Toàn bộ global flags đặt trước tên subcommand.

```powershell
python .\cvat_annotations.py --server https://cvat-test.vantixapps.net --job 601 --prompt-auth formats

python .\cvat_annotations.py --server https://cvat-test.vantixapps.net --job 601 --prompt-auth export-native --output job601-native.json

python .\cvat_annotations.py --server https://cvat-test.vantixapps.net --job 601 --prompt-auth export --format 'Datumaro 3D 1.0' --output job601-annotations.zip
```

- `formats`: chỉ các importer/exporter 3D đang được bật.
- `export`: POST job dataset/export, save_images=false → poll rq_id → GET result_url. Kiểm tra CRC và giới hạn kích thước giải nén của ZIP trước khi lưu file đích. Không kèm PCD/ảnh. Không ghi đè file đã tồn tại.
- `export-native`: GET annotation đã Save và toàn bộ định nghĩa label/attribute của job. Giữ track, shape, các mốc frame, tọa độ và thuộc tính API trả về, thêm metadata và SHA256 của annotation. Không phải full task backup hoặc dataset ZIP. Khác với JSON chẩn đoán Auto-Fit/batch.

## Import và restore

**Save rồi đóng editor trước khi chạy import.** Thao tác thay thế annotation server, không có Undo native. Các lệnh sau chỉ là mẫu; không chạy lên job thật nếu chưa kiểm tra file.

```powershell
python .\cvat_annotations.py --server https://cvat-test.vantixapps.net --job 601 --prompt-auth import --format 'Datumaro 3D 1.0' --file annotations.zip --confirm-job 601 --editor-closed

python .\cvat_annotations.py --server https://cvat-test.vantixapps.net --job 601 --prompt-auth import-native --file job601-native.json --confirm-job 601 --editor-closed
```

1. `--confirm-job` phải khớp `--job`; `--editor-closed` là xác nhận của người chạy, không phải khả năng tự kiểm tra trình duyệt.
2. `import` chỉ nhận ZIP hợp lệ và importer 3D có trên server. Upload local dùng use_default_location=false, không lấy nhầm vị trí cloud storage mặc định.
3. `import-native` chỉ nhận bundle native đúng schema và đúng origin/job ban đầu. Kiểm tra label IDs/tên, attribute schema và cuboid16. File JSON native từ UI cũ chỉ có label mapping cơ bản sẽ bị chặn nếu cần kiểm tra schema attributes; dùng bản export từ CLI cho restore. Không hỗ trợ remap label/copy sang job khác.
4. Trước mọi import, tạo JSON native mới trong `cvat-backups/`, flush/fsync, đọc và kiểm tra fingerprint; đọc lại annotation server để phát hiện thay đổi kể từ lúc backup. Lỗi backup hoặc concurrent edit đã phát hiện sẽ chặn write.
5. ZIP import dùng POST multipart và poll Requests. Native restore dùng PUT JSON, bỏ ID annotation cũ và kiểm tra read-back không tính ID/version. Server annotation IDs có thể đổi; giữ các mốc keyframe và geometry không đồng nghĩa giữ server IDs. Read-back khác sẽ báo lỗi sau write và chỉ ra backup, không tự rollback.
6. Reload CVAT trước khi chỉnh sửa tiếp; không Save editor cũ lên dữ liệu đã import.

CLI dùng **native JSON backup có chủ đích** cho cả hai lệnh import; khác với luồng import trực tiếp trong trang extension vẫn yêu cầu ZIP dự phòng. Với quyền exportZIP bị từ chối nhưng quyền đọc/ghi annotation có sẵn, CLI có thể backup bằng GET; nó vẫn phải được server cho phép POST/PUT. Quyền ghi không được giả định từ quyền đọc.

Mặc định giới hạn 256 MiB cho file nén, JSON response và tổng dữ liệu giải nén; tăng có chủ đích qua `--max-mib`. Upload multipart và bước publish ZIP dùng RAM, nên file lớn cần cân nhắc bộ nhớ. Poll mặc định 20 phút, đổi bằng `--timeout` (giây). Không tự retry write. Timeout/gián đoạn có thể để tác vụ server tiếp tục: kiểm tra Requests trước khi thử lại.

Kiểm tra lại trước write không tạo giao dịch atomic với người sửa khác; cần điều phối editor/job khi import. Backup không gồm raw PCD, ảnh, cấu hình task đầy đủ, quyền hoặc lịch sử Undo.

## Kiểm thử

```powershell
python -m unittest discover -s tests -p test_annotation_cli.py
```

Test chạy trên HTTP server loopback với dữ liệu/session giả; không gọi CVAT thật. Xem `verification/python-cli-1.12.0.md` để biết bằng chứng và giới hạn.

API tham chiếu: https://docs.cvat.ai/docs/api_sdk/sdk/reference/apis/jobs-api/ .
