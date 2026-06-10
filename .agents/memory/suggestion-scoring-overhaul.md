---
name: Suggestion scoring overhaul
description: Decisions behind the scoring rebalance for Circle 3 visibility, push logic alignment, and dedup fix
---

## What changed and why

### scoreSuggestion() — lib/suggestion-scheduler.ts
- C2 base: 1400 → 1300 | C1: 1200 (unchanged) | C3: 1000 → 1100
- Cooldown bonus: `min(days×30, 400)` → `min(days×12, 150)`. Never-suggested: 400 → 150.
- Recency bonus: `min(days, 90)` → `min(days×2, 250)`
- Birthday bonus: REMOVED (redundant — handled by reminder cards + reminder push path)
- `daysUntilBirthday` param kept for API compat but renamed `_daysUntilBirthday` and ignored

**Why:** Circle 3 base was 400pts below C2 — the full cooldown cap — so C3 contacts could never naturally outscore C1/C2. Recency (how long since you actually talked) now dominates over UI-recency (cooldown).

**Cooldown gate** (isInCooldown / C1=7d, C2=3d, C3=15d) is unchanged — it prevents repeated surfacing of contacts that keep being ignored.

### sendSuggestionNudges() — server/push-notifications.ts
- Custom scorer (daysSince + birthdayBonus + circleBonus) replaced with scoreSuggestionServer() mirroring frontend exactly
- 404 bug fixed: contacts only logged in notification_log if sendExpoPush() returns true (2xx)
- Same fix applied to sendDailyReminders() logging block
- Frequency-matched dedup window: daily=23h, 3x_week=60h, weekly=144h (was always 24h)
- Elevated contacts excluded naturally: setElevation() calls POST /api/notifications/local-log which registers in notification_log, so they fall within the dedup window

**Why:** Old scorer gave C3 circleBonus=0, birthday a +500 bonus (duplicating reminder path), and used a fixed 24h dedup so 3x/week users could see the same contact repeat Mon→Wed.
