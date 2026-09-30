---
name: Expo preview port conflict
description: What to check when the Expo frontend workflow fails despite a working preview.
---

The frontend workflow can report a port-in-use failure while an earlier Expo process still serves port 8081. A working HTTP response on that port does not mean the current workflow successfully started.

**Why:** Repeated launches have left an older Expo process listening after the configured workflow failed, so blindly restarting reproduced the conflict.

**How to apply:** If the frontend workflow fails with an occupied port, inspect the port's owning process and confirm it is an older Expo instance of this workspace before stopping it. Then restart the existing frontend workflow once and check its logs; do not create another preview server or alter app code to work around the collision.