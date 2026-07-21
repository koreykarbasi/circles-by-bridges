---
name: Public voting ballot integrity design
description: How unforgeable per-invitee voting identity and ballot validation are enforced on the public /api/vote/:shareCode endpoint.
---

Name-only matching against an invitee list is NOT sufficient to prevent impersonation on a public voting link — anyone who knows or guesses an invitee's name can still submit a ballot as them. Unforgeable per-invitee tokens are required.

**Why:** A prior submission that only canonicalized/restricted `voterName` to known invitee names was rejected in code review specifically because it left the impersonation gap open (knowledge of a name, not proof of identity, was still enough to vote as that person).

**How to apply:**
- Generate a random per-invitee token (e.g. `crypto.randomBytes(24).toString("hex")`) at hangout-creation time and store it server-side, keyed by lowercased invitee name.
- The public voting link only proves identity when it carries `?token=...`; the server resolves `resolvedVoterName` from the token and the client must echo that exact token back in the vote POST body.
- If a submitted `voterName` matches a known invitee but no/wrong token is supplied, reject with 403 — do not silently fall back to name-only matching.
- Names that don't match any invitee are treated as anonymous "guests" and allowed under a small fixed cap (separate from the invitee count) so generic link-sharing UX still works without enabling impersonation of real invitees.
- Ballot structure (one vote per option, unique + contiguous 1..N ranks per question-type group) must be validated independently of the identity check — both were required to pass review.
- Any new persisted column referenced by production code paths needs a startup `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guard (see server/index.ts pattern), not just a manual one-off ALTER during dev — otherwise fresh/other DBs break at runtime.
- Backfill lazily: mint and persist tokens for any invitee missing one wherever tokens are read (organizer view, public GET, vote POST) so legacy plans (or plans whose invitee list changed) never lock out real invitees or expose null tokens.
