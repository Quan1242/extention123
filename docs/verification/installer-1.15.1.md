# Windows Setup.exe — 1.15.1

Date: 2026-10-21. Built on Windows x64 with Python 3.12 and PyInstaller 6.22.3. End users do not need Python or PowerShell.

## Delivered

- `CVAT-3D-Tool-Setup.exe`: windowed, self-contained executable with embedded extension ZIP, standalone native updater EXE, checksums and runtime license notices.
- Double-click starts per-user file installation and native-host registration. No Administrator rights, PowerShell command, Python installation, extension-ID input, browser profile edits or force-install policies.
- Unpacked extension ID is derived from Chromium's Windows path-ID algorithm; no new manifest key/identity migration was introduced. Same managed path retains its identity; a source-folder installation has a different path/ID.
- Existing managed extension is backed up; unknown directories/newer installations are not overwritten. Failed registration/file installation restores previous managed files. Installer/updater locks prevent simultaneous writes.
- Browser activation remains manual: Save CVAT, disable the old copy, enable Developer mode and Load unpacked the managed folder. GUI explicitly says this remains after file installation. Closing the setup window is disabled while its installation transaction is running. Setup does not close/reload any CVAT page.
- Runtime notices are installed next to the host. The EXE is unsigned; browser and Windows security checks are not disabled or bypassed.

## Validation

- 8 installer unit tests: first install/automatic identity, repair/backup, corrupted payload rejection, registration-failure rollback, unmanaged-directory protection, downgrade protection, concurrent-installer lock and Windows Unicode path identity.
- 10 updater unit tests, including subprocess binary protocol and origin validation.
- 198 non-I/O Node tests passed; 2 optional JSON replay tests skipped without fixture input. Geometry/tracking algorithm unchanged in this patch.
- The actual frozen `Setup.exe --self-test --report ...` installed the embedded payload into a disposable directory, produced native-host configuration, launched the bundled updater EXE and exchanged a correctly framed Native Messaging response. Registry access was mocked; no real CVAT annotations, browser profile or production installation were changed.
- The standalone updater EXE also downloaded and validated the real public v1.15.0 GitHub release over HTTPS from a disposable installation, confirming that the frozen network/TLS dependencies work. All four generated release asset checksums matched.
- GUI/native browser registration and Load unpacked require user acceptance on the intended browser; this is not claimed as a completed live GUI E2E test.

Chromium reference for the independently implemented identity calculation: https://raw.githubusercontent.com/chromium/chromium/main/components/crx_file/id_util.cc (Windows path wide bytes, uppercase drive letter, SHA-256 first 16 bytes, a-p encoding). Browser distribution restrictions: https://developer.chrome.com/docs/extensions/how-to/distribute.

Build from source on Windows: install PyInstaller in the build environment, then run `python scripts/build-windows-installer.py`. This builds both EXEs, packages the extension and refreshes `dist/SHA256SUMS.txt` for the four release assets. Source and EXEs contain no CVAT credentials.
