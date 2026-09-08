---
name: Legacy last-contact provenance
description: Why missing-date rollouts must preserve historical nonempty last-contact dates even if the user never selected one.
---

Preserve existing nonempty last-contact values when introducing missing-date prompts. Do not infer that a populated historical date was explicitly chosen by the user.

**Why:** Older releases assigned randomized last-contact dates when contacts were created without one, across all circles. Those records carry no provenance distinguishing automatic dates from genuine user input. Clearing or reclassifying them would risk losing real history.

**How to apply:** Backfill missing-date schedules only for genuinely empty values. If a future request aims to correct historical automatically generated dates, explain the provenance limitation before proposing any changes to existing dates.