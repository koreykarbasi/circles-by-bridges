---
name: Native reminder-list animation
description: Prevents the Home reminder list from jumping after a quick-pick or checkmark completion.
---

Use a single parent-owned native layout transition when a Home reminder is dismissed. Do not fade a `ReminderItem` and then animate its own height before removing it from the list.

**Why:** In Expo Go on iOS, the nested height animation clipped the card but did not reflow sibling rows. The original empty slot remained briefly, then React removed the row in a second layout pass, visibly pulling suggestions and lower reminders twice.

**How to apply:** Configure the list transition immediately before the dismissal state change. Let React remove the card in that same update and animate the surrounding list once. Keep quick-pick and checkmark paths on this shared behavior.