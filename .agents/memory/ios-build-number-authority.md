---
name: iOS build-number authority
description: How to prevent EAS submissions from reusing build numbers Apple has already reserved.
---

Treat App Store Connect’s highest historical build number as authoritative, even when the build is not visible in EAS or a failed upload never appears in TestFlight. Keep iOS versioning explicit and local, then automatically increment from a baseline above Apple’s known maximum.

**Why:** Apple can reserve a `CFBundleVersion` during an upload that later fails or disappears from the TestFlight UI. EAS’s remote counter and recent build list may remain lower, causing multiple otherwise-valid binaries to be rejected as already submitted.

**How to apply:** Before rebuilding after repeated `SUBMISSION_SERVICE_IOS_OLD_BUILD_NUMBER` errors, check the highest build shown in App Store Connect, set the local baseline to that value, and let the production build auto-increment once. Do not guess upward one number at a time.