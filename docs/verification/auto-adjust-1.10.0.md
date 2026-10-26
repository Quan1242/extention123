# Auto Adjust Box — 1.10.0

Implemented on 2026-10-15 (Asia/Saigon).

## Behavior

`AUTO_ADJUST` accepts the current editor reference. The panel button and default Alt+Shift+B shortcut invoke it. The action appears in shortcut settings; an existing custom binding using B is preserved, leaving the new action unassigned if necessary.

The geometry routine selects a supported cluster anchored inside the selected box from a 0.4 m local ROI. It excludes ground and other annotation volumes, measures supported occupied-cell bounds in the existing heading, and adjusts the four side faces and top with 3 cm padding. Outward corrections are limited to 0.4 m. No class profile clamps, heading estimation, or mouse repositioning is applied.

Inward correction requires the nearest supported face to already be within `min(0.10 m, 0.05 × original dimension)` of the current face. Distant evidence causes that face to be retained, rather than clamping an inward step. Thus repeated invocations cannot progressively walk an occluded rear toward the visible front. The padding and deadband make a completed local correction stable on repeat.

Side shrinking also requires a vertically supported surface patch. Top shrinking requires support in both XY directions. Sparse/ambiguous clusters, unreliable ground, and tilted boxes are rejected without native writes. A final ground estimate under the adjusted footprint anchors the bottom while preserving the fitted world-space top. Height shrink beyond the same local limit is rejected.

All asynchronous reads revalidate the job/frame/revision before committing. The combined change uses one native ObjectState save/history update. A no-op creates no edit or track keyframe. Ground contact can move the vertical center; heading stays exact.

## Verification results

- `node --test tests/*.test.cjs`: **94 passed**.
- Edge Playwright full suite: **24 passed**.
- Extension and standalone demo rebuilt; packaged version **1.10.0**.
- [Controls screenshot](direction-controls-1.10.0.png) inspected for panel layout.

## Verification coverage

- Geometry: simultaneous outward/inward corrections, rotated coordinates, slope contact, roof-only evidence, disconnected and connected isolated noise, unknown/class-independent dimensions, sparse/weak-ground/tilted/neighbor rejection, and idempotence.
- Occlusion: eight successive actions with only front-half car returns retain the original rear face. Separate tests retain distant side/top faces while permitting supported small inward corrections.
- Adapter: one native save, no-op without save, preserved direction, final ground contact, unchanged unsupported faces, and locked/review/weak-ground refusal.
- Browser: shortcut through actual panel/bridge/adapter in a simulated native editor, button invocation, catching nearby points, one save, and preserving a partially observed box without creating a smaller keyframe.
- Existing Auto-Fit, movement, direction adjustment, batch, settings and session regressions are included in the full suites.

Live acceptance in an authenticated CVAT editor remains pending. Automated native-editor fixtures simulate CVAT's state/save interface and do not certify actual interpolation or server persistence.
