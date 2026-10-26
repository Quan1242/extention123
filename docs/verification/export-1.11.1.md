# Annotation export audit — 1.11.1

Date: 2026-10-15 (Asia/Saigon).

## Authenticated live observations

Server: cvat-test.vantixapps.net, task602/job601, existing browser login. The original editor showed unsaved changes; no Save, import, annotation edit, permission change or editor reload was performed.

- GET `/api/server/annotation/formats`: HTTP200. Enabled 3D import/export formats: Datumaro 3D 1.0, Sly Point Cloud Format 1.0, Kitti Raw Format 1.0. The complete unfiltered list starts with Generic TSV 1.0 (1D), explaining the inappropriate default in the old tool.
- Native CVAT Menu → Export job dataset → Datumaro 3D 1.0, Save images off: CVAT reports `You do not have permission to perform this action.` No export request appears on the Requests page. Treat standard dataset export as permission-blocked for this account, not as successfully tested ZIP delivery. The extension maps server HTTP403 to an explicit export-permission error.
- GET `/api/jobs/601/annotations`: HTTP200. Saved server data contains 10 tracks, 0 standalone shapes, 0 tags. Track IDs36284,42336,42339 have frames0,7,14; the other seven have frame0 only. This verifies permission to read native annotation data, not permission to enqueue a dataset export.
- Opening a `chrome-extension://` session-page URL was denied by the browser automation URL security policy. No workaround was used to open that page. Native HTTPS export was used to check server behavior instead.
- Browser download automation of the browsable API JSON did not complete. No live JSON/ZIP download is claimed. The newly added extension native-JSON save path has automated fixture evidence below; an authenticated click-to-file test remains pending.

## Changes

- Filter enabled formats by server `dimension: 3d`, with narrowly named legacy 3D fallback when the field is absent. Prefer Datumaro 3D 1.0. Reject export/import formats outside this server-provided set before POST.
- Request JSON API responses explicitly. ZIP export still uses POST job dataset/export with save_images=false, rq_id polling and result_url download. No session cookie is copied into requests manually.
- Refuse non-ZIP download signatures and check the size header before reading the body. The signature check is not a complete ZIP CRC/content validator.
- Add explicit **Export JSON native (API đọc)**. GET saved annotations, retain the original tracks/shapes/keyframe entries and wrap with schema, origin/job, timestamp and basic snapshot label ID/name/color mapping. It is not a full task backup, has no complete attribute-schema mapping and is not a dataset format accepted directly by CVAT Upload annotations.
- Native JSON uses existing annotation-read permission; it is never a silent replacement for the ZIP backup required before import. Failed dataset export/download stops the import path.
- Unsaved editor state blocks both export variants. Existing import locks, same-origin/job checks, file-size limits and download-completion checks remain.

## Verification

- Final source: 105/105 unit tests passed.
- Full Edge browser suite: 28/28 passed (48.5s), mocked Chrome runtime/downloads/server interfaces.
- Includes 3D format filtering, wrong-format refusal, native JSON keyframe preservation, unsaved blocking, export403 handling, ZIP-signature validation, explicit JSON download, backup cancellation and existing Auto-Fit/batch/session/shortcut regressions.
- No claim of successful live dataset export, live extension download, import restore, or permission repair. Account/server permission needs the owner/admin if standard ZIP export is required.

Official references: https://docs.cvat.ai/docs/dataset_management/formats/format-datumaro/ and https://github.com/cvat-ai/cvat/blob/v2.77.0/cvat/apps/engine/views.py .
