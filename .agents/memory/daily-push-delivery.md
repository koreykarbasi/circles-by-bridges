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

Scheduled pushes are delivered at the user's selected local `:00` with a two-minute startup grace, not at any point in that hour. A scheduled run snapshots its start time so every user in an on-time batch remains eligible even if processing takes more than two minutes. Birthday advance milestones use the normal 9 AM reminder slot, after custom reminders and before ordinary check-ins.

**Why:** A restarted process at 9:10 produced visibly late suggestion/reminder pushes. A Circle 2 one-week birthday milestone was built but deferred to 5 PM, contrary to the expected morning reminder.

**How to apply:** Keep the scheduler aligned to the quarter-hour; use the explicit local delivery-start predicate for reminders, suggestions, and profile pushes. Do not move birthday milestones out of the 9 AM selection without an intentional product decision.

The in-process scheduler needs a live server. Autoscale has no scheduled minimum-instance setting; a heartbeat is only a best-effort wake-up, and covering many user time zones can require near-continuous traffic. A Reserved VM is the reliable production target for scheduler-backed releases.

**Why:** Production was terminated during a Toronto delivery window while deployed on Autoscale, so the exact-window gate correctly skipped the missed notification after restart.

**How to apply:** Use a lightweight public health endpoint only as a temporary Autoscale workaround. Before broad release, switch the deployment target to Reserved VM and republish; no client/TestFlight rebuild is required for that server-only change.