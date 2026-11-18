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

Circle 4 explicit last-contacted selections must differ from creation defaults: Recently samples 30–120 days ago, Past Year 121–300, and Years ago 350–450, inclusive. The contact-card display should still say Past Year in the 301–349-day gap.

**Why:** The user wants choosing Past Year to sample a date below the check-in threshold, while keeping a broader human-readable status band.

**How to apply:** Keep display bands separate from sampling ranges. Do not change the 60–120-day creation default or the existing check-in threshold to implement these choices.

The Circle 4-only "Remind me to check in soon" shortcut must save a Reach out custom reminder immediately for a random local calendar date 7–21 days ahead, without requiring the form's Save button or marking the contact as contacted.

**Why:** The user asked for a one-click reminder independently of editing the contact.

**How to apply:** Preserve saved reminders and unsaved form edits when saving the shortcut. Its custom reminder uses the established month/day contract and existing delivery behavior; do not silently change other reminders' recurrence rules.