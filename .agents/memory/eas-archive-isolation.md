---
name: EAS archive isolation
description: Avoid packaging Replit tool caches without changing shared native-build configuration.
---

Do not assume that caches hidden from Git by the workspace are excluded from EAS archives. EAS can package large runtime/tool cache directories that are not excluded by the project's own ignore rules.

**Why:** Android build submission stalled during compression of workspace caches. A clean source-only staging directory uploaded successfully, but initially failed to resolve Expo configuration plugins because it lacked local dependencies.

**How to apply:** When shared/iOS configuration must stay frozen, use an isolated temporary build source instead of changing shared ignore files. Include all current approved source changes and required assets, not merely an older committed snapshot. Make existing dependencies available for local Expo configuration resolution while keeping them excluded from the uploaded archive. Check whether a build was actually submitted before retrying, and keep the workspace's Android version counter aligned with the submitted build without altering iOS metadata.
