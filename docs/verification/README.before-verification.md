# CVAT 3D Copilot — Minimalist Tooling Edition

> Internal production tool for automated 3D LiDAR quality auditing, auto ground snapping, rapid multi-angle rotation, free camera flight navigation, and accelerated QC feedback generation on CVAT Online.

---

## 1. The 4 Core Pillars

`CVAT 3D Copilot` delivers 4 foundational features designed to resolve the daily friction points of 3D point cloud annotation and quality control:

1. **Auto Ground Snap (<kbd>Alt + G</kbd>):**  
   Dynamically estimates the local road plane equation ($Z = aX + bY + c$) from surrounding cuboids. In 1 click or keystroke, it adjusts the active box's center height ($c_z$) so that its bottom elevation ($z_{bottom}$) snaps flush to the road surface, eliminating manual side-view dragging.

2. **Rapid 90° / 180° Rotation (<kbd>Alt + [</kbd>, <kbd>Alt + ]</kbd>, <kbd>Alt + F</kbd>):**  
   Instantly shifts heading yaw ($r_z$) by $-90^\circ$, $+90^\circ$, or $180^\circ$ while keeping the center and dimensions locked. Resolves misaligned vehicle headings on sparse point clouds in under 1 second.

3. **Free Camera Flight Mode (<kbd>Alt + C</kbd>):**  
   Bypasses CVAT's locked orbit controls. When activated, annotators can smoothly fly through the 3D LiDAR point cloud using standard <kbd>W</kbd>, <kbd>A</kbd>, <kbd>S</kbd>, <kbd>D</kbd> (dolly/pan) and <kbd>Q</kbd>, <kbd>E</kbd> (elevation) navigation.

4. **Auto QC & Smart Error Auditing (<kbd>Alt + L</kbd>):**  
   Runs an instantaneous geometric audit across all cuboids in the frame. Detects submerged bottoms, floating boxes, swapped axes, undersized/oversized dimensions, and 3D bounding overlaps. Displays issues with severity tags (`[CRITICAL]`, `[WARNING]`) and copies standardized rubric comments to clipboard in 1 click.

---

## 2. Architecture & File Structure

```
d:\Project\CVAT-3D-Copilot\
├── extension/
│   ├── manifest.json            # Manifest V3 configuration (Edge/Chrome)
│   ├── geometry_math.js         # Pure JS 3D geometry engine & road plane estimator
│   ├── job_9426_fallback.js     # Cached 61 real shapes from Job 9426 (ai20k-labs)
│   ├── styles.css               # Minimalist dark HUD design system (Zinc #121214)
│   └── content_script.js        # DOM injector, CVAT REST API client, Free Cam controller
├── docs/
│   ├── SOLO_IMPLEMENTATION_PLAN.md # 6-phase solo development roadmap
│   └── PITCH_TO_BOSS.md            # 1-page executive pitch & ROI metrics
├── test_demo.html               # Standalone browser playground loaded with Job 9426 data
└── README.md                    # Project documentation
```

---

## 3. Operational Hotkey Matrix

| Shortcut | Action | Description | Real API Behavior |
| :--- | :--- | :--- | :--- |
| `<kbd>Alt + L</kbd>` | **Auto QC Scan** | Audits all cuboids in frame; computes Health Score | Fetches `/api/jobs/{id}/annotations` |
| `<kbd>Alt + G</kbd>` | **Ground Snap** | Aligns bottom elevation to road plane | Sends `PATCH ?action=update` (HTTP 200) |
| `<kbd>Alt + F</kbd>` | **Flip Yaw 180°** | Inverts heading angle ($r_z \pm \pi$) | Sends `PATCH ?action=update` (HTTP 200) |
| `<kbd>Alt + [</kbd>` | **Rotate -90°** | Rotates box counter-clockwise by 90° | Sends `PATCH ?action=update` (HTTP 200) |
| `<kbd>Alt + ]</kbd>` | **Rotate +90°** | Rotates box clockwise by 90° | Sends `PATCH ?action=update` (HTTP 200) |
| `<kbd>Alt + C</kbd>` | **Free Cam Toggle** | Enables WASD / QE smooth flight navigation | Dispatches synthetic canvas events |
| `<kbd>Click Issue</kbd>` | **Copy QC Comment** | Selects box and copies formatted review note | Writes to `navigator.clipboard` |

---

## 4. Live Verification Against Job 9426

Tested and verified against live instance `https://cvat.note.transformerlabs.ai`:
- **Job ID:** `9426` (Task `2837`, Frame `29`)
- **Organization:** `ai20k-labs`
- **Total Cuboids:** 61 (24 `vehicles`, 20 `two-wheels`, 17 `pedestrian`)
- **Estimated Road Plane:** $Z = -0.0076 X - 0.0082 Y + 0.0246$
- **Detected Quality Issues:** 33 total (29 `CRITICAL`, 4 `WARNING`)
- **API Persistence:** Verified via `PATCH /api/jobs/9426/annotations?action=update` (HTTP 200 confirmed).

---

## 5. Quickstart

### Option A: Local Playground Test
Double click `d:\Project\CVAT-3D-Copilot\test_demo.html` in Microsoft Edge or Google Chrome to test all 4 pillars and inspect the 61 shapes from Job 9426.

### Option B: Load into Microsoft Edge / Chrome for Live CVAT
1. Open `edge://extensions` or `chrome://extensions`.
2. Toggle on **Developer mode**.
3. Click **Load unpacked** and select `d:\Project\CVAT-3D-Copilot\extension`.
4. Navigate to `https://cvat.note.transformerlabs.ai/tasks/2837/jobs/9426`.
5. The HUD activates automatically, pulls the 61 live shapes, and enables real-time auditing and hotkeys.
