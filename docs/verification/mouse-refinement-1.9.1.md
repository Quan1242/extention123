# Move to mouse with nearby object centering — 1.9.1

Implemented and tested on 2026-10-15 (Asia/Saigon).

## Behavior

Alt+Shift+M uses the top-view pointer as an approximate target, searches the local unsampled point-cloud index, and refines XY from a suitable nearby object cluster. The selected box's dimensions and rotation stay exact. Ground is estimated again under the final footprint; the existing ground quality and 1.5 m Z adjustment limit still apply.

The search spans twice the current box length/width with a 0.4 m margin. Ground support sets the vertical search when available. Clusters use a 0.45 m neighborhood; suitable candidates require at least 20 returns and 10 occupied 0.12 m cells. Occupied-cell bounds, trimmed at 1%, determine the center in the current heading. The pointer-to-cluster footprint distance ranks candidates before their center distance, so a denser, farther cluster does not win by return count. Existing neighboring annotation volumes are excluded with a small boundary tolerance.

Sparse, near-equally ranked, oversized, or unsuitable clusters keep the mouse XY placement and show a warning. Tilted boxes retain raw mouse placement because automatic center refinement supports upright boxes. All analysis occurs before a single native ObjectState save; no intermediate mouse-position keyframe is committed. Current-frame validation runs across asynchronous reads.

This is a geometric estimate from visible LiDAR support, not a guarantee of the physical object's true center when returns are occluded or disconnected. Inspect the resulting box.

## Verification

- Unit suite: **77 passed**. Includes off-center/rotated evidence, biased return density, separate denser distractors, ambiguous clusters, sparse and oversized support, annotated neighbors, destination ground, preserved geometry, and stale frames.
- Edge browser suite: **21 passed**. New integration tests run the actual shortcut handler, bridge, adapter and geometry against a simulated native editor with a THREE point cloud; they check refined center, unchanged dimensions/rotation, current-frame save delegation, one save, and the raw-pointer warning fallback.
- The final neighbor exclusion adjustment was followed by the dedicated mouse-center unit tests and a final package rebuild.
- Extension and standalone demo rebuilt. Package: `dist/CVAT-3D-Tool-Extension-1.9.1.zip`; unpacked directory: `dist/extension`.

Live acceptance on an authenticated CVAT job remains pending. The earlier selection complaint was resolved by the user switching from movement mode to cursor mode; no selection workaround was applied.
