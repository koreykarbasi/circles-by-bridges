---
name: Daily push delivery invariants
description: Reliability rules for the selected daily notification window.
---

At a selected delivery window, a user can receive one normal quick-pick reminder and one daily suggestion independently. A contact's check-in eligibility must be shared between the app, reminder delivery, and suggestion conflict checks, and every elapsed-day calculation must use the recipient's selected timezone.

**Why:** Suppressing the suggestion whenever all visible Home contacts also had quick-picks caused missing daily suggestions. Evaluating grace and threshold days in the server's calendar caused one-day late or early behavior for users outside the deployment timezone. Concurrent scheduler and token-registration delivery can duplicate reminders unless delivery is claimed before it reaches a provider.

**How to apply:** Preserve Home's published ranking for suggestions. Use the shared eligibility predicate when changing quick-pick logic, calculate calendar days in the user's timezone at 9 AM/5 PM, and retain per-user delivery serialization plus durable pre-send claims that are promoted as each provider delivery succeeds.

For legacy Expo routes, clear a saved token only for a token-specific response such as `DeviceNotRegistered` or an HTTP 404. Treat `InvalidCredentials` as an app-wide Expo/APNs configuration outage and retain user tokens.

**Why:** Removing valid user tokens during a credential outage makes recovery depend on every affected user reopening the app after the credentials are repaired.

**How to apply:** Return a normal delivery failure for `InvalidCredentials`, leave the token in place, and surface the credential failure in logs for operational repair.