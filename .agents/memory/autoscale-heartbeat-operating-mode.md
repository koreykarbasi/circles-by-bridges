---
name: Autoscale heartbeat operating mode
description: The cost-driven choice to use Autoscale with a continuous workspace heartbeat rather than a Reserved VM.
---

Use Autoscale for production and run a continuous five-minute health check from 8:30–10:00 AM and 4:30–6:00 PM Toronto time to cover both the pre-warm period and full delivery hour while the workspace workflow is active. The heartbeat must log failures and retry rather than exiting on a transient response.

**Why:** A Reserved VM was considered too expensive for this app, while scheduled push delivery requires the server to be available at the recipient’s local delivery window.

**How to apply:** After each publish, confirm the health endpoint returns successfully from the heartbeat and recheck the generated production URL, which can change. Treat this as best-effort: a workspace workflow is not an independently hosted uptime monitor and may not run if the development workspace is asleep. Prefer a verified external monitor if reliable unattended delivery is required.

**Production URL renames must also be fixed in app.json (2026-08-26):** when the production URL changed from circles-bridges.replit.app to circles-by-bridges.replit.app, the old domain was updated in the heartbeat script but app.json's `expo-router` `origin` and `extra.apiUrl` still pointed at the dead old domain — which now serves Replit's "app isn't live yet" page for every request. This project has no expo-updates/OTA mechanism, so a stale URL baked into app.json only reaches installed TestFlight/App Store builds after a full new native build and resubmission; editing app.json alone does not fix already-installed apps. After any production URL change, grep the whole repo (not just server/deploy scripts) for the old domain, including app.json.

**Confirmed failure mode (2026-08-26):** deployment logs showed the Autoscale instance scaled to zero after ~3:49 AM Toronto and stayed down until ~9:05 AM, while the heartbeat workflow's own log only began at 9:05 — i.e. the workspace was asleep for part of the configured 8:30–9:30 window, so nothing pinged the server and a user hit a cold-start "app isn't live yet" page trying to log in. This is not hypothetical: the workspace-hosted heartbeat can silently stop covering part of its window with no alert. Don't present this heartbeat as a solved reliability problem — treat gaps like this as expected until an external monitor is in place.

GitHub Actions schedules can also arrive hours late. A short scheduled job that checks the wall clock can be marked successful while skipping its health request, even though it missed the notification window entirely. Start scheduled jobs several hours early and let one long-running job wait for and own the full 8–10 AM / 4–6 PM Toronto window. Keep manual dispatch as an immediate one-shot health check.

**Why:** A morning Actions run arrived at 12:55 PM Toronto, skipped the guarded curl, and still concluded successfully; production had slept through the 9–10 AM delivery hour.

**How to apply:** Verify the health step itself ran; a green workflow conclusion is insufficient. Preserve enough early-start buffer for GitHub queue delays while keeping each job below the six-hour runner timeout.