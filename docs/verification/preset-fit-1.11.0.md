# Preset Auto-Fit 1.11.0

Verified locally on 2026-10-15 (Asia/Saigon).

## Behavior

The live HUD and offline demo now use `fitPresetBox`, not the old extent-based `fitSeededBox`. L/W/H are exactly the selected class/subtype preset. Starting values include car 4.5 × 1.8 × 1.5 m and two-wheels 2.0 × 0.7 × 1.6 m. These are editable starting configurations, not certified size standards. `other` and unknown vehicle subtypes need an explicit preset.

The HUD shows the active key, dimensions and default/custom status. Save/reset affect that class/subtype only. Settings persist in extension local storage, or demo localStorage. Unsaved input does not change the active preset; invalid dimensions are refused. QC min/max profiles remain independent.

LiDAR serves object selection, XY centering and heading only. Heading uses occupied XY cells and supporting vehicle vertical surfaces when consistent. Forward/backward facing is kept closest to the seed; no semantic head/tail recognition. Keep direction preserves yaw. Sparse/symmetric axes and a transverse bumper shorter than half the preset long dimension retain the seed heading with a warning. Partially observed extents constrain the seed center instead of shrinking dimensions or placing the center at the point mean.

Ground must pass native plane validity checks with confidence ≥0.65. The final footprint is independently checked; conflicting ground height estimates over 0.35 m abort. Preset height remains fixed and the bottom touches the highest ground corner. Weak/absent ground leaves the entire annotation unchanged, replacing the old XY-only fallback. Manual Ground Snap retains its separate existing acceptance conditions.

One native ObjectState save/history operation applies an accepted fit. Native frame/revision/lock/workspace guards remain active. No annotation REST writes or automatic server save.

## Verification

- Unit tests: **101/101 passed** on final source.
- Edge browser full suite after final heading guard and rebuild: **26/26 passed**, 46.5 seconds.
- ZIP: `dist/CVAT-3D-Tool-Extension-1.11.0.zip`, **19 files**, all contents match extension source byte-for-byte.
- Extension and standalone demo rebuilt.
- Screenshot: `preset-fit-1.11.0.png`, synthetic demo with a saved custom preset; visually inspected during development.

Coverage includes tiny/floating car, slope contact without penetration, fixed dimensions and CVAT16 tail preservation, motorcycle long-axis alignment with duplicate rider returns, partially observed rear, bumper-only false axis, custom settings reload/reset/rejection, native save and export trace, weak-ground no-write and manual ground snap, cached real ROIs (including dense parking box32), demo undo/redo, and existing batch/session/shortcut regressions.

Old math/replay tests intentionally remain for the legacy extent fitter. Adapter tests that used to expect inferred height or weak-ground XY-only writes now check the requested preset dimensions and refusal semantics. The box32 export has no manually verified reference: its XY regression uses the previously retained replay center, not a ground-truth accuracy claim.

## Limits

No authenticated live CVAT Auto-Fit/Undo/Save/reload acceptance was performed in this change. Passing synthetic/native-interface fixtures and cached ROI replay does not prove live accuracy. Fixed presets do not match every sedan/SUV or every vehicle of a broad subtype. Occlusion and connected nearby objects can still make center/heading uncertain; review Top/Side/Front. No learned detector, semantic front/back recognition, pose compensation or new tracker was added.
