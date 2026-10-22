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

## Android logout during server failures

Keep device sign-out separate from server-session revocation: a failed or stalled API request must not trap Android users in their account, but local sign-out must not be described as successful server cleanup.

**Why:** The Profile confirmation previously awaited the server before clearing auth, leaving users signed in without an error when that request failed. Clearing only React state would also allow a surviving cookie or cached account to restore the session on restart.

**How to apply:** Preserve the durable local sign-out guard, invalidate pending auth hydration/updates, report remote cleanup failures, and retry cleanup before a deliberate new sign-in replaces the previous cookie. Keep these policies Android-only.

Android bodyless JSON requests should send an explicit empty JSON object rather than relying on native transport to represent an absent body correctly.

**Why:** While investigating Android sign-out, server logs showed JSON parsing failures for a single NUL byte. A JSON header combined with an absent request body risks that transport failure before the endpoint runs.

**How to apply:** Keep empty-body fixes scoped to Android request callers; do not change the shared API client or iOS transport to address this Android failure.

## Android component render checks

The default unit-test transform inherits React Native's JSX-preserving compiler mode. Direct component imports can therefore fail with an unexpected JSX token even when native Expo exports compile correctly.

**Why:** Metro normally handles that JSX, but the Node-based unit runner does not. Changing app or shared compiler settings merely to enable an Android render test would violate the isolation requirement.

**How to apply:** Keep JSX-emitting Android render checks in an isolated test configuration. Treat mocked/native-component render checks as evidence of slot population and fallback logic, not proof of physical Android image painting or gestures; web preview also selects the shared, non-Android implementation.
