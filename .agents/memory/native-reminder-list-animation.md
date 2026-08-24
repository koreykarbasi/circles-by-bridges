---
name: Native reminder-list animation
description: Prevents the Home reminder list from jumping after a quick-pick or checkmark completion.
---

Do not animate Home reminder-list removals. Start the optimistic contact update and dismiss the reminder in the same React event so the list reaches its final layout in one render.

**Why:** In Expo Go on iOS, the nested height animation clipped the card but did not reflow sibling rows. The original empty slot remained briefly, then React removed the row in a second layout pass, visibly pulling suggestions and lower reminders twice.

**How to apply:** In quick-pick and checkmark paths, invoke the contact mutation first, dismiss the reminder immediately afterward without awaiting it, then await the save. Do not add `LayoutAnimation` or per-card height/opacity animations around this update.