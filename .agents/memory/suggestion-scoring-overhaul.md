---
name: Suggestion push priority
description: Durable rules for keeping Home suggestions, push rotation, swipe cooldowns, and delivery dedup aligned
---

## Authoritative priority cohort

**Rule:** Home owns and renders its own three-card suggestion ranking, then publishes that exact order as a one-way snapshot. API push IDs must never replace, reorder, or truncate Home cards.

**Why:** Making Home render a push-only server cohort caused it to show only two cards and disagree with the Suggestions tab when push eligibility excluded reminder contacts.

**How to apply:** Share scoring rules, not UI ownership. The scheduler reads Home's durable snapshot and applies reminder conflicts only afterward. Snapshot state must be exempt from historical notification-log pruning.

## Rotation and event identity

**Rule:** Only confirmed suggestion-push delivery advances the rolling last-two rotation. Swipe dismissals start circle-specific cooldowns but never count as delivery; failures remain retryable.

**Why:** Reusing one event type for pushes and swipes made ignored contacts advance rotation and made it impossible to reason about successful delivery.

**How to apply:** Keep claim, confirmed-push, and dismissal events distinct. Legacy mixed events may conservatively block a same-hour duplicate, but must not feed rotation history.

## Duplicate safety

**Rule:** Selection through delivery is serialized per user across processes, and a durable pre-send claim blocks uncertain same-hour retries after a crash.

**Why:** An in-memory scheduler flag cannot stop overlapping deployments or multiple server processes from selecting and sending the same push.

**How to apply:** Promote a claim to confirmed delivery only after the provider accepts the push; delete it on an ordinary failure, and never let a claim advance rotation.
