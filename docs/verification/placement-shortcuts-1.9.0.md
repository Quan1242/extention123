# Direction lock, mouse placement, and shortcuts — 1.9.0

Verified on 2026-10-15 (Asia/Saigon).

## Automated results

- `node --test tests/*.test.cjs`: **73 passed**, including existing real-case Auto-Fit fixtures.
- `node node_modules/@playwright/test/cli.js test`: **19 passed** in headless Microsoft Edge.
- After the final rebuild, `node node_modules/@playwright/test/cli.js test tests/browser/shortcuts.spec.cjs`: **2 passed**; screenshots inspected for layout.
- `node scripts/build-extension.cjs`, `node scripts/build-demo.cjs`, and `scripts/package-extension.ps1`: succeeded. Package: `dist/CVAT-3D-Tool-Extension-1.9.0.zip`; unpacked files: `dist/extension`.
- `git diff --check`: passed.

Tests cover fixed-heading extents (including deliberately misaligned point evidence), recentering, weak ground, tilted-box rejection, top-camera pan/zoom/resize, transformed cuboid parents, destination ground, large-Z fallback, stale pointers/references, frame changes during cloud reads, native save dispatch, current-frame track save delegation, settings validation/duplicates, recording/cancel/reset/clear, persistence through the storage API, and keyboard suppression/repeats. Track routing uses mocked native ObjectState behavior; it does not certify real CVAT interpolation or undo/redo.

## Visual checks

- [Direction controls](direction-controls-1.9.0.png): checkbox beside Auto-Fit and action hints fit within the existing panel.
- [Shortcut settings](shortcuts-1.9.0.png): readable action list, recorded binding, reset/clear controls, and close button.
- The offline demo supports Keep direction and shortcut settings. Move to mouse is unavailable there because it has no native top-view camera.

## Live verification still required

The accessible browser redirected `https://cvat-test.vantixapps.net/tasks/602/jobs/601` to the CVAT sign-in page. No live annotation edits were made.

Before live acceptance, load the unpacked 1.9.0 extension in the authenticated browser and refresh CVAT. Verify:

1. Select an upright cuboid; enable Keep direction and run Auto-Fit. Confirm heading stays exact and one Undo/Redo restores/reapplies the edit.
2. Hover inside the native top view and press Alt+Shift+M. Confirm center placement after pan, zoom, and resize, unchanged dimensions/rotation, and ground contact or a clear Z fallback warning.
3. On a track's interpolated frame, perform one placement. Confirm a current-frame keyframe, expected native interpolation, and one-step native Undo/Redo. Do not save verification edits to the server unless wanted.
4. Confirm pointer exit, frame navigation, blur, locked objects, drawing, and review mode prevent unintended edits.

The top-view API was checked against the [CVAT 2.76 canvas source](https://github.com/cvat-ai/cvat/blob/v2.76.0/cvat-canvas3d/src/typescript/canvas3dView.ts). The adapter detects unavailable APIs rather than guessing a different canvas.
