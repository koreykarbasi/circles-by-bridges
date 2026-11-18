---
name: Suggestion action selection
description: Product rules for assigning and choosing actions on label- and interest-specific suggestions.
---

Label- and interest-specific prompts may allow one or more of Text, Call, and Hangout. Show one action per card using a stable random choice: slightly favor Call for Circles 1–2 and Text for Circle 3, while still allowing other explicitly permitted actions.

**Why:** A prompt can be suitable for multiple ways of connecting, but changing the button on re-render is confusing. Circle 3 may occasionally show Call when the prompt explicitly permits it. Memory prompts such as reminiscing about a trip are conversations, not Hangouts.

**How to apply:** Keep the dedicated Circle Call/Text/Hangout tabs fixed to their named actions. Store label/interest allowed actions explicitly in the prompt sheet and preserve the selected action across Home and Suggestions.

Ordinary Home and Suggestions card shuffles must keep all eligible Call, Text, and Hangout actions available, even when the current card is a Hangout. Never interpret "do not pull check-in reminders or quick-picks" as a restriction to Hangout prompts.

**Why:** The user explicitly distinguishes suggestion actions from reminder-card types. A hangout-only filter previously caused the reported action lock.

**How to apply:** Shuffle the personalized suggestion pool independently of reminder generation. Preserve each chosen prompt's allowed action metadata and existing suitability rules; a different action on every tap is not required.