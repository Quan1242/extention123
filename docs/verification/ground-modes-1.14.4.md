# Selectable ground modes — 1.14.4

Restored an explicit `useOriginGround` checkbox, default false. All four single-box grounding operations read the captured setting. Unchecked mode uses measured local road, including negative Z, with existing evidence/quality checks and final-footprint re-estimation. Checked mode uses Z = 0 plus the saved signed offset and never lets detected surfaces override it. Configured origin planes are kept out of measured QC caches. Missing local evidence is not an implicit origin fallback.

The previous saved numeric offset is preserved. Older settings without the new mode field default to local road. The obsolete fallback flag does not select an origin override implicitly. The UI labels the selected base and keeps the offset available for origin mode.

## Validation

- Node: 183 tests passed. Coverage includes all four operations on road at Z = -0.6 while a positive origin offset is present, explicit origin override, offsets/migration/validation, missing clouds, frame changes, separate QC evidence, and native save/Undo protections.
- Edge: 24 placement/settings/demo/preset scenarios passed with local fixture interception. A new browser test snaps to -0.6, checks the origin option and snaps to 0, then unchecks and snaps back to -0.6. Checkbox persistence and command payloads are also checked.
- Extension and offline demo builds completed. Generated source entrypoints and whitespace were checked.
- These are local fixture tests; no real CVAT annotations were changed. Version 1.14.4 is prepared locally and has not been pushed.
