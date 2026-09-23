---
name: Appearance preference scope
description: Why the app's visual mode is a device-local choice with dark launch branding.
---

Keep appearance as an explicit, device-local choice, with dark as the initial default rather than automatically following the system.

**Why:** The user asked for a manual Light/Dark switch while preserving the existing dark-purple look as Dark. A local setting changes the presentation without adding account data or a server migration, and avoids a system-setting change unexpectedly overriding the user's choice.

**How to apply:** Future appearance changes should respect the saved manual mode and preserve the three circle identities in each palette. The native launch splash remains dark-branded before JavaScript can read local storage; keep it visible until the saved theme is hydrated so it transitions directly to the chosen appearance.