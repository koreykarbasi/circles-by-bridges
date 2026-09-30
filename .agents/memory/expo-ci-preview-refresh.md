---
name: Expo CI preview refresh
description: Why a browser check may see stale UI after the Expo frontend workflow restarts.
---

After restarting the Expo frontend workflow in CI mode, an already-open browser page can keep executing its previous bundle even though Metro serves updated code.

**Why:** CI disables reloads, and a browser may report a Metro disconnection while its old JavaScript still allows navigation. A UI check against that page can incorrectly report a new edit as missing.

**How to apply:** If a post-restart browser check contradicts the source, first confirm the newly served bundle contains the change, then open a fresh browser context or reload without cache before retesting. Do not edit working app code based solely on a disconnected old tab.