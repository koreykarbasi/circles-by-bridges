---
name: Legacy last-contact provenance
description: Why missing-date rollouts must preserve historical nonempty last-contact dates even if the user never selected one.
---

Preserve existing nonempty last-contact values when introducing missing-date prompts. Do not infer that a populated historical date was explicitly chosen by the user.

**Why:** Older releases assigned randomized last-contact dates when contacts were created without one, across all circles. Those records carry no provenance distinguishing automatic dates from genuine user input. Clearing or reclassifying them would risk losing real history.

**How to apply:** Backfill missing-date schedules only for genuinely empty values. If a future request aims to correct historical automatically generated dates, explain the provenance limitation before proposing any changes to existing dates.

For newly added Circle 4 contacts only, the user explicitly requested a random last-contact value 60–120 days in the past when no date is supplied.

**Why:** The user wants Circle 4 contacts added on the same day to have spread-out first check-in reminders rather than all becoming due 320 days after creation.

**How to apply:** Generate and persist the date once at creation, including imports. Preserve supplied dates, existing contacts, and Circles 1–3. This intentionally sampled starting value must not be mistaken for proven user-entered history.