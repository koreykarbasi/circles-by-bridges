---
name: Android fix isolation
description: User's standing restriction for Android testing fixes: preserve the perfect iOS version and shared/main implementation.
---

The user says: "The IOS version of the app is perfect. do not change anything on the iOS app version." They further specify Android testing fixes: "DO NOT CHANGE ANYTHING IN THE MAIN CODE AND ANYWHERE THAT WOULD AFFECT THE APPLE VERSION".

**Why:** The user has comprehensively tested iOS and considers that version perfect.

**How to apply:** Keep Android fixes in Android-specific implementation files while leaving shared/default and iOS implementations intact. Do not change shared backend behavior, dependencies, or configuration as a workaround without discussing the scope conflict and obtaining authorization first.

## Expo Router bundle isolation

Expo Router's route context can package Android route siblings in iOS exports even though iOS never selects those routes. Keep Android route siblings as thin re-exports; put the actual screen outside the route directory in a platform-resolved component, with a default fallback that returns the untouched original screen.

**Why:** Export source maps showed complete Android-only authentication implementations inside an iOS bundle despite correct route selection.

**How to apply:** Check native export source maps as well as route selection when strict platform isolation is requested. The iOS graph should contain only the route wrappers and original-screen fallbacks, not the Android implementation or its helpers.
