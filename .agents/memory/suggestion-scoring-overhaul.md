---
name: Suggestion push priority
description: Durable rules for keeping Home suggestions, push rotation, swipe cooldowns, and delivery dedup aligned
---

## Authoritative priority cohort

**Rule:** Home and scheduled suggestion pushes must use the same server-owned priority cohort and shared pure scoring formula. Reminder contacts stay outside that cohort.

**Why:** Separate client/server ranking and full-contact rotation caused pushes for contacts who were not among the suggestions the user could see on Home.

**How to apply:** Any new ranking signal or reminder exclusion must be available to both surfaces through the shared cohort rather than copied into a second scorer.

## Rotation and event identity

**Rule:** Only confirmed suggestion-push delivery advances the rolling last-two rotation. Swipe dismissals start circle-specific cooldowns but never count as delivery; failures remain retryable.

**Why:** Reusing one event type for pushes and swipes made ignored contacts advance rotation and made it impossible to reason about successful delivery.

**How to apply:** Keep claim, confirmed-push, and dismissal events distinct. Legacy mixed events may conservatively block a same-hour duplicate, but must not feed rotation history.

## Duplicate safety

**Rule:** Selection through delivery is serialized per user across processes, and a durable pre-send claim blocks uncertain same-hour retries after a crash.

**Why:** An in-memory scheduler flag cannot stop overlapping deployments or multiple server processes from selecting and sending the same push.

**How to apply:** Promote a claim to confirmed delivery only after the provider accepts the push; delete it on an ordinary failure, and never let a claim advance rotation.
