# Free Cam frame continuity and follow ownership — 1.12.1

Frame changes previously called the same camera shutdown path as an explicit Free Cam exit. Navigation within the same job now retains Free Cam and its world position, quaternion and zoom. Saved flight state is reapplied through native scene resets; replacement cameras/controls are rebound while restoring the old controls enabled state. Job changes, Escape, the toggle, and adapter disposal still exit cleanly.

Frame transitions clear held movement and right-drag input. Movement repeats are consumed without restarting cleared input, so a held key cannot drift into the next frame or reach a native CVAT shortcut. Flight movement waits for the current canvas frame to be ready. Native orbit/focus transitions are synchronized to the flight pose instead of overriding it.

Camera ownership is explicit: Follow selected object remains enabled but paused during Free Cam. Focus can select a box, but returns a message asking the user to exit Free Cam before changing the view. After flight exits, follow recenters on the current track with the current flight direction and previous orbit distance, avoiding the stale pre-flight heading. Camera changes create no annotation saves, keyframes or history entries.

Validation: 110 unit tests and 30 Edge browser tests passed. The camera unit and browser tests were rerun after final key-handling changes. New regressions cover native frame reset, held-key clearing, exact position/quaternion preservation, camera/control replacement and restoration, Focus protection, paused following, resuming from the flight heading, and job/disposal cleanup. Extension/demo builds passed; the packaged ZIP was compared with source and generated bundles.

Live acceptance on authenticated CVAT remains pending. Camera browser fixtures simulate CVAT's editor interface using real Three.js cameras.
