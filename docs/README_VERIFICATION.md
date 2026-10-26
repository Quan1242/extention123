# Kiểm chứng README — 06/10/2026

> Báo cáo lịch sử cho mã 1.1 trước khi sửa. Bản 1.2 được mô tả trong README hiện tại, DEMO_GUIDE.md và verification/current-verification.json. Script verify-readme.cjs hiện kiểm tra bản 1.2; không tái tạo bộ phép thử 1.1 bên dưới.

## Kết luận

Project hiện là prototype. Có thể đọc API CVAT thật và chạy các phép toán offline, nhưng chưa đủ bằng chứng để gọi là production-ready hoặc realtime end-to-end. Một số tuyên bố bị bác bỏ trực tiếp bởi code và kiểm tra tái hiện; các tuyên bố về PATCH/render live chưa được xác nhận.

Lần đo lưu trong báo cáo: **16:25:12 ngày 06/10/2026, Asia/Bangkok (UTC+7)**. Dữ liệu live có thể đổi sau thời điểm này.

## Phạm vi và bằng chứng

- Đọc toàn bộ logic extension và đối chiếu tài liệu.
- Chạy JavaScript thực tế bằng Node v24.19.0: fixture có sẵn, ca hình học tổng hợp, và các hàm content script trong DOM giả lập.
- GET có xác thực đến đúng origin cấu hình; không thực hiện POST/PATCH/DELETE. Không tắt kiểm tra TLS, không chuyển tiếp credential qua redirect.
- Sau khi người dùng cung cấp tài khoản trong chat, đã đăng nhập bằng giao diện CVAT và mở được job. UI hiển thị organization `ai20k-labs`, frame 29, `Items: 62`, point cloud và ảnh contextual.
- Đã click box 1 ở sidebar native: DOM có class `cvat-objects-sidebar-state-active-item`, các hình chiếu Top/Side/Front hiển thị box. DOM có 7 canvas. Không có panel `cvat-3d-copilot-root` trong tab kiểm tra, nên chưa kiểm chứng extension MAIN/ISOLATED world, click từ Copilot, rotate/snap hoặc camera Copilot trên UI thật.
- Credential lấy trong bộ nhớ từ cấu hình có sẵn, không ghi vào báo cáo. API GET thành công không chứng minh quyền PATCH hoặc phiên đăng nhập UI.
- Không sửa annotation trên job sản xuất để thử nghiệm. Chưa có job thử nghiệm được xác định là dùng được cho kiểm tra ghi dữ liệu.

Các artifact:

- [Báo cáo JSON và SHA-256 của input](verification/readme-verification.json)
- [README nguyên bản trước đính chính](verification/README.before-verification.md)
- [Script tái hiện](../scripts/verify-readme.cjs)
- [Bằng chứng UI job 9426 sau khi chọn box 1](verification/cvat-job-9426-ui.png)
- [Ghi nhận kiểm tra UI](verification/ui-verification.json)

SHA-256 của `README.md` trong JSON ứng với bản nguyên gốc được lưu bên trên, không phải README đã đính chính. Báo cáo không lưu toàn bộ dữ liệu annotation live; lần chạy lại sẽ đo snapshot mới và ghi đè JSON, không tái tạo lịch sử server.

## 1. Kiểm chứng truy cập server và số liệu

| Request GET | Kết quả |
|---|---|
| `/api/server/about` | HTTP 200, version `2.76.0` |
| `/api/jobs/9426` | HTTP 200, task `2837`, frame đầu/cuối `29`, dimension `3d` |
| `/api/labels?job_id=9426` | HTTP 200, không có trang labels tiếp theo |
| `/api/jobs/9426/annotations` | HTTP 200, 62 cuboid, 0 tracks |

Request sử dụng cấu hình organization `ai20k-labs` hiện có; UI đăng nhập sau đó cũng hiển thị organization này. Không dùng GET hoặc nút Save hiện trong UI làm bằng chứng cho quyền PATCH và persistence.

| Chỉ số | README cũ | Fixture đi kèm, chạy lại | API live, chạy bộ QC hiện tại |
|---|---:|---:|---:|
| Cuboid | 61 | 61 | 62 |
| Vehicles | 24 | 24 | 24 |
| Two-wheels | 20 | 20 | 20 |
| Pedestrian | 17 | 17 | 17 |
| Animal | không nêu | 0 | 1 |
| Frame | 29 | 29 | 29 |
| Tổng mục lỗi | 33 | 35 | 11 |
| CRITICAL | 29 | 31 | 7 |
| WARNING | 4 | 4 | 4 |
| Box có ít nhất một lỗi | không nêu | 33 | 10 |

35 mục lỗi trên 33 box khác với 33 mục lỗi. Không đủ bằng chứng để kết luận đây là nguyên nhân tác giả ghi 33 trong README. Các con số QC chỉ là đầu ra của rule hiện tại, **không phải lỗi đã được reviewer xác nhận**. Không suy ra chất lượng cải thiện từ chênh lệch giữa fixture và live.

Mặt phẳng `z = ax + by + c`:

| Nguồn | a | b | c |
|---|---:|---:|---:|
| README cũ | -0.0076 | -0.0082 | +0.0246 |
| Fixture, code hiện tại | -0.0043157315 | -0.0097265422 | -0.0154121743 |
| API live, code hiện tại | -0.0026445086 | -0.0080999891 | -0.0316025001 |

Kết luận: xác nhận bộ cache có 61 cuboid với phân bố class đã nêu; không tái hiện được mặt phẳng hoặc 33 mục lỗi. Snapshot live đã khác cache cả ID/tọa độ, nên không thể dùng cache làm đại diện cho trạng thái hiện tại. Không có log lịch sử để bác bỏ hay xác nhận các số liệu đó đã từng đúng ở một phiên bản trước.

## 2. Ma trận tuyên bố và kết quả

| Tuyên bố README | Kết quả kiểm chứng | Bằng chứng / giới hạn |
|---|---|---|
| Production tool | Chưa đủ điều kiện chứng minh | Các lỗi tái hiện ở mục 3; chưa có E2E live |
| Ground ước lượng từ cuboid | Đúng về phương pháp | `geometry_math.js:72`; dùng đáy các box, cắt phân vị rồi least squares |
| Một lần snap đưa box sát mặt đất thật | Chỉ đúng có điều kiện | Đúng với box đứng và mặt phẳng đầu vào; chưa đọc LiDAR/đo sai số ground thật; box nghiêng có thể xuyên đất |
| Xoay -90/+90/180 giữ tâm và size | Đạt kiểm tra toán học | 3 ca offline pass; chưa chứng minh render, save, undo live |
| Sửa heading trong <1 giây | Chưa đo | Chưa có đo độ trễ input→canvas ở browser |
| Free Cam vượt orbit và bay mượt | Không được code hiện tại hỗ trợ như mô tả | `content_script.js:489`: wheel/right-drag trên canvas đầu tiên, không có camera flight loop |
| QC tất cả cuboid trong frame | Chưa đúng tổng quát | Tải `annoData.shapes`, không lọc frame/type, không dựng track theo frame; job 9426 chỉ có một frame nên che khuất lỗi này |
| QC phát hiện mọi chiều quá khổ | Thiếu | Chỉ kiểm tra `maxL`, chưa kiểm `maxW/maxH` |
| QC phát hiện overlap 3D | Sai về thuật toán | Chỉ so khoảng cách tâm XY và Z <1m; có false positive và false negative |
| Scan/Alt+L fetch annotations | Sai | `runAutoQC()` chỉ đọc `state.shapes`; mock ghi nhận 0 fetch |
| Click Issue chọn box CVAT | Chưa có | Handler chỉ đổi `state.activeBoxId`, render panel và copy text |
| Copy đúng lỗi được click | Có lỗi logic | Handler `.find(i => i.boxId === boxId)` chọn lỗi đầu của box, không chọn đúng dòng lỗi nếu box có nhiều lỗi; chưa kiểm clipboard native |
| Realtime không cần refresh | Chưa được chứng minh | Bridge thử sửa state/mesh, content script không chờ `MUTATE_DONE`; chưa subscribe CVAT/frame/selection |
| PATCH HTTP 200 đã xác nhận | Không xác nhận lại | Có code PATCH, nhưng không có log gốc và lần kiểm chứng này chỉ GET |
| HTTP 200 chứng minh lưu + hiển thị realtime | Không đủ | Cần read-back dữ liệu, canvas, UI state, undo và reload persistence; response thành công không bao gồm các bằng chứng đó |
| Local playground kiểm thử đủ 4 trụ cột | Sai | `test_demo.html` chứa div mô phỏng, không có `<canvas>`/point-cloud renderer |
| Tự tải đúng 61 shape live | Đã lỗi thời | Job live trả 62; lỗi fetch còn tự nạp cache job 9426 ngay cả khi cấu hình đang trỏ job khác |

## 3. Các ca chạy tái hiện

**14 checks: 5 đạt, 9 chưa đạt kỳ vọng.** Đây là tập kiểm tra có chủ đích để kiểm chứng claim và rủi ro, không phải tỷ lệ bao phủ hoặc đánh giá toàn bộ sản phẩm. Check về Scan đối chiếu câu README, không khuyến nghị fetch REST sau mỗi lần Scan.

| Ca | Kết quả |
|---|---|
| Yaw -90°, +90°, 180° | 3/3 đạt: góc đúng, tâm/size giữ nguyên, input không bị mutate |
| Snap box đứng vào ground z=0.3 | Đạt sai số số học |
| Fit mặt phẳng biết trước z=0.1x+0.2y+3 | Đạt sai số <1e-9 |
| Hai box cạnh 0.1m, tâm cách 0.9m, không giao nhau | Vẫn báo DUPLICATE_COLLISION |
| Hai box 8×2×2m, tâm cách 2m, giao nhau | Không báo DUPLICATE_COLLISION |
| Box rộng 5m, cao 10m | Không báo OVERSIZED_WIDTH/HEIGHT |
| Tọa độ x=NaN | Không báo INVALID_POINTS |
| Box roll=45°, rộng/cao 2m, snap vào z=0 | Đỉnh thấp nhất còn xuyên ground khoảng 0.414m |
| Chọn box trong panel | Không phát yêu cầu activate tới CVAT |
| Scan theo claim “fetch API” | Không có fetch |
| PATCH gặp TypeError do mô phỏng mất mạng | Hàm trả true |
| Xoay với bridge không có ACK và mạng thất bại | Vẫn hiện `[REAL-TIME OK]` |

DOM giả lập chỉ xác nhận đường đi logic trong các hàm thực tế. Không dùng kết quả này thay cho việc kiểm tra React/Redux/Three.js trong CVAT thật.

## 4. Rủi ro bổ sung từ code

- Bridge gán trực tiếp `target.points`; chưa đi qua luồng history/save thống nhất. Ghép `serverID === boxId || clientID === boxId` không phân biệt hai loại ID.
- Nhánh `matchPos` có thể chọn nhiều mesh gần nhau, không xét loại mesh hay toàn bộ identity. Bỏ nhánh này trước khi dùng để chỉnh live.
- Credential đang hardcode trong content script, được dùng thành công cho GET tại thời điểm kiểm tra. Cần chuyển sang session/config phù hợp và chủ tài khoản xử lý credential đã nằm trong source; không đưa giá trị vào tài liệu/log mới.
- Mặc định server chỉ cập nhật theo origin `transformerlabs.ai`, dù manifest cho phép host CVAT khác và localhost. Mất kết nối có thể làm trộn cache 9426 với job khác.
- Chưa có rollback/reconciliation rõ khi ghi lỗi; thao tác liên tiếp có thể tranh chấp.
- Unknown class bị áp rule vehicles; hiện live đã có Animal, cho thấy cần policy theo label ID thực tế.
- Thống kê ROI trong `PITCH_TO_BOSS.md` không có dataset/log đo kèm trong project được đọc. Chưa xác minh các claim 100 frame, tiết kiệm 61%, giảm lỗi 75% hoặc review nhanh gấp 3.

## 5. Cách chạy lại

```powershell
node scripts/verify-readme.cjs
node scripts/verify-readme.cjs --live
```

Lệnh đầu hoàn toàn offline. Lệnh thứ hai chỉ GET server cấu hình đã giới hạn đúng origin. Script trả exit code 0 khi tạo báo cáo thành công; cần đọc `checks[].pass` để biết các kỳ vọng nào chưa đạt. Mã nguồn production không được thay đổi bởi script; việc expose hàm để mock chỉ diễn ra trong bản sao in-memory.

## 6. Bằng chứng cần bổ sung để nâng lên live verified

1. Phiên UI đăng nhập đã có; cần Chrome/Edge có extension được nạp đúng manifest, ghi rõ build frontend và phiên bản extension. Tab hiện tại chỉ xác nhận hành vi native CVAT.
2. Job thử nghiệm riêng và một cuboid được xác định rõ để kiểm tra ghi. Snapshot trước/sau, không dùng số liệu của cache thay cho live.
3. Chọn từ tool và từ dòng lỗi: sidebar + canvas cùng activate đúng clientID; test cả box mới chưa có serverID.
4. Rotate/snap: video hoặc screenshot trước/sau, phép đo points, history undo/redo, native save, GET read-back, mở lại job.
5. Mất mạng/401/403/timeout: UI phản ánh chưa lưu; không xuất thông báo thành công giả.
6. Free Cam: video chuyển động và đo frame time trên máy chạy thực tế.

## 7. Nguồn CVAT đối chiếu

- [Canvas3D API tại tag v2.76.0](https://github.com/cvat-ai/cvat/blob/v2.76.0/cvat-canvas3d/src/typescript/canvas3d.ts): có `activate(clientID)`, `focus(clientID)`, `setup`, `render`. Đây là điểm tích hợp để khảo sát, không phải bằng chứng các instance được expose trên bản triển khai nội bộ.
- [Annotation actions tại tag v2.76.0](https://github.com/cvat-ai/cvat/blob/v2.76.0/cvat-ui/src/actions/annotation-actions.ts): activation liên quan clientID và có kiểm tra trạng thái thao tác. Adapter cần tôn trọng các điều kiện này.
- [Tài liệu 3D CVAT](https://docs.cvat.ai/docs/annotation/manual-annotation/modes/3d-object-annotation/): có shape/track và phím điều hướng; `Alt+L` trong tài liệu là di chuyển sang phải, xung đột phím Scan đang chọn. Tài liệu online không chứng minh keymap chưa bị tùy chỉnh ở instance nội bộ.
