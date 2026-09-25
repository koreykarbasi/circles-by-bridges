---
name: Open hangout voting
description: Why hangout surveys deliberately use a shared link and freely entered voter names rather than personal identity tokens.
---

Anyone with a hangout's shared link may enter a name and vote; invitee selections cannot gate a name or determine capacity. Only a creator-selected optional limit caps distinct voter names. A later ballot with the same case-insensitive name replaces the earlier ballot, so another link holder can impersonate that voter.

**Why:** The creator explicitly prioritized one frictionless shared link over identity proof after personalized links prevented invitees from voting. This risk was disclosed.

**How to apply:** Do not reintroduce per-invitee token checks or an implicit guest buffer without a new request. Preserve old ballots and keep legacy database fields compatible, but do not expose or generate personal voting links. If stronger identity is proposed later, explain the tradeoff first. Ballot ranks still need independent structural validation.
