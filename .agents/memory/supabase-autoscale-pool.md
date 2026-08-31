---
name: Supabase pool limits on Autoscale
description: Prevent Autoscale instances from collectively exhausting Supabase's session-mode connection cap.
---

Keep each server instance’s PostgreSQL pool small enough that several simultaneous Autoscale instances remain below Supabase’s shared session-mode client limit.

**Why:** A cold start created several server instances at once. Their default ten-client pools exceeded Supabase’s fifteen-client cap, causing hangout reads and notification queries to fail with `EMAXCONNSESSION`.

**How to apply:** When changing database or deployment configuration, budget connections across concurrent instances rather than per process. Verify API reads and scheduled jobs under a cold-start/scale-out event before increasing the pool.