# Ground fallback and mouse placement — 1.14.1

Implemented an opt-in configured horizontal road plane for Ground Snap and Move to mouse, plus independent longitudinal/lateral face-contact settings. Defaults preserve existing behavior. Configured fallback is never inserted into measured ground caches or QC evidence.

## Verification

- Node unit suite: 174 tests passed. New cases cover signed heights, unavailable and insufficient cloud evidence, local-ground priority, validation, large-Z safeguards, all directional combinations at multiple headings, yaw correction, oversized spans, settings migration, and a single native save with final-footprint ground contact.
- Edge: 15 placement/settings browser cases passed using the repository fixtures with Playwright request interception serving local files. Standard localhost connections were blocked by this workstation's sandbox; browser launch required elevated tool execution. This is mocked-editor validation, not a real CVAT server run.
- Browser checks cover combined direction payloads/contact, missing-cloud fallback for both actions, settings persistence and validation, existing shortcut behavior and Auto Adjust regressions. A discovered active-field reset was fixed by preserving focused inputs during HUD refresh.
- Extension and standalone demo builds completed; generated MAIN and ISOLATED entrypoints were compared with their source inputs. Git whitespace checks passed.
- HUD screenshot: [placement controls](placement-controls-1.14.1.png).

The existing 1.5 m Z safeguards and native permission/stale-frame checks remain active. No annotations were written to a live CVAT job.
