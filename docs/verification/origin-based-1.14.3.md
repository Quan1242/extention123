# Origin-based grounding — 1.14.3

Ground Snap, Move to mouse, Auto Adjust and Auto-Fit use the horizontal coordinate-origin plane Z = 0 plus the signed saved offset. Accepted measured surfaces cannot override it. The experimental frame-by-frame road estimator was removed. No LiDAR housing or road-height detection is used for these operations.

The former fallback checkbox is removed. Existing finite saved height values migrate as origin offsets; legacy checkbox values are ignored. Internal configured planes are marked `configured` and `coordinate-origin`, and are never inserted into measured-ground caches. QC continues to receive measured evidence. The HUD distinguishes the configured base from QC measurements and keeps the base visible when QC cloud reads fail.

Ground Snap does not need a cloud. Move to mouse can still place/snap without refinement if the cloud is unavailable; Auto Adjust and Auto-Fit require object evidence. Native stale-frame/permission guards and single-save Undo behavior remain. Existing large-Z safeguards are retained for Ground Snap, Move to mouse and Auto Adjust. The offline demo now uses a flat synthetic road and the same origin-plane semantics.

## Validation

- Node unit suite: 178 passed. Tests cover offsets, missing clouds, accepted housing-height planes at Z = 1.1 m, configured-plane precedence, frame-invariant snapping, separate QC caches, tilted cuboids, native saves, and existing real-case regressions.
- Edge: 23 browser scenarios verified across the suite and targeted reruns. Coverage includes native-editor fixtures, changing cloud elevations across frames, offset persistence/validation and payloads, object face alignment, demo Undo/redo, presets, and standalone offline loading. An obsolete ground label assertion and an action-sequencing test were corrected and rerun successfully.
- Browser tests used local request interception because localhost access is restricted in the tool sandbox; Edge was launched through approved escalated execution. No real CVAT annotations were modified.
- Extension and standalone demo builds succeeded; generated entrypoints were compared with source inputs and whitespace checks passed.

[Current controls](origin-based-controls-1.14.3.png). This release is prepared locally and has not been pushed.
