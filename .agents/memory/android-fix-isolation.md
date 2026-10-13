---
name: Android fix isolation
description: User's standing restriction for Android testing fixes: preserve the perfect iOS version and shared/main implementation.
---

The user says: "The IOS version of the app is perfect. do not change anything on the iOS app version." They further specify Android testing fixes: "DO NOT CHANGE ANYTHING IN THE MAIN CODE AND ANYWHERE THAT WOULD AFFECT THE APPLE VERSION".

**Why:** The user has comprehensively tested iOS and considers that version perfect.

**How to apply:** Keep Android fixes in Android-specific implementation files while leaving shared/default and iOS implementations intact. Do not change shared backend behavior, dependencies, or configuration as a workaround without discussing the scope conflict and obtaining authorization first.
