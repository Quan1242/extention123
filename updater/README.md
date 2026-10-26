# CVAT 3D TOOL Windows updater

Windows x64 double-click setup: **CVAT-3D-Tool-Setup.exe** includes both the extension and a standalone native updater, including its Python runtime. End users do not install Python, run PowerShell, or paste an extension ID. No administrator rights required.

1. Download `CVAT-3D-Tool-Setup.exe` from the latest GitHub Release and double-click it.
2. The GUI installs into `%LOCALAPPDATA%\CVAT-3D-Tool`, validates its bundled payload and registers the native host for the current Windows user.
3. Save CVAT work, disable the old tool copy, then open `edge://extensions` or `chrome://extensions`, enable Developer mode and Load unpacked `%LOCALAPPDATA%\CVAT-3D-Tool\extension`. The installer provides a Copy folder button. This browser step remains manual for an unpacked extension outside the store.
4. Open the job again. No extension ID input is required: the installer computes the Windows unpacked ID using Chromium's documented source algorithm (canonical path UTF-16LE, uppercase drive letter, SHA-256 mapped to a-p). This keeps the ID/settings of an existing installation at this same managed path. Moving from a different path changes the ID/settings namespace; old settings remain with the old copy.

Setup never changes browser profile files or force-install policies. It does not close/reload CVAT or save annotations itself. Re-running it preserves the previous extension directory as a backup; an older setup refuses to downgrade a newer installation. If a setup/updater is in progress, wait before retrying. The EXE is not code-signed; Windows may display a publisher/SmartScreen prompt. No browser/store or Windows checks are disabled by setup.

The older `CVAT-3D-Tool-Updater-Windows.zip` + `install.ps1` remains an advanced fallback requiring Python 3.10+ and manual ID entry. Prefer Setup.exe.

The updater only writes its managed installation. It never pulls Git, edits the source checkout, reads CVAT sessions, or imports/exports annotations. The extension saves annotations through native CVAT APIs before reloading; failure/unknown save state blocks reload. Multiple dirty editors of the same job also block reload. Close Batch/settings dialogs before retrying.

GitHub repo is fixed to `ManhLD-LDM/CVAT_Tool`. Only the latest stable release is considered. The release must include `CVAT-3D-Tool-Extension-VERSION.zip` and GitHub's SHA-256 asset digest or `SHA256SUMS.txt`. Missing releases, a private repo without public releases, rate limits, invalid ZIPs/checksums or network failures show “cannot check/update”, never “up to date”. No GitHub token or CVAT cookie is sent.

Updates are staged and validated before changing files. The old extension directory is retained under `backups\VERSION-TOKEN`. A failed directory swap restores the previous directory. Host code itself is not remotely replaced; rerun a newer installer if its protocol needs upgrading. Staged packages and backups are retained locally for diagnosis and can be removed while the updater is idle. A stale `update.lock` after a crashed host requires confirming no updater process is running before manually removing that file.

After an annotation import, reload the imported result using the import screen's existing reload action. Never save the stale pre-import editor over the imported data. This updater does not add autosave-after-import or a timer that silently saves regular editing.

Native Messaging framing and protocol are fixture-tested. Real browser host registration/reload must still be verified on the installed managed copy. Browser-native Refresh/close and other extensions are outside this save-before-reload guard.
