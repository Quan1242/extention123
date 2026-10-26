# Python annotation CLI verification — 1.12.0

Date: 2026-10-15 (Asia/Saigon).

## Delivered behavior

`extension/cvat_annotations.py` is a standalone Python 3.10+ standard-library CLI bundled with the extension. The session page downloads its exact source and copies PowerShell commands bound to the current origin/job. No native-messaging host, automatic Python execution, local HTTP daemon, browser-profile cookie access or raw credential embedding was added.

Commands: formats, export ZIP 3D, export-native JSON, import ZIP, import-native restore. Cookie credentials use environment/getpass; optional API-token auth uses an explicitly configured scheme. No hardcoded live credentials. Writes require CSRF for cookie auth, never follow redirects and are not automatically retried. Downloads are same-origin API endpoints and ZIPs undergo CRC/expanded-size validation.

CLI imports require matching --confirm-job and --editor-closed. Both create and fsync native JSON backups with full label definitions, verify the saved file, and reread server annotations before writing. This is deliberately documented native-JSON backup behavior, distinct from the existing browser import's ZIP-backup requirement. It is not an atomic concurrency transaction.

Native restore is limited to the original origin/job, checks label names/IDs and referenced attribute schemas, validates cuboid16 shapes, strips old annotation IDs, and verifies read-back ignoring server IDs/top-level version. Replacement can change server IDs; no native Undo or automatic rollback is claimed. Older frontend JSON containing only basic label mapping cannot restore annotations with attributes until a full label-schema native export is available.

## Evidence

- **105/105 Node unit tests passed.**
- **11/11 Python tests passed**, including real urllib HTTP traffic to a local test server and a real subprocess CLI invocation with synthetic environment credentials.
- **29/29 Edge browser tests passed** (46.9s), including CLI download and generated commands with correct job/origin/confirmation flags, no cookie copy/read, and existing session/Auto-Fit/batch/shortcut regressions.
- After explicitly setting use_default_location=false for local ZIP uploads, reran all 11 Python tests and all 9 session transport unit tests; passed. This query-only transport change does not alter the command-generation UI.
- Rebuilt extension and standalone demo; package includes `cvat_annotations.py` as its twentieth file.

Python coverage: native keyframes and full attribute schema, validated ZIP download, HTTP403 without retry/output file, invalid ZIP and external URL rejection, verified backup before multipart upload, same-job native restore with new server IDs, wrong-job/schema refusal, backup disk failure, concurrent edit detection, redirect/insecure remote URL/missing-CSRF/wrong-format refusal, polling deadline, output exclusivity, process execution and no credential in console output.

## Limits

All Python network/write acceptance above uses synthetic data and a loopback server. No CLI import or restore was run against the user's real CVAT job. No claim that Python repairs server permissions, that every CVAT deployment is compatible, or that editor closure can be detected automatically. --editor-closed is an operator assertion. Authentication, filesystem permissions, native server IDs, async server errors and simultaneous edits still require deployment-specific acceptance.

Usage: [Python CLI guide](../PYTHON_ANNOTATIONS_CLI.md).
