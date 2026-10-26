# CVAT 3D TOOL 1.16.0

## JSON export/import giữ ID hiển thị — 1.16.0

Export JSON trên HUD (và JSON native trong trang Phiên) lấy dữ liệu native editor, gồm chỉnh sửa chưa Save, `clientID` là số hiển thị và `id` là ID database. File có metadata server/job và schema nhãn. JSON cũ chỉ có ID database được đối chiếu ID đó trong job hiện tại; không dùng số thứ tự mảng để đoán số box.

Nút **Thống kê cuboid theo ID** đếm số frame cuboid hiện diện và số frame `outside` thành hai cột riêng theo từng `clientID` trên Job hiện tại, tính cả frame nội suy giữa các keyframe track. Mốc `outside` được tính từ frame đó tới keyframe kế tiếp hoặc hết job; một frame outside không cộng trùng vào cột Cuboid. Cuboid standalone chỉ được tính tại frame của nó. Kết quả hiển thị thêm ID database và class.

Import Replace mở danh sách cho chọn từng ID, tìm theo ID/class, hoặc chọn **Replace toàn bộ job**. Thay một ID nghĩa là thay toàn bộ keyframe, geometry, nhãn, attributes và visibility của track đó; keyframe cũ vắng trong file được bỏ. Đối tượng đang có được sửa bằng native ObjectState.save(), không bị xóa/tạo lại, nên giữ `clientID` và ID database trong editor hiện tại. Replace toàn bộ xóa ID đích không có trong file; chế độ chọn ID giữ nguyên các ID ngoài lựa chọn. Nếu ID không tồn tại, Replace dừng và yêu cầu dùng Add; không tự biến Replace thành tạo ID mới.

Import Add cũng mở danh sách chọn ID nguồn. Nó tạo đúng những đối tượng đã chọn, giữ nguyên đối tượng đang có; CVAT cấp ID mới và UI báo ID mới sau khi thêm. Không thể Add một đối tượng thứ hai dùng trùng số ID của đối tượng đã tồn tại. Group thay đổi được tạo lại giữa các ID đã chọn, không ghép ngoài ý muốn với thành viên không được chọn; số group có thể đổi.

Import áp dụng vào editor và cập nhật render, có native Undo theo thao tác. **Save CVAT để lưu server; không tự reload.** Kế hoạch hết hạn khi editor thay đổi; preflight chặn target khóa, dữ liệu lỗi, label/attribute không ánh xạ chính xác. Hiện hỗ trợ cuboid track/shape; tags/intervals/skeleton hoặc đổi frame bắt đầu của đối tượng bị chặn rõ ràng. Luồng native có thể dừng sau một số thao tác nếu lỗi; UI báo phần đã sửa và yêu cầu kiểm tra Undo, không tuyên bố rollback nguyên tử.

Trong HUD, **Snap box sát mặt đường** dịch Z của box đang chọn ở frame hiện tại theo ground đang dùng (mặt đường LiDAR hoặc origin + offset). Với track, nhập L/W/H trong inspector rồi xác nhận **Áp dụng size cho mọi keyframe** để đổi kích thước trên toàn bộ keyframe native của track đang chọn; từng keyframe giữ nguyên tâm và hướng, CVAT nội suy các frame ở giữa. Mỗi keyframe dùng native save/history riêng; kiểm tra Undo nếu thao tác dừng một phần và bấm **Save CVAT** để lưu lên server.

Số `clientID` thuộc phiên editor, CVAT có thể cấp lại khi tải mới job; extension không ép bộ đếm native hoặc sửa CVAT core để cố định số qua mọi phiên. Đảm bảo ở đây là Replace không tái tạo đối tượng hoặc tăng nó thành #80… trong phiên hiện tại. ID database của đối tượng được giữ khi Save bằng native CVAT. Import ZIP dataset và CLI là luồng server khác, không có bảo đảm ID của luồng JSON HUD. Kết quả kiểm thử ngoại tuyến không thay cho nghiệm thu import/export job thật.

## Windows double-click installer — 1.15.1

Download [CVAT-3D-Tool-Setup.exe](https://github.com/ManhLD-LDM/CVAT_Tool/releases/latest/download/CVAT-3D-Tool-Setup.exe) and double-click it. This bundles the extension, native updater and runtime; no Python installation, PowerShell command or extension-ID entry is needed. It installs per user into `%LOCALAPPDATA%\CVAT-3D-Tool` and automatically registers the host for Edge/Chrome. The GUI distinguishes file installation from the remaining browser activation step.

For this unpacked, outside-store distribution, users still Save CVAT, disable the old tool copy, enable Developer mode and Load unpacked the managed extension folder once. Setup does not bypass browser restrictions, change profile files/policies, or close/reload unsaved jobs. It retains the previous installed extension as a backup and refuses downgrades. The EXE is currently unsigned. See [installation instructions](updater/README.md).

## GitHub updater + save before Reload — 1.15.0

HUD checks the latest stable GitHub Release once when mounted and on Reload; there is no periodic scan. The small status distinguishes current, newer release, local build ahead, and unavailable (offline/private/rate-limited/no release). If a newer release exists, Reload offers **Cập nhật** and **Reload bản hiện tại**; it does not install automatically.

Windows updates require a one-time per-user Native Messaging setup. The original 1.15.0 ZIP installer required Python 3.10+ and manual ID entry; current Setup.exe bundles the runtime and registers the ID automatically. The installer creates `%LOCALAPPDATA%\CVAT-3D-Tool\extension`, separate from the source checkout. Load this unpacked copy and disable the old copy. Moving folders changes an unpacked extension's ID; settings may need to be configured again. See [installer instructions](updater/README.md).

Before a HUD reload/update, all open CVAT job tabs are checked and held against interaction. Pending annotations are saved through native `job.frames.save()` / `job.annotations.save()` and verified clean; unknown state, save failure, open editing dialogs, busy canvas, changed job/tab set or duplicate dirty editors block reload. The extension then reloads and restores the saved job tabs. This guard does not intercept browser Refresh/close. Import-result reload intentionally does not save stale editor data over imported server annotations.

Updater only accepts the pinned repository's latest stable ZIP, verifies SHA-256 and a flat file allowlist, stages first, retains the old directory as backup and rolls back a failed directory swap. No Git pull, CVAT credentials or annotation transfers go through GitHub/the updater. Publisher must upload the generated versioned extension ZIP, `CVAT-3D-Tool-Updater-Windows.zip` and `SHA256SUMS.txt` as release assets. Before the first release was published, the public latest-release endpoint returned HTTP 404 because no releases existed. Download the stable packages from [GitHub Releases](https://github.com/ManhLD-LDM/CVAT_Tool/releases/latest). Host protocol, UI and save guards are fixture-tested; actual managed installation/native browser registration still needs a live acceptance check.

## Batch Apply verification — 1.14.7

Batch now shows counts of protected anchors and editable proposals, with an explicit explanation when nothing can be applied. Apply confirmation appears inside the Batch dialog and can be cancelled without editing annotations. The backend rejects incomplete computed ranges and discards frame analysis from superseded computations. Every native save is checked against the resulting keyframe's geometry; a no-op or mismatched save stops the remaining plan and reports any frames already changed. This remains sequential, not atomic, with native Undo per changed frame. Dimensions/yaw and original keyframes remain protected; the position refinement algorithm is unchanged.

Offline audit of the supplied job 1224 JSON found 78 tracks and 3,356 visible keyframes across 60 frames, with no visible interpolated frames eligible for automatic refinement. Existing keyframes are deliberately not overwritten. JSON replay verifies annotation invariants; simulated sparse anchors/proposals exercise Apply and Undo but do not establish LiDAR fit accuracy or live native Undo. See [audit evidence](docs/verification/batch-json-1224-1.14.7.md).

## Native geometry confirmation - 1.14.6

Native edits now compare the nine physical cuboid fields numerically, accepting equivalent wrapped Euler angles and 9/16-field padding differences. Coordinate tolerance is 0.1 mm and angle tolerance is 1e-5 rad; real mismatches still surface an error without claiming rollback after native commit. This changes confirmation only, not fitting or tracking algorithms.

## Batch Track Review — 1.14.5

Compute an inclusive range of up to 60 frames (for example 24–83). Frames are read sequentially; only two full point clouds are cached. All sampled previews are retained and shown seven per page. Pagination does not recompute or clear accepted proposals. Cancel compute stops after the current frame and disables Apply until a full recompute succeeds.

Apply collects reviewed selections across all pages (up to 60), preflights the entire plan, then writes one native edit per frame, yielding between groups of 20. Errors stop remaining edits and report applied frames; this is not an atomic transaction. Applied frames become native keyframes, each with Undo; Save CVAT to persist. Reopen the preview after applying or editing a track.

Position refinement, ground confidence thresholds, dimensions/yaw preservation, neighbor filtering and anchor protection are unchanged. This does not add sensor-motion compensation or semantic tracking.

## Selectable ground base — 1.14.4

The **Use origin ground (Z = 0 + offset)** checkbox is available below Auto Adjust Box and is **checked by default**. Ground Snap, Move to mouse, Auto Adjust and Auto-Fit therefore use the coordinate-origin plane by default:

- **Checked:** use the coordinate-origin plane plus **Origin ground offset (m)**, default 0 (Z = 0). Detected surfaces cannot override this explicit selection. Ground Snap can work without a loaded cloud in this mode. Existing settings migrate to this default; the preference is saved if you intentionally uncheck it.
- **Unchecked:** use measured surrounding road, including road below Z = 0. The origin offset is ignored. Missing/uncertain local ground cannot silently become the origin plane.

The mode and signed offset persist. The HUD names the selected base; measured ground remains separate for QC. Object centering, direction/face alignment, native Undo and existing large-Z safeguards are preserved. Auto Adjust and Auto-Fit still need object points. Local ground is rechecked at the final footprint after fitting/refinement.

The preference still allows measured-road grounding when intentionally unchecked. The experimental per-frame road-height estimator remains removed.

## Ground fallback and directional placement — 1.14.1

- **Historical behavior in 1.14.1 (superseded by the selectable ground modes above):** enable **Use origin ground height when local ground is unavailable** to let Ground Snap and Move to mouse use **Fallback ground height (m)**. The default is Z = 0; signed offsets are supported. Local measured ground always takes precedence. Fallback is off by default and does not count as measured ground for QC. Existing 1.5 m adjustment safeguards still apply.
- Move to mouse has independent **Longitudinal** (None / Push forward / Push backward) and **Lateral** (None / Push left / Push right) selectors. Both default to None and persist with your settings.
- Directions follow the final box heading (+X forward, +Y left). Forward aligns the rear face to the rearmost detected object points; backward aligns the front face; left aligns the right face; right aligns the left face. Dimensions stay fixed. This uses the selected cluster’s robust bounds, so isolated outliers do not define contact.
- Placement centers on the selected object, optionally adjusts yaw, aligns selected faces, then checks ground at the final footprint. An oversized span skips that axis; ambiguous or sparse clusters skip alignment. Results explain fallback and skipped adjustments. The whole edit is one native Undo entry; Save CVAT to persist it to the server.


Bộ công cụ toàn diện hỗ trợ gán nhãn 3D LiDAR Bounding Box trên nền tảng **CVAT (Computer Vision Annotation Tool)** dành cho xe tự hành (Autonomous Vehicles / ADAS).

Dự án tích hợp 2 hệ thống phối hợp đồng bộ:
1. **Chrome/Edge Browser Extension (`extension/`)**: Copilot trực tiếp trên WebGL 3D canvas của CVAT (Auto-Fit Box, Ground Snap, Quick Yaw 90°/180°, Auto QC, Focus Camera, Batch Track Review, Preset Fitting, và **Export/Import Annotations trực tiếp trên giao diện**). Hỗ trợ nhận diện vạn năng trên **mọi domain, IP, đường dẫn URL của CVAT (`<all_urls>`)** và **1-Click Reload tức thì**.
2. **Python Automation & Tracking Suite (`scripts/`)**: Pipeline xử lý đám mây điểm LiDAR (.pcd), tracking 3D bounding box theo vận tốc/quán tính, chuẩn hóa keyframe và **công cụ `cvat_io.py` hỗ trợ Export / Import dữ liệu trực tiếp theo Link CVAT của VinFast**.

---

## 📌 Hướng dẫn cho Codex / AI Coding Agents

> [!IMPORTANT]
> **Dành cho Codex / AI Agents khi đọc và phát triển codebase này:**
> Đọc kỹ các quy tắc kiến trúc dưới đây trước khi viết hoặc sửa bất kỳ mã nguồn nào. Việc vi phạm các quy tắc về **Keyframe locking** hoặc **Z-ground clamp** sẽ phá hủy hoàn toàn chuyển động nội suy 3D của CVAT.

### 1. Sự cố Khóa cứng Keyframe (Keyframe Over-Saturation Bug) & Cách khắc phục
* **Hiện tượng**: Khi chạy pipeline prelabeling hoặc tracker tự động trên đoạn frame (ví dụ: frame 20–29), việc ghi shape lên **tất cả** các frame liên tiếp sẽ biến mọi frame thành hard keyframe. Khi annotator sửa frame 23 và 29, các frame trung gian (24–28) không tự nội suy, dẫn đến việc box bị giật cục dữ dội.
* **Nguyên nhân trong Data Model của CVAT 3D**: Trong cấu trúc JSON của CVAT, **mọi shape nằm trong mảng `track["shapes"]` đều được CVAT coi là một hard keyframe**. CVAT chỉ tự động nội suy tuyến tính (Linear Interpolation) giữa 2 keyframe nếu các frame trung gian **không có shape**.
* **Giải pháp chuẩn hóa (`clean_keyframes_pipeline.py`)**:
  - Loại bỏ toàn bộ các shape thừa ở frame trung gian. Chỉ lưu giữ các keyframe thực sự (ví dụ: `[0, 5, 8, 9, 10, 15, 16, 19, 23, 29]`).
  - Khi đó, CVAT tự động nội suy mượt mà 100%.

### 2. Khóa cao độ mặt đường (Ground Z-Elevation Clamp / Chống văng Box)
* **Hiện tượng**: Điểm LiDAR từ nóc xe hoặc nhiễu tầm xa kéo tâm Z lên cao dần, khiến xe bị văng lên không trung.
* **Giải pháp**: Tâm Z của xe chỉ được phép dao động tối đa $\pm 0.15\text{ m}$ so với cao độ ban đầu tại mặt đất:
  ```python
  curr_center[2] = np.clip(curr_center[2], z_start - 0.15, z_start + 0.15)
  curr_vel[2] = 0.0  # Vận tốc thẳng đứng bị triệt tiêu
  ```

### 3. Nhận diện CVAT vạn năng (Universal URL Recognition) & Export/Import theo Link VinFast (v1.14.1)
* Extension thiết lập quyền `<all_urls>` và tự động nhận diện trang CVAT thông qua cấu trúc URL (`/jobs/\d+`, `/tasks/\d+`) và DOM signature (`#cvat-app`, `.cvat-canvas-container`). Hoạt động tức thì trên **mọi link, mọi domain, IP nội bộ** của VinFast.
* **Export / Import trực tiếp trên HUD**: Nút **⬇ Export Annotations** và **⬆ Import Annotations** giúp annotator sao lưu và nạp nhãn mồi ngay trong tab CVAT mà không cần rời trình duyệt.
* **CLI Python `cvat_io.py`**:
  ```powershell
  # Export:
  python scripts/cvat_io.py export "https://cvat-test.vantixapps.net/tasks/12/jobs/58" --output backup.json
  # Import kèm khử khóa cứng keyframe:
  python scripts/cvat_io.py import "https://cvat-test.vantixapps.net/tasks/12/jobs/58" --file my_boxes.json --clean
  ```

---

## 🛠️ Cài đặt & Hướng dẫn Cập nhật Extension

### 1. Cài đặt vào Chrome / Edge
1. Mở trình duyệt, truy cập `chrome://extensions/` hoặc `edge://extensions/`.
2. Bật chế độ **Developer mode** (Góc trên cùng bên phải).
3. Nhấn **Load unpacked** và chọn thư mục:
   Thư mục `extension` trong bản source hoặc gói extension đã giải nén. Muốn tự cập nhật GitHub thì dùng thư mục cài riêng theo `updater/README.md`.
4. Mở tab CVAT 3D job bất kỳ. Menu tiện ích **CVAT 3D TOOL** sẽ xuất hiện ở góc phải màn hình.

### 💡 Cách Cập Nhật Extension Cực Nhanh (Không Cần Xóa / Tải Lại):
> [!TIP]
> **Annotator tuyệt đối không cần xóa extension và load lại mỗi khi có bản cập nhật mới!**
> 1. **Ngay trong CVAT**: Bấm **Reload** để kiểm tra release. Có bản mới thì chọn **Cập nhật** (cần updater Windows); nếu không, tool lưu CVAT rồi nạp lại bản trên máy. Khi GitHub không truy cập được, có thể chọn **Reload bản hiện tại**.
> 2. **Trang Extensions**: Nút Reload của trình duyệt chỉ nạp mã từ ổ đĩa và không đi qua cơ chế lưu của tool. Hãy Save CVAT trước khi dùng.
> 3. **Dành cho developer**: Tự cập nhật source bằng Git, build lại bundle rồi dùng HUD Reload. Updater Windows không thay đổi source checkout.

---

## Batch Track Review — workflow (updated 1.14.5)

Bản đầu của quy trình chỉnh cùng một vật thể qua nhiều frame, lấy cảm hứng workflow SUSTechPOINTS và tự triển khai tích hợp CVAT. Chưa phải tracker có bù chuyển động cảm biến.

1. Chọn một **CUBOID TRACK** trong CVAT → **Batch Track Review**. Shape độc lập và demo 61 box hiện tại không hỗ trợ batch.
2. Tool đọc track từ native editor (gồm cả chỉnh sửa chưa Save), đọc PCD của các frame bằng job.frames.get().data(), hiển thị 7 frame/lượt với Top/Side/Front đồng nhất tỷ lệ trong từng card.
3. Box cam là geometry hiện tại, xanh là đề xuất vị trí. Tool giữ nguyên kích thước, yaw, roll/pitch; tinh chỉnh chỉ hỗ trợ upright box. Nếu ground đủ tin cậy có thể điều chỉnh Z, nếu không thì giữ Z.
4. Keyframe native hiện có (ví dụ 0,7,14) luôn được bảo vệ. **Protect this frame** chỉ bảo vệ thêm trong phiên batch hiện tại; đóng/mở lại sẽ không giữ bảo vệ tạm này.
5. Chỉ đề xuất frame nằm giữa hai keyframe có vật thể hiện diện. Không tự suy ra tracking từ sau keyframe cuối hoặc qua outside/che khuất. Point support, mức dịch chuyển và độ lớn cụm được kiểm tra để chặn đề xuất không hợp lý; đây là chỉ báo hình học, không phải xác suất tracker đúng.
6. Tick **Accept this proposal** cho frame đã xem, rồi **Apply selected position proposals**. Compute tối đa 60 frame tính cả hai đầu; lựa chọn được giữ khi chuyển trang. Apply nhận lựa chọn từ mọi trang và ghi tuần tự, nhường UI sau mỗi nhóm 20 frame. Chỉ ghi các frame được chọn; giữ nguyên track ID, keyframe gốc và frame bảo vệ. Mỗi frame là một native Undo entry; không có Undo gộp toàn batch.
7. **Open in CVAT** chuyển tới đúng frame/track rồi đóng preview chưa áp dụng. Chỉnh tay một mốc trong CVAT, mở lại batch để tính theo mốc mới.
8. **Export preview (.json)** xuất baseline, đề xuất và ROI đã lấy mẫu của toàn khoảng đã Compute để chẩn đoán. Không phải định dạng import annotation hoặc full raw point-cloud sequence.

Preview không ghi annotation. Apply dùng ObjectState.save và cập nhật editor/history, không REST PATCH hay tự Save server. Track đổi trong lúc preview sẽ bị chặn; workspace review/đang vẽ/box khóa cũng bị chặn khi apply. Lỗi giữa chừng trả danh sách frame đã ghi; kiểm tra Undo/history trước khi thử lại, không tự rollback giả. Sau apply phải đóng/mở lại preview.

Chỉ cache hai cloud trong bộ xử lý batch; mỗi PCD tối đa 128 MiB. ROI hiển thị tối đa 4.000 điểm/frame, thuật toán phân tích ROI chưa lấy mẫu. Nạp frame đầu có thể chậm vì native tải/giải nén chunk. Chưa có worker nền, ego-motion/pose registration, forward/backward tracking, AI tracker hay temporal QC đầy đủ. Không coi box đủ điểm hoặc ít lỗi QC là ground truth.

Pilot cho job601: giữ anchors0/7/14, xem #1/#2/#5 ở các frame3/4/10/11, chỉ chấp nhận sau kiểm tra Top/Side/Front. Chưa chạy apply batch trên job thật trong đợt phát triển này.
[Thiết kế và phần còn lại](docs/BATCH_TRACK_REFINEMENT_PROPOSAL.md) · [Bằng chứng kiểm thử](docs/verification/batch-1.8.0.md).

## Python Import/Export — 1.12.0

Trang **Phiên CVAT & Import/Export** có nút tải CLI Python và copy lệnh đúng server/job. Python 3.10+, không cần pip, chạy thủ công trong terminal. Export ZIP 3D hoặc JSON native; import ZIP và restore JSON native cùng server/job. Mọi import CLI yêu cầu xác nhận job/đóng editor và tạo, kiểm tra bản native JSON dự phòng trước khi ghi. Không tự nhúng cookie vào script/lệnh, không thay đổi quyền tài khoản. [Hướng dẫn đầy đủ](docs/PYTHON_ANNOTATIONS_CLI.md).

## Phiên CVAT và Import/Export — 1.7.0

Bấm **Phiên CVAT & Import/Export** trên HUD để mở trang riêng của extension. Không hoạt động trong demo. Extension cần thêm quyền cookies và downloads; trình duyệt có thể yêu cầu chấp nhận quyền mới khi cập nhật.

- **Lấy thông tin phiên:** kiểm tra người dùng bằng API users/self, chỉ đọc cookie sessionid/CSRF khi bấm nút. Giá trị mặc định che; có nút hiện/copy/xóa. Cookie HttpOnly được đọc bằng service worker, chỉ trả về trang extension, không chuyển qua bridge CustomEvent hay DOM của CVAT. Rời tab sẽ xóa giá trị hiển thị; không lưu vào storage/log/file chẩn đoán. Cookie đã copy vẫn có thể còn trong clipboard.
- **Copy mẫu Python:** dùng biến môi trường CVAT_SESSIONID/CVAT_CSRFTOKEN, URL server và job hiện tại; không nhúng cookie thật. Mẫu kiểm tra đăng nhập và ghi chú endpoint import/export, chưa là CLI import/export đầy đủ.
- **Export ZIP 3D:** đọc và lọc định dạng 3D được bật trên server, ưu tiên Datumaro 3D 1.0. POST dataset/export với save_images=false → theo dõi rq_id → tải result_url. Không kèm PCD/ảnh. Không cần đọc sessionID trước. Kiểm tra signature ZIP và báo lỗi quyền rõ ràng. Trên tài khoản kiểm thử job601, native export bị từ chối quyền; owner/admin cần kiểm tra quyền nếu muốn ZIP dataset.
- **Export JSON native — 1.16.0:** đọc native editor (gồm chưa Save), giữ cả clientID hiển thị và ID database. Dùng Import JSON trên HUD để chọn ID Replace/Add. Không phải ZIP dataset và không kèm PCD.
- **Import ZIP dataset (khác JSON HUD):** chọn file/định dạng, nhập job ID và xác nhận tác động. Tool export bản dự phòng theo định dạng export đã chọn và chờ download hoàn tất trước khi upload. Import có thể thay thế annotation server, không có Undo native. File và download tối đa **8 MiB**; dữ liệu lớn hơn dùng giao diện native CVAT. Save editor trước khi bắt đầu.
- Sau import, bấm **Nạp lại tab CVAT** trước khi tiếp tục sửa. Không Save editor cũ. Bản này dùng reload có chủ đích để đồng bộ dữ liệu import; Auto-Fit/QC và các thao tác box vẫn cập nhật realtime.
- Khi đã gửi import, transport chặn import/export mới đến khi tab CVAT reload. Nếu timeout/đóng trang, tác vụ server có thể vẫn chạy: kiểm tra Requests trước khi thử lại.
- Chỉ làm việc với tab/job đã mở; đổi server/job sẽ chặn thao tác. Phiên adapter nội bộ không phải sessionid đăng nhập. SSO/token-only hoặc cookie có tên tùy biến chưa có chức năng copy tương ứng; API vẫn dùng cookie phiên trình duyệt nếu server hỗ trợ.
- API chỉ gọi các endpoint giới hạn qua runtime message trong isolated world, cùng origin CVAT, credentials include và CSRF cookie. Không dùng cookie đọc ra để gắn Cookie header thủ công.

Đối chiếu API: [mã nguồn CVAT 2.76](https://github.com/cvat-ai/cvat/blob/v2.76.0/cvat/apps/engine/views.py), [Jobs API](https://docs.cvat.ai/docs/api_sdk/sdk/reference/apis/jobs-api/). Import/export dùng POST và theo dõi GET /api/requests/{rq_id}. Luồng extension đã kiểm thử bằng mock server/Chrome API. Trên server thật job601, đọc native annotation thành công nhưng ZIP export bị từ chối quyền; chưa xác nhận click-to-file trong extension và chưa chạy import ghi dữ liệu thật. [Audit export 1.11.1](docs/verification/export-1.11.1.md). Chưa chứng nhận compatibility cho mọi deployment/SSO/cấu hình CSRF.

## Class và subtype hiện tại

Theo cấu hình công việc thực tế, **vehicles hiện hỗ trợ nhiều loại xe theo subtype**, không còn giới hạn toàn bộ class ở xe gia đình như bản 1.5.0.

Adapter đọc attributes từ ObjectState, ánh xạ ID attribute sang tên của label. Subtype ưu tiên từ `type`, `vehicle_type`, `subtype`, `sub_type`, `category`; nếu không có, thử tìm giá trị subtype đã biết trong các attributes khác. Giá trị được trim và chuyển chữ thường.

QC giải quyết khoảng min/max theo class + subtype; Auto-Fit 1.11.0 dùng bộ kích thước preset riêng. QC dùng profile xe gia đình nếu thiếu subtype hoặc subtype không nhận biết. Auto-Fit dùng preset car khi không có subtype; subtype lạ hoặc other phải được cấu hình preset trước. Tool **không tự suy subtype từ LiDAR**. Chọn đúng attribute trong CVAT trước khi Auto-Fit; panel chỉ hiển thị subtype, chưa có bộ chọn subtype riêng.

Các khoảng dưới đây là cấu hình tham khảo của tool, đơn vị mét; không phải tiêu chuẩn được chứng nhận:

| Subtype của vehicles | Dài | Rộng | Cao |
|---|---:|---:|---:|
| `car` | 2.8–5.8 | 1.4–2.3 | 1.1–2.2 |
| `truck` | 5–14 | 1.9–3 | 2–4.2 |
| `bus` | 6.5–15 | 2.2–3.2 | 2.6–4.2 |
| `van` | 4.2–6.5 | 1.7–2.4 | 1.8–2.8 |
| `pickup` | 4.5–6.5 | 1.7–2.3 | 1.6–2.4 |
| `construction` | 3.5–12 | 2–3.5 | 1.8–4.5 |
| `trailer` | 4–16 | 1.9–3 | 1.5–4.5 |
| `tricycle` | 1.8–3.8 | 0.9–1.8 | 1.1–2.2 |
| `stroller` | 0.6–1.4 | 0.4–0.9 | 0.7–1.4 |
| `wheelchair` | 0.7–1.6 | 0.5–1.1 | 0.7–1.5 |
| `other` | 1.5–15 | 0.8–3.5 | 0.8–4.5 |

Chấp nhận cả `construction` và cách viết `contruction` để tương thích dữ liệu hiện có. Các khóa Trailer/Tricycle/Stroller/Wheelchair có alias khác kiểu chữ. Resolver cũng chấp nhận nhãn `vehicle`, `car`, `cars` và khóa trực tiếp như `vehicles:bus`.

| Class khác | Dài | Rộng | Cao |
|---|---:|---:|---:|
| `two-wheels` | 1.4–2.6 | 0.5–1.3 | 0.9–1.9 |
| `pedestrian` | 0.3–1 | 0.3–1 | 1.3–2.1 |
| `Animal` | 0.4–2.5 | 0.3–1.2 | 0.3–1.8 |
| `Obstacle` | 0.2–5 | 0.2–5 | 0.2–5 |

Alias được nhận biết: bicycle/motorcycle/cyclist/two_wheels → two-wheels; person → pedestrian; animal và obstacle được đối chiếu không phân biệt chữ hoa/thường. Khi fit class có tên chính xác `two-wheels`, chiều rộng tối thiểu là 0,6 m; profile QC cơ sở vẫn có min width 0,5 m. Class chưa có profile sẽ không được Auto-Fit.

## Auto Adjust Box — 1.10.0

Select a box and click **Auto Adjust Box**, or press **Alt+Shift+B** (remappable in Keyboard shortcuts). This cleans up nearby sides and the top while preserving direction and ground contact.

- Expand supported faces to catch nearby missed object points, within a 0.4 m local search/correction range and with 3 cm padding.
- **Near-ground exclusion (1.10.1):** ignore points at or below 20 cm above the local ground plane before clustering or measuring faces. The clearance increases to three times the plane RMSE when larger. It follows the slope at each point; raw ground points remain available for ground estimation and bottom contact. If only low returns remain, leave the box unchanged. See [ground exclusion verification](docs/verification/ground-exclusion-1.10.1.md).
- Configure inward shrink limits under **Settings & shortcuts → Auto Adjust Box**. Defaults are **10 cm and 5% of that dimension**; the smaller limit applies to each face. Distance accepts 0–40 cm and percentage accepts 0–50%. Either value at zero disables shrinking. Settings persist across jobs and restarts; **Reset shrink limits** restores defaults. Shrink only when a supported surface is already within this limit from the current face. Keep distant faces unchanged; do not take small steps toward faraway returns. Repeated actions therefore preserve an occluded rear rather than progressively cutting it off.
- Side shrinking also requires vertical surface support; top shrinking requires a supported XY patch. Roof-only evidence does not justify bringing in side faces. Ground, isolated noise, and neighboring annotation points are excluded.
- Keep heading fixed, including when Move to mouse's Adjust direction is enabled. Keep the bottom on reliable ground. Weak ground, empty/ambiguous object evidence, tilted boxes, or unsuitable final ground leave the box unchanged.
- Apply at most one native edit to the current frame, with normal Undo/Redo. A no-op does not create a keyframe/history entry. Save through CVAT as usual.

This is local cleanup of the existing box; class dimension profiles do not force it toward preset minimum sizes. The original Auto-Fit remains available for a broader refit. Inspect the resulting annotation. See [Auto Adjust verification](docs/verification/auto-adjust-1.10.0.md).

## Auto-Fit

### New in 1.9.0: direction, placement, and shortcuts

- **Keep direction**, beside Auto-Fit, resizes and recenters using the current heading. It starts unchecked and remembers your choice. Auto-Fit requires an upright box.
- **Move to mouse — Alt+Shift+M:** select a box, hover roughly near the intended object in the native **top view**, then press the shortcut. In 1.9.1 the tool searches nearby LiDAR clusters and refines the box center from the closest suitable object. Dimensions stay unchanged; rotation stays unchanged unless **Adjust direction** is enabled. Sparse, ambiguous, oversized, or already annotated evidence keeps the raw mouse placement with a warning. Ground is estimated at the final footprint; unsuitable ground or a Z correction over 1.5 m leaves Z unchanged and shows a warning. The panel button explains the gesture; placement itself requires the shortcut while hovering the canvas.
- **Adjust direction**, beside Move to mouse (1.9.2), aligns the box's longest horizontal axis with the nearby object's longest horizontal axis, choosing the closest forward/backward facing. It permits at most **30°** correction, preserves dimensions and roll/pitch, then recenters and checks ground at the final orientation. Sparse, symmetric, or unstable axes and corrections over 30° retain the current direction with a warning. The checkbox starts unchecked and remembers its setting independently of Auto-Fit's Keep direction.
- Each placement uses CVAT's native save/history path for the current frame. A track edit follows native keyframe/interpolation behavior. Use normal Undo/Redo and **Save CVAT**.
- **Keyboard shortcuts** records single keys or modifier combinations for tool actions. Clear a binding, reset one, or reset all shortcuts. Escape cancels recording. Duplicate tool bindings are rejected. Browser-reserved combinations may not arrive, and CVAT shortcuts can conflict. Free Cam movement keys remain WASD/QE.
- Settings are stored in `chrome.storage.local` across jobs and browser restarts. The offline demo uses local browser storage and supports direction settings; it has no native top-view placement action.

Automated geometry/adapter/browser verification is recorded in [1.9.0 verification](docs/verification/placement-shortcuts-1.9.0.md). Live top-view and track verification requires an authenticated CVAT session.

The 1.9.1 center-refinement update is covered separately in [mouse refinement verification](docs/verification/mouse-refinement-1.9.1.md).

The optional long-axis direction correction is covered in [1.9.2 verification](docs/verification/mouse-direction-1.9.2.md).

### Preset Auto-Fit — 1.11.0

Chọn/tạo box sơ bộ → kiểm tra class và subtype → chỉnh **Auto-Fit preset (metres)** nếu cần → **Save preset** → **Alt+Shift+A**. Kích thước L × W × H đầu ra đúng bằng preset, không suy ra từ độ lớn cụm LiDAR và không bị ép bởi khoảng QC. Preset được lưu theo class/subtype trong chrome.storage.local (demo dùng localStorage), áp dụng giữa các job trên trình duyệt này. Chỉnh input chưa Save không thay đổi preset; Reset chỉ khôi phục preset của class/subtype đang chọn.

Các giá trị khởi điểm sau chỉ để thử và cần team duyệt. Một preset car không thể ôm khít đồng thời mọi sedan/SUV/MPV. Các subtype quá đa dạng như other không có preset mặc định; nhập và lưu kích thước trước khi dùng.

| Preset | L × W × H (m) |
|---|---|
| `vehicles:car` | 4.5 × 1.8 × 1.5 |
| `vehicles:truck` | 8 × 2.5 × 3.2 |
| `vehicles:bus` | 10 × 2.6 × 3.2 |
| `vehicles:van` | 5 × 2 × 2.2 |
| `vehicles:pickup` | 5.3 × 1.9 × 1.8 |
| `vehicles:construction` | 6 × 2.5 × 3 |
| `vehicles:trailer` | 10 × 2.5 × 3 |
| `vehicles:tricycle` | 2.5 × 1.2 × 1.6 |
| `vehicles:stroller` | 1 × 0.6 × 1 |
| `vehicles:wheelchair` | 1.1 × 0.7 × 1.2 |
| `two-wheels` | 2 × 0.7 × 1.6 |
| `pedestrian` | 0.6 × 0.6 × 1.7 |
| `Animal` | 1.2 × 0.6 × 0.8 |
| `Obstacle` | 1 × 1 × 1 |

1. Đọc THREE.Points của frame và ground cục bộ độc lập với đáy box hiện tại. Box nhỏ/bay cao vẫn dùng kích thước preset để tìm vùng hỗ trợ.
2. LiDAR chỉ phục vụ căn tâm XY và trục dọc/ngang. Lọc ground, loại vùng sâu trong box lân cận (giữ điểm thuộc seed), tách cụm 3D trên voxel 0,12 m. Thử radius 0,45 / 0,3 / 0,25 / 0,2 m; sau khi giảm radius, yêu cầu hai kết quả liên tiếp có IoU ≥0,9.
3. Dùng trục dài trên occupancy XY cân bằng mật độ, kết hợp mặt đứng cho xe ô tô nếu hai hướng đồng thuận. Xe máy dùng trục dài XY để hạn chế ảnh hưởng mật độ điểm người lái. Không nhận diện đầu/đuôi: chọn hướng trước/sau gần yaw hiện tại. Keep direction giữ yaw chính xác; hướng không rõ cũng giữ yaw và báo cảnh báo.
4. Nếu thiếu một phần vật thể, không dùng trung bình điểm làm tâm xe: giữ tâm sơ bộ khi nó vẫn bao phủ phần quan sát được, chỉ dịch khi cần. Báo cảnh báo tâm chưa chắc chắn. Cụm lẫn vật thể, vượt footprint preset, mơ hồ hoặc không đủ điểm bị từ chối.
5. L/W/H không thay đổi theo điểm. Ground phải hợp lệ, confidence ≥0,65; kiểm tra lại ground dưới footprint cuối rồi đặt đáy tại điểm cao nhất của mặt phẳng dưới bốn góc. Hai ground lệch trên 0,35 m hoặc ground cuối không đủ tin cậy thì giữ nguyên box, không fallback fit XY với box lơ lửng.
6. Ghi một native ObjectState.save, hỗ trợ Undo/Redo, realtime; Save CVAT để lưu server. Không REST PATCH annotation. Auto Adjust vẫn là thao tác riêng và có thể thay đổi kích thước sau Auto-Fit.

Điểm thưa/che khuất vẫn có thể làm sai tâm hoặc hướng. Preset giải quyết sự nhất quán kích thước, không xác nhận đúng vật thể hay thay thế kiểm tra Top/Side/Front. Hàm fit theo extents cũ vẫn giữ cho regression nội bộ; nút Auto-Fit trong live/demo đã chuyển sang preset.

### Xuất ca thực tế

Sau Auto-Fit, chỉnh tay chính box đó làm mẫu nếu cần, rồi bấm **Export Auto-Fit Case (.json)** trước khi đổi frame hoặc chạy fit khác. Nếu fit thất bại sau khi bắt đầu phân tích, có thể xuất phần dữ liệu đã thu được để chẩn đoán.

JSON gồm seed/fit/current box, subtype/attributes, ROI, ground support, cluster và dữ liệu lựa chọn đã có. Bản hiện tại bổ sung neighborBoxes và các radius đã thử khi lựa chọn thành công. Box hiện tại chỉ là mẫu người dùng cung cấp, không tự được chứng nhận ground truth.

Chỉ giữ ca fit gần nhất trong frame hiện tại; refresh làm mất dữ liệu. File tải về máy, không tự gửi ra ngoài. Chức năng xuất dành cho live editor.

## Ground Snap, quay và Free Cam

- **Ground Snap — Alt+Shift+G:** dịch Z để box chạm mặt phẳng ground; giữ kích thước và góc xoay. Mặt phẳng phải hợp lệ, slope ≤0,25; confidence ≥0,65 hoặc confidence ≥0,45 kèm RMSE ≤0,04 m và ít nhất 60 inliers. UI ghi ground ước lượng khi confidence thấp. Điều kiện thủ công này khác ngưỡng Auto-Fit tự snap.
- Sau preset Auto-Fit, cache mặt phẳng đã được kiểm tra dưới footprint cuối để Ground Snap tiếp tục sử dụng. Cache mất hiệu lực khi đổi frame/cloud. Live Snap mặc định chặn |ΔZ| >1,5 m.
- **Quay:** Alt+Shift+[ / ] cho −90° / +90°; Alt+Shift+F cho 180°. Sửa yaw qua native save/history.
- **Free Cam — Alt+Shift+C:** WASD/QE, Shift tăng tốc, chuột phải để nhìn; Esc trả orbit. Focus box kết thúc Free Cam.

Tool không cho sửa box khóa, ground truth, workspace review, hoặc khi đang vẽ/kéo. Reference job/frame/revision cũ bị từ chối.

## QC, chọn lỗi và Focus camera

**Alt+Shift+L** chạy QC; chế độ tự cập nhật dùng debounce 140 ms. QC kiểm tra min/max kích thước theo class/subtype, hình học, ground và oriented IoU; hiển thị lý do/mức lỗi và đổi màu theo clientID. Màu QC chỉ thay hiển thị, không sửa màu label task.

- Chọn box trong CVAT/tool: danh sách chỉ hiện lỗi liên quan box đó. Bỏ chọn: hiện lỗi toàn frame.
- Nhấn một dòng lỗi: chọn đúng clientID trong CVAT, đưa camera perspective tới box, chuyển filter mức lỗi về **Tất cả**. Box có ba lỗi vẫn hiện cả ba lỗi.
- Lỗi overlap có nút chọn/Focus box thứ hai; danh sách chuyển theo box được chọn.
- Camera giữ hướng nhìn, đổi tâm và khoảng cách theo kích thước/FOV; hiện chuyển ngay, chưa có animation. Không ghi annotation hoặc thêm history khi chọn/Focus.
- Không truy cập được camera: vẫn chọn box và báo không Focus được. Chọn trực tiếp box vẫn tôn trọng filter mức lỗi hiện tại.

[Thiết kế chọn lỗi và Focus](docs/QC_ISSUE_FOCUS_DESIGN.md). QC là kiểm tra hình học tham khảo, không tự xác nhận class đúng với vật thể. Overlap hỗ trợ upright cuboid có yaw; roll/pitch chưa được hỗ trợ trong phép IoU.

## Build và kiểm thử

Node 24+, cài dependency bằng `pnpm install`. Browser test dùng Edge headless với profile riêng, truy cập demo cục bộ.

```powershell
node --test tests/*.test.cjs
node scripts/build-extension.cjs
node scripts/build-demo.cjs
node node_modules/@playwright/test/cli.js test
```

Chạy demo bằng `node scripts/demo-server.cjs`. Đóng gói bằng `scripts/package-extension.ps1` trong PowerShell có quyền chạy script. Build extension tạo bundle MAIN và ISOLATED riêng, mỗi bundle chứa geometry để tránh lỗi dependency nạp thiếu. Build demo tạo HTML standalone, bundle Three.js và license trong dist.

**Kiểm tra bản 1.12.0:** 105 Node unit test, 11 Python test với HTTP server local, 29 browser test pass. Chưa chạy import bằng CLI lên CVAT thật. [Bằng chứng CLI](docs/verification/python-cli-1.12.0.md).

**Kiểm tra bản 1.11.1 (lịch sử):** 105/105 unit test và 28/28 browser test pass (mock runtime/downloads). [Giới hạn kiểm chứng live export](docs/verification/export-1.11.1.md).

**Kiểm tra bản 1.11.0 (lịch sử):** 101/101 unit test và 26/26 browser test pass trên bản đã build cuối; ZIP 19 file khớp source. Chưa nghiệm thu Auto-Fit trên CVAT thật. [Báo cáo preset Auto-Fit](docs/verification/preset-fit-1.11.0.md).

**Kiểm tra bản 1.8.0 (lịch sử):** 64 unit test và17 browser test khác nhau pass (full suite16 và kiểm tra lại5 batch tests sau bổ sung test phím tắt). Bằng chứng tại docs/verification/batch-1.8.0-tests.json. Chưa chạy batch trên CVAT thật.

**Kiểm tra bản 1.6.0 ngày 15/10/2026 (lịch sử):** 49/49 unit test, 8/8 browser test pass; ZIP 1.6.0 khớp source, standalone chứa đúng source hiện tại. Có test subtype từ attributes và fit profile bus/truck, native selection/history mock, Ground Snap sau fit, camera framing, danh sách nhiều lỗi và ROI thật. Chưa nghiệm thu thao tác chọn/sửa/Save/reload trên tab CVAT thật; pass test không bảo đảm Auto-Fit đúng với mọi point cloud.

[Báo cáo audit](docs/verification/tool-audit-2026-10-15.md) ghi nhận trạng thái trước cập nhật tài liệu: phần nhận xét subtype lệch yêu cầu cũ đã được người dùng xác nhận là thay đổi có chủ đích theo công việc thực tế; README này mô tả hành vi hiện hành.

## Bằng chứng và lịch sử

Các báo cáo cũ mô tả thuật toán/profile tại thời điểm tạo, không thay thế cấu hình class/subtype hiện tại:

- [Box32 — xe gần nhau, 1.5.1](docs/verification/autofit-parking-1.5.1.json): 7.283 → 4.304 điểm, box khoảng 4,60 × 1,78 × 1,81 m; chưa có mẫu tay để nghiệm thu.
- [Box17 — ground yếu, 1.4.2](docs/verification/autofit-truck-1.4.2.json): replay giữ Z/H, IoU với mẫu tay 0,862.
- [Box62 — replay 1.4.0](docs/verification/autofit-real-case-1.4.0.json), [Top/Side/Front](docs/verification/autofit-real-case-1.4.0.png): IoU khoảng 0,802; export cũ không có toàn frame raw.
- [Hướng dẫn demo](docs/DEMO_GUIDE.md), [kế hoạch dài hạn](docs/REALTIME_IMPLEMENTATION_PLAN.md).
- [Kiểm chứng README cũ](docs/README_VERIFICATION.md), [README gốc](docs/verification/README.before-verification.md).

Demo dùng dữ liệu mô phỏng; cache Job 9426 có 61 box trong khi lần kiểm tra API/UI lịch sử có 62. Số issue của engine cũ không đại diện cho kết quả QC hiện tại.

## Follow selected object (1.12.0)

Enable **Follow selected object** beside the selected-box controls to keep the perspective orbit centered on the last selected **track** when navigating forward, backward, or jumping frames. Your current orbit angle and distance are preserved; manual rotation and zoom are remembered for the next frame. The checkbox starts unchecked and persists across jobs and browser restarts.

Follow waits for the new frame canvas and rendered track geometry. It pauses for hidden/outside/missing tracks, Free Cam, and canvas interactions; the status beneath the checkbox explains why. Select another track to change the target; selecting a frame-local shape releases it. A job change drops the previous target. Hidden or absent tracks resume when available again. This changes only the perspective camera, creates no annotation edit or keyframe, and requires accessible orbit APIs. The fixed-frame offline demo does not expose this option.

### Free Cam across frames (1.12.1)

Free Cam stays enabled on next/previous/jumped frames within the same job and keeps its world position, viewing direction, and camera zoom through native scene resets or replacement cameras. Frame changes clear held movement/look input; press a movement key again to fly. Escape or the Free Cam toggle exits; changing jobs or disposing the extension also exits and restores native controls.

While Free Cam is active, **Follow selected object** pauses without losing its checkbox preference. Focus selects the box but asks you to exit Free Cam before moving the camera. Native orbit/focus transitions cannot override flight. When flight ends, following resumes on the current track using the flight viewing direction and the previous orbit distance. No annotations or keyframes are changed.

### Noise-resistant Auto Adjust (1.12.2)

Auto Adjust now measures a face from a connected surface patch instead of accepting three nearby returns or a single outermost return. A candidate needs at least six distinct occupied cells, spread in both directions of the face, within a 6 cm boundary band. Local connections are limited to 24 cm. Duplicate returns do not increase confidence. The patch median supplies the boundary estimate; existing 3 cm padding remains.

Small trash clusters, isolated returns and thin noise streaks cannot justify expansion. Faces without a supported patch stay unchanged. A group of uncertain outer returns also prevents inward trimming across a possibly real thin part. Ground exclusion, saved shrink limits, heading preservation, bottom contact, and single-edit behavior remain active. A sufficiently coherent nearby background surface can still resemble an object surface; this is a conservative geometry filter, not semantic object recognition. Review the result in multiple views.

Bản gộp **1.13.0** giữ Auto-Fit preset/Python CLI cùng các cập nhật Auto Adjust, Follow Camera và Free Cam từ nhánh làm việc chung. Kiểm thử sau merge: **124 Node unit + 11 Python + 36 browser test pass**. [Bằng chứng bản gộp](docs/verification/merge-1.13.0.md).
