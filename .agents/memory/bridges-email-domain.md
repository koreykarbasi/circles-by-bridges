---
name: Bridges email domain
description: User-supplied domain ownership and scope for transactional email setup.
---

The user owns `buildmybridges.com` through Hostinger and offered it for Bridges email delivery. They said the website is broken and not in use. After adding Resend's DNS records, the user confirmed the domain was verified.

**Why:** Password-reset delivery requires a domain the user controls; the user supplied this domain for that work.

**How to apply:** Use this domain for Bridges transactional email. Recheck provider verification when diagnosing future delivery issues; the user's confirmation is not a permanent guarantee of DNS or provider status. Do not repair or move the website as part of email setup.

Keep the email-sending domain separate from the web origin hosting reset links.

**Why:** Resend verification authenticates outbound email; it does not make the domain host the app. The user explicitly described this domain's website as broken. Using it as the reset-page origin produced unreachable links even after email delivery worked.

**How to apply:** Obtain the live server origin from deployment metadata when changing link destinations. Do not substitute the sender domain or Expo development domain unless intentionally configuring and verifying a different web host.
