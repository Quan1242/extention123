# Auto Adjust shrink settings — 1.11.0

Settings & shortcuts now includes maximum inward distance (0–40 cm, default 10 cm) and maximum percentage (0–50%, default 5%). Values save on change and persist in extension-local settings across jobs and browser restarts. Reset shrink limits restores these defaults without changing shortcuts.

The effective limit per face is the smaller of distance and the original dimension multiplied by percentage / 100. For a 2 m dimension, 25 cm and 20% allow a supported surface up to 25 cm inward; 25 cm and 5% allow only 10 cm. The measured surface must already be within that limit; distant surfaces remain fixed rather than moving by capped steps. The existing 3 cm padding remains. Either setting at zero disables inward shrinking. Outward expansion and reliable ground contact remain active. Ground-band exclusion and surface-support requirements are unchanged.

Both button and shortcut capture the same settings. The native adapter validates options before processing, forwards them to face measurement, and uses them in its final grounded-height guard. Omitted command options preserve earlier defaults. Invalid stored numbers fall back to defaults; invalid form entries are marked and do not overwrite saved values.

Validation: 100 unit tests passed (99 in the full run, followed by all 33 adapter tests after adding the final-ground regression); 27 Edge browser tests passed. Coverage includes independent caps, zero, repeated distant-face preservation, larger top adjustment, command rejection, migration, storage persistence, reset, live hints, and payload forwarding. Extension/demo bundles rebuilt and the extension packaged. Settings screenshot: [shrink settings](shrink-settings-1.11.0.png).

Authenticated live CVAT acceptance remains pending. Browser/native-interface fixtures do not certify real CVAT interpolation or server persistence.
