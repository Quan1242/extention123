# Integrated release 1.13.0

2026-10-15, Asia/Saigon. Merge of local feature commit `645566a` with upstream through `640b282` from `feat/annotation-assists-1.10.0`, published on `feat/preset-fit-python-cli-1.13.0`; neither history was discarded.

Retained local preset Auto-Fit (editable class/subtype dimensions and strict ground), 3D export fixes, bundled Python CLI, native JSON/ZIP import-export tests. Retained upstream near-ground exclusion for Auto Adjust, configurable shrink limits, Follow Selected camera, frame-persistent Free Cam and camera-follow coordination, and coherent surface boundary filtering for Auto Adjust.

Resolved source conflicts by combining independent settings and command payloads. Regenerated both extension execution-world bundles and the demo bundle from merged sources. The demo uses preset Auto-Fit and passes shrink settings to Auto Adjust. Version bumped to 1.13.0 to distinguish the combined release from either branch's 1.12.x versions.

Verification after merge:

- Node unit tests: 124/124 passed.
- Python tests with local HTTP server/subprocess: 11/11 passed.
- Full Edge browser fixture suite: 36/36 passed, 56.3 seconds.
- No annotation changes, imports or permission changes on a live CVAT server during this merge.

These are automated local/fixture checks, not authenticated live CVAT acceptance. Existing live export permission restrictions and manual CLI/editor-close requirements remain as documented in the feature-specific verification reports.
