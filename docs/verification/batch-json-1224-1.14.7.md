# Batch Track Review / Apply — 1.14.7

Date: 2026-10-21. Input: owner-provided `cvat-job-1224-annotations.json`, read locally without network requests or file modification.

Input SHA-256: `c8438b03ea4890842a9bd2b35ad95160411ef6b2cf2eba1979fd29bc4927fc66`.

## Findings from the supplied annotations

- 78 tracks, no standalone shapes or tags; all cuboid points have valid finite geometry.
- 43 tracks contain all 60 keyframes.
- Across frames 0–59: 3,356 visible states are explicit keyframes; 1,324 states are outside/not present. There are no visible interpolated states eligible for position refinement.
- A keyframe's presence does not prove it was manually reviewed. This export nevertheless provides no provenance allowing the tool to distinguish manual keyframes from imported/generated ones. The existing policy protects all original keyframes.
- Consequently a correct review of this exact JSON produces zero editable proposals. This is a policy constraint, not evidence that Apply is broken. Overwriting original anchors is not enabled by this patch.

## Changes

- In-dialog Apply confirmation listing job, track and selected frames; Back to review or Close cancels without edits.
- Summary counts distinguish anchors/proposals; no-proposal results explain protection and other non-editable statuses.
- Backend refuses incomplete ranges and rejects analysis results from a superseded compute.
- Apply validates finite positive geometry and unchanged rotation/dimensions before saving.
- Native save is checked by reading the exported native track's new keyframe and comparing physical geometry with rounding/Euler-wrap tolerance. Silent no-op and mismatched commits stop remaining edits. Changed frames are reported even if confirmation fails; no automatic rollback is claimed.
- Position algorithm, thresholds, class rules and existing-keyframe protection unchanged.

## Verification

1. Original JSON replay: 78 tracks × 60 = 4,680 state reads. Compute leaves all annotations unchanged. Zero editable proposals, as expected.
2. Derived fixture only: remove interior anchors in memory, retaining visibility boundaries. Inject a deterministic +5 cm X proposal instead of LiDAR fitting. Across 78 tracks: 168 visible protected anchors, 1,324 outside states, 3,188 simulated applied frames. All anchors, rotations, dimensions and metadata preserved. Simulated per-frame Undo restores the entire derived input; original source hash unchanged.
3. Non-I/O Node suite: 186 passed, 2 optional JSON tests skipped without environment variable. Separate local JSON replay: 2 passed. Focused batch suite includes incomplete-range, no-op save, wrong committed geometry and superseded-compute regressions.
4. Batch browser fixtures: 9 passed, covering 60-frame compute, pagination without PCD reload, cross-page selection, Apply, stale edits, confirmation cancellation, navigation, keyboard isolation and compute failure/cancel recovery.

Reproduce JSON replay in PowerShell:

```powershell
$env:CVAT_BATCH_ANNOTATIONS='C:\Users\LeManh\Downloads\cvat-job-1224-annotations.json'
node --test tests/batch-annotations.test.cjs
```

These are offline replay and browser-fixture results, not live CVAT acceptance. The annotation file contains no point cloud; real ground/cluster quality cannot be validated from it. No live annotation import/export, server save, or job modification occurred during this JSON audit. Earlier live Batch Apply at frame 11 remains unconfirmed after browser control disconnected; its Undo/clean state still requires owner confirmation. This offline patch does not establish that live state.
