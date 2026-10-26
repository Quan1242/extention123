# Native JSON selection / identity-preserving replacement — 1.16.0

Date: 2026-10-21. Scope: local annotation replay, mocked native editor/Undo and browser UI fixtures. No import/export or annotation write was tested on the real CVAT job.

## Behavior and implementation

- HUD export now calls native `job.annotations.export()`, retaining actual `clientID` (display number) and `id` (database ID), current unsaved work, complete keyframe arrays and label schema. File metadata identifies server/job/session. Native JSON from the session page uses this same route in a wrapper; HUD import accepts both wrapper and flat JSON.
- The old HTTP PUT replacement that stripped database IDs and recreated objects was removed. Both Replace modes edit matching native objects using `ObjectState.save()`. Existing display/database IDs remain; old keyframes missing in the incoming track are removed through the native keyframe setter, after all incoming frames are applied. Label, geometry, rotations, attributes (including inheritance/defaults), outside/occlusion and z-order are applied.
- Preview lists source display/database IDs, mapped destination display ID, class and keyframe count. Controls select individual IDs, search, select/clear all, and choose selected Replace versus whole-job Replace. Confirmation required before applying. No import page reload.
- Selected Replace does not alter other IDs. Whole-job Replace additionally removes omitted objects through native `annotations.commit`, after replacements finish. All source IDs must map; new/unmatched IDs require Add explicitly.
- Add strips foreign database IDs and lets CVAT allocate new client IDs, only for selected rows. UI reports resulting IDs. Adding a second object with an existing object's display ID is not supported by native CVAT.
- Changed grouping is recreated among selected objects through native grouping, avoiding accidental membership with unselected objects. Local group numbers may differ from source; preview warns about this. Existing unchanged groups stay intact.
- Match by existing database ID first. A file with only clientID and no database ID can match only if same server/job/editor-session metadata is present. Raw legacy exports never infer display ID from array order. Cross-job metadata cannot be used for Replace; Add maps labels/attributes by exact schema names. No class/dimension heuristics or silent attribute dropping.
- Preflight checks identity, entire native collection signature, selected scope, source geometry/frames/schema, locked/ground-truth states and availability of APIs. Unsupported tags/intervals/skeleton, moving an object's starting frame and missing labels/attributes are blocked explicitly. Maximum HUD JSON file size: 32 MiB.
- Apply consumes its preview token, locks other tool edits and yields every 20 saved frames. Render/history refreshed after completion or error. Operations are sequential, not atomic: failures can leave earlier native edits, with reported changed/added/removed IDs and native Undo. Save CVAT to persist. Server dataset-import stale-editor guard remains separate.

## Verification

- Node suite excluding server transport suite: 212 passed, 3 optional local-data tests skipped without environment variables.
- Dedicated annotation-IO tests cover exact native ID export, selected/full Replace, entire keyframe replacement, unrelated-object invariants, native simulated Undo, selected Add/no foreign IDs, raw server-ID matching, stale/foreign/unknown/duplicate identities, invalid geometry/labels/attributes, locked state, standalone cuboids, grouping, immutable/mutable attributes, display-only cross-session rejection and partial failures.
- Actual owner JSON replay: `cvat-job-1224-annotations.json` and `cvat-job-1224-annotations (1).json` are read-only local inputs. Native-client-ID fixture maps server tracks 48950 and 48975 to #38/#63. Both incoming 60-frame tracks replace old keyframe sets and visibility/geometry/attributes, maintaining those identities and all other tracks unchanged. These client-ID assignments model the identified tracks, not a fresh authenticated mapping read. Source files unchanged. Group 2 on incoming 48975 is handled through native regrouping.
- Browser fixtures: 17 passed (4 annotation-selection UI + 9 Batch + 4 update UI). Checks no edit before confirmation, exact selected keys, whole-job warning, selected Add/new ID result, search without selection loss and cancel without edits.
- Frozen Windows Setup is rebuilt for 1.16.0 with the same extension archive allowlist (new modules are bundled into MAIN/ISOLATED scripts, so the old native updater's file allowlist remains compatible). SHA256SUMS covers all release artifacts.

Reproduce owner JSON test in PowerShell:

```powershell
$env:CVAT_IO_OLD='C:\Users\LeManh\Downloads\cvat-job-1224-annotations.json'
$env:CVAT_IO_NEW='C:\Users\LeManh\Downloads\cvat-job-1224-annotations (1).json'
node --test tests/annotation-io.test.cjs
```

## Limits

Native CVAT display IDs belong to the loaded collection; fresh job/page loads can allocate them again. This change preserves the existing IDs during replacement in the current editor and relies on native Save to update existing database objects. It does not patch CVAT's global counter, guarantee display-ID ordering across all future sessions, or preserve a foreign/duplicate display ID for Add. ZIP dataset/CLI imports are independent server flows and do not inherit this JSON workflow's guarantee.

Source inspection: CVAT v2.76.0 `cvat-core/src/annotations-objects/track.ts` (`save`, `saveKeyframe`, `toJSON`), `annotations-collection.ts` (`commit`, `group`) and `annotations-saver.ts` (`_updateSavedObjects`) were reviewed to distinguish in-place updates from native object creation. Live CVAT Save/Undo acceptance remains unverified under the user's no-live-import/export constraint.
