---
name: Live release compatibility
description: User's standing constraint for releases that share the live backend and database.
---

“v1 is live and uses this same backend/database. Every server/DB change must be backward compatible: additive nullable columns only, no renamed or removed fields or endpoints. Old app versions must not crash.”

**Why:** The user stated that installed v1 apps continue using the same live services as the next version.

**How to apply:** Preserve older request/response contracts and test mixed-client behavior when introducing new data categories. Do not assume a new mobile release reaches every installed app simultaneously.
