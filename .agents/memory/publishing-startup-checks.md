---
name: Publishing startup checks
description: Distinguish pre-listen health-check errors from actual failed publishes.
---

An isolated `healthcheck / returned status 500` line is not sufficient evidence that this app failed to publish.

**Why:** Publishing has probed the container before its server began listening, producing connection-refused errors and temporary 500s even on successful releases. The app completes database initialization before listening.

**How to apply:** Inspect the latest attempt, correlate probe timestamps with the server-listening timestamp, check the final publishing status, and verify behavior after readiness. Investigate errors that persist after startup or prevent promotion. Do not mask real initialization failures by reporting readiness prematurely or make speculative native/auth changes for a recovered startup probe.
