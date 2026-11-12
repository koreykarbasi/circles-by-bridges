---
name: Last-contact history and defaults
description: User-requested starting dates and why historical nonempty last-contact dates must be preserved.
---

Preserve existing nonempty last-contact values when introducing missing-date prompts. Do not infer that a populated historical date was explicitly chosen by the user.

**Why:** Older releases assigned randomized last-contact dates when contacts were created without one, across all circles. Those records carry no provenance distinguishing automatic dates from genuine user input. Clearing or reclassifying them would risk losing real history.

**How to apply:** Backfill missing-date schedules only for genuinely empty values. If a future request aims to correct historical automatically generated dates, explain the provenance limitation before proposing any changes to existing dates.

For newly added contacts without a supplied date, the user explicitly requested a random last-contact value in the past: Circle 1, 1–7 days; Circle 2, 1–14 days; Circle 3, 14–35 days; Acquaintances, 60–120 days.

**Why:** The user wants fewer Circle 1 check-in prompts, no initial missing-date question for new contacts, and spread-out check-ins for contacts added on the same day.

**How to apply:** Generate and persist the date once at creation, including imports. Preserve supplied dates and existing contacts; do not change check-in thresholds or resample on edits and moves. This intentionally sampled starting value must not be mistaken for proven user-entered history.