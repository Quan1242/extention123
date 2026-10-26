# Auto Adjust near-ground exclusion — 1.10.1

Fixed on 2026-10-15 (Asia/Saigon).

## Problem and correction

Auto Adjust inherited the shared cluster selector's 8 cm ground offset. Dense road returns at 10–18 cm above the estimated plane could connect to the object and supply false side-face bounds. A regression reproduced a box expanding from the clean result of 2.06 × 1.06 m to 2.70 × 1.74 m after adding only near-ground noise.

Auto Adjust now excludes the entire near-ground band before clustering, inside-box support counting, or face measurement. Clearance is `max(0.20 m, 3 × ground RMSE)`, evaluated above the fitted plane at each point's XY position. A small numerical tolerance handles Float32 values on the boundary. With the fix, the noisy and clean clouds produce identical geometry.

Raw point-cloud data remains available for ground estimation and bottom anchoring. Auto Adjust still requires reliable ground, preserves heading, and retains its conservative inward limits and occlusion handling. If the exclusion leaves insufficient object evidence, it rejects the edit without saving or falling back to low returns. Auto-Fit, Move to mouse, and their existing cluster rules are unchanged.

The adapter returns `groundClearance` in metres and `excludedNearGroundPoints` in successful/no-op results for diagnostics. The latter counts excluded low returns, including legitimate low object parts; it is not a ground-truth semantic classification.

## Verification

- Full unit suite: **97 passed**.
- Full Edge browser suite: **26 passed**.
- Package contents verified against the rebuilt bundles.

- New unit regressions reproduce connected near-ground contamination, sloped/translated ground, wider clearance for noisier planes, and rejection of ground-band-only evidence including Float32 boundary values.
- Browser regressions exercise the actual shortcut/panel/bridge/adapter with a simulated native editor: connected near-ground noise must not alter the fitted XY faces, and low returns alone must leave geometry unchanged without a native save.
- Existing occluded-rear and repeat-adjustment checks remain included in the full suites.
- Extension and standalone demo rebuilt; local package: `dist/CVAT-3D-Tool-Extension-1.10.1.zip`.

This exclusion depends on the estimated plane and cannot independently correct a wrong ground estimate. Live acceptance in an authenticated CVAT job remains pending.
