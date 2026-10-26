# Batch range compute 1.14.5

2026-10-20, Asia/Saigon.

Compute accepts 1-60 frames inclusive, reads each once sequentially and retains all sampled previews. Page navigation shows seven cards from the cache, including the four-card last page for 60 frames. Selection persists across pages. Preview JSON includes the entire computed range. Full PCD cache remains bounded to two frames. Initial preview defaults to the first seven frames.

Cancellation stops after the active read; incomplete or failed computation cannot be applied. A fresh computation clears selections/proposals. Existing temporary protections persist within the batch session. Track changes still block native writes; close/reopen after manual edits or Apply.

Apply preflights all selected frames, then performs native saves sequentially with a UI yield every 20 edits. It stops on error and reports committed frames without claiming rollback or atomicity. Keyframes/locked/outside states remain protected. Applied frames become keyframes and have separate Undo entries; Save CVAT remains required.

Geometry algorithms in batch_math.js and geometry_math.js are unchanged. No sensor-motion compensation or semantic tracking was added.

Validation:

- 188/188 Node tests passed, including 60-frame native-controller computation, more than 20 selected saves with unchanged original anchors/dimensions/yaw, and partial failure after 21 saves.
- 8/8 targeted Edge browser fixture tests passed (28.7 seconds), including all 60 frame requests, final page, persistent cross-page selection, no PCD rereads on pagination, preview export containing 60 results, inclusive limit, cancellation, failure/recompute recovery, and native apply protection.
- Extension bundles and standalone demo rebuilt. Extension ZIP 1.14.5 packaged.
- Local fixture verification only; no authenticated live 60-frame CVAT apply was performed. Python CLI unchanged and not retested for this change.
