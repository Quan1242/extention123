# GitHub updater and save-before-reload — 1.15.0

Date: 2026-10-21. Scope: local implementation, disposable native-host fixtures, generated packages and headless Edge browser fixtures. No live CVAT annotations were saved/imported/exported by this verification.

## Implemented behavior

- Check only the pinned `ManhLD-LDM/CVAT_Tool` repository's latest stable GitHub Release at HUD mount and on Reload. No periodic GitHub polling, tokens or CVAT credentials in these requests.
- Status distinguishes current, update available, development version ahead and unavailable. GitHub failures do not mean current. New-version Reload offers explicit Update and Reload current actions; it does not silently install.
- One-time Windows Native Messaging setup installs to `%LOCALAPPDATA%\CVAT-3D-Tool`, not the source checkout. Uses Python 3.10+ stdlib, an origin allowlist and per-user Edge/Chrome registry entries. Installer resolves the actual Python executable and preserves an existing managed extension on rerun.
- Stage release ZIP before taking the editor hold. Verify repository/CDN URLs, SHA-256, file allowlist, manifest identity/version, size limits and non-symlink staging/backup paths. Reject changed/stale stages and concurrent host writes. Keep the old directory as a backup; restore it if the new-directory rename fails. No arbitrary executable invocation or update-supplied install scripts.
- Before HUD reload or install: inspect all open job tabs; reject duplicate dirty editors of the same job; hold interaction; save pending native annotations and frame metadata; verify no remaining annotation changes; verify job identities and tab URLs again. An unknown/busy/failed save blocks reload. Native annotations and frame save methods are used, not a replacement annotation REST write.
- Store a short-lived reload plan before the file swap. On extension restart, reload only tab IDs whose URLs still match the saved jobs, then consume the plan. Failure releases holds. No unsafe page-refresh fallback.
- Import-submitted editors block this save-before-reload route. The pre-existing import-result reload deliberately does not Save stale editor data. Session operations are blocked during an updater hold.

## Verification evidence

- Non-I/O Node suite: 198 passed; 2 optional local annotation replay tests skipped without their input environment variable.
- Headless Edge fixtures: 13 passed (4 update UI/hold tests + 9 existing Batch tests). Covers mount/Reload checks, explicit update selection, current-version safe reload, setup/error state, page holds, import-pending guard, plus Batch regression coverage.
- Python updater suite: 10 passed. Covers real subprocess binary Native Messaging framing and caller validation, staging without writes to installed files, successful commit/retained backup, checksum failure, ZIP traversal/unexpected files, wrong versions, staged tampering, failed-swap rollback, URL/token rejection and current-version mismatch.
- Installer parsed successfully by PowerShell. Registration itself was not executed.
- Packaged extension validates against the native-host allowlist; updater bundle contains exactly the three installer files and 24 extension files. SHA256SUMS validates both release ZIPs. Generated MAIN/ISOLATED bundles rebuilt from source.
- Unauthenticated public GitHub latest-release endpoint returned HTTP 404 during this work. This can mean no accessible release or a private/inaccessible repository. Successful live GitHub delivery was not measured.

## Installation and release assets

Owner must extract `CVAT-3D-Tool-Updater-Windows.zip`, run `install.ps1`, load the managed unpacked directory, disable the old copy and supply the managed copy's extension ID. This browser-owned step was not bypassed via registry guesses. Changing unpacked paths can change the ID/settings namespace.

Publish a stable release whose tag matches `extension/manifest.json` version and upload these generated assets:

1. `CVAT-3D-Tool-Extension-1.15.0.zip`
2. `CVAT-3D-Tool-Updater-Windows.zip`
3. `SHA256SUMS.txt`

Future releases use the same asset names with their new extension version. The installer/updater protocol is version 1; host code is upgraded only by rerunning an installer. The first stable release is [v1.15.0](https://github.com/ManhLD-LDM/CVAT_Tool/releases/tag/v1.15.0), with these three generated assets. Publication and public asset download checks are performed after the source commit; the pre-publication HTTP 404 above is historical.

Live acceptance remains necessary: Native Messaging connection from the managed Edge/Chrome copy, an accessible real release, native CVAT server save confirmation and browser reload recovery. Fixture passes do not establish those live results. Browser Refresh/close and reloads initiated outside this HUD are outside the guard; no periodic CVAT autosave preference was enabled.
