# Optional long-axis alignment — 1.9.2

Implemented and tested on 2026-10-15 (Asia/Saigon).

## Behavior and interfaces

- **Adjust direction** is a saved checkbox beside Move to mouse. It starts unchecked; existing version-1 settings load with it disabled and keep existing shortcuts and Auto-Fit preferences.
- `MOVE_TO_MOUSE` accepts optional `adjustDirection: true`. When omitted or false, existing position-only behavior remains exact.
- With the option enabled, the tool aligns the box's longest horizontal dimension with the selected object's measured longest horizontal axis. Width and length assignments stay unchanged, even when width is the longer box dimension.
- Choose the closest facing modulo 180°, permitting at most 30° of correction. Larger corrections, sparse/symmetric/unstable footprints, square boxes, and tilted boxes keep the existing heading. Position refinement can still complete with a warning when the heading correction is rejected.
- Recenter after an accepted heading change and estimate ground at the final footprint. Preserve dimensions and roll/pitch. Commit the combined correction once through native ObjectState save/history.
- Response adds `directionAdjusted` and `directionDeltaDegrees`; `warning` includes any reason for retaining direction.

## Estimation

The estimator computes the major principal axis of equally weighted top-view occupancy cells. This follows a diamond's long diagonal and limits bias from repeated near-side or vertically stacked returns. It checks 0.08 m and 0.12 m occupancy estimates for consistency; both require at least 20 occupied cells, sufficient spread, and covariance anisotropy of at least 0.3. Estimates differing by over 10° are rejected.

When an axis is available, object size screening uses its measured axes. This avoids rejecting a narrow rotated object merely because it appears wider in the old heading, including when a correction over 30° is refused. The existing sparse/ambiguous cluster fallback still keeps raw mouse placement.

Visible LiDAR geometry does not certify physical heading or front/back direction under occlusion; the annotator should inspect the result. No live acceptance claim is made.

## Verification

- Unit suite: **83 passed**, including diamond diagonals, duplicate-density invariance, width-longest boxes, nearest facing across angle wrap, over-30° rejection, sparse/symmetric/tilted evidence, unchanged dimensions, optional behavior, and final ground contact.
- Final Edge browser suite: **22 passed**. Tests cover the actual shortcut/bridge/adapter flow against a simulated native editor, one save, checked/unchecked behavior, preference persistence after reload, and keyboard suppression while typing or in dialogs.
- The first checkbox workflow test caught shortcuts being suppressed while a checkbox retained focus. The handler now permits non-text checkbox/radio focus; text inputs, selects, editable content, and dialogs remain protected. The five focused placement/settings browser checks passed after this fix.
- [Controls screenshot](direction-controls-1.9.2.png) inspected: both checkboxes fit beside their respective actions.
- Rebuilt extension bundles and offline demo; package is `dist/CVAT-3D-Tool-Extension-1.9.2.zip`.

Live top-view/track acceptance still requires an authenticated CVAT session.
