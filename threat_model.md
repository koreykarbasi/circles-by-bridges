# Threat Model

## Project Overview

Bridges is a relationship-management application with an Expo React Native client and an Express/Node backend backed by PostgreSQL. Users authenticate with email/password sessions plus Apple and Google sign-in, then store relationship data, contact details, reminders, hangout plans, and voting responses. The backend also sends password-reset and calendar-invite emails, syncs prompt content from a connected Google Sheet, and sends push notifications. Production-relevant server code lives primarily under `server/`, while `app/` and `lib/` contain the client and shared client logic.

This scan assumes only production-reachable behavior matters. Development-only tooling and mockup sandboxes are out of scope unless they are invoked by the production server. In production, `NODE_ENV` is assumed to be `production`, so `server/seed.ts` is treated as dev-only unless startup behavior changes again. TLS is provided by the platform.

## Assets

- **User accounts and sessions** — email addresses, hashed passwords, session identifiers, and active session cookies. Compromise allows impersonation and full access to a user's relationship data.
- **Relationship data and contact metadata** — names, birthdays, phone numbers, notes, labels, photos, reminder state, and hangout history. This is sensitive personal data about both users and their contacts.
- **Hangout planning data** — invitee names, survey options, vote submissions, finalized plans, and calendar exports. Tampering can mislead organizers; disclosure can expose private social graphs.
- **Push notification tokens and schedules** — Expo push tokens and user timezones. Exposure enables targeted notification abuse and privacy leakage.
- **Application secrets and integrations** — `DATABASE_URL`, session signing material, Replit connector identity tokens, Google Sheets access tokens, Apple/Google OAuth configuration, and Resend API credentials. Compromise would expose data and let attackers abuse external integrations.
- **Operational logs and telemetry** — request logs, auth/debug logs, and any downstream log sink that receives server output. These logs must not become a secondary store for user PII or sensitive application state.

## Trust Boundaries

- **Client to API** — the mobile/web client is untrusted. Every API request must be authenticated and authorized server-side.
- **Public link to API** — `/vote/:shareCode` and `/api/vote/:shareCode` are intentionally public and cross an especially sensitive boundary because unauthenticated users can influence stored hangout data.
- **API to PostgreSQL** — the Express server has broad database access. Any auth, integrity, or injection failure at the API layer can expose all stored user data.
- **API to third-party identity and delivery services** — the server calls Apple/Google identity services, Google Sheets, Expo Push, and Resend using server-held credentials. These calls must not be attacker-steerable, and identity assertions must be bound safely to local accounts.
- **API to operational logging** — anything written to stdout/stderr or forwarded to platform logs crosses a secondary disclosure boundary because log readers often differ from primary data readers.
- **Deployment/bootstrap to production data** — startup code in `server/index.ts` executes automatically in production, so production migrations, scheduled jobs, and boot-time maintenance logic there are in scope.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `server/push-notifications.ts`, `server/prompts-sync.ts`, `server/googleSheets.ts`, `server/email.ts`
- **Highest-risk areas:** session setup and auth/account-linking routes in `server/routes.ts`; request logging and startup behavior in `server/index.ts`; public voting flow in `server/routes.ts` and `server/templates/vote.html`; authenticated outbound-integrations routes such as `/api/prompts/sync`, invite-email sending, and notification delivery
- **Public surface:** `/vote/:shareCode`, `GET/POST /api/vote/:shareCode`, landing-page assets, and any unauthenticated password-reset or auth bootstrap route
- **Authenticated surface:** `/api/auth/me`, `/api/auth/profile`, `/api/contacts*`, `/api/hangouts*`, `/api/prompts*`, notification token updates, authenticated email-invite sending, and social-auth completion routes
- **Usually dev-only unless proven reachable:** `scripts/`, Expo static build helpers, and `server/seed.ts` while production startup continues to gate it behind `NODE_ENV !== "production"`

## Threat Categories

### Spoofing

The application relies on cookie-backed sessions for all authenticated APIs. Session identifiers must be signed with an unpredictable secret, and production must fail closed if the secret is missing instead of falling back to a known default. Authentication endpoints must resist credential guessing, and social-login flows must verify both that third-party tokens were minted for Bridges' own OAuth client IDs and that the verified provider subject is durably bound to the local account rather than trusting a mutable email claim alone.

### Tampering

Users can mutate contacts, hangouts, votes, prompts sync state, and notification settings. The server must treat all client input as untrusted, validate object ownership on every write, and protect authenticated state-changing routes from cross-site request forgery. Public voting links must preserve ballot integrity and prevent one visitor from submitting unlimited votes for the same survey, including integrity-sensitive side fields such as guest counts.

### Information Disclosure

The backend stores private relationship data and exposes a public voting surface. API responses must only disclose the minimum data required to the current user or public invitee. Public voting routes should not expose live tallies or attendance state before the workflow intends to reveal them. Notification and email delivery paths must bind recipients to stable identities or delivery endpoints so private plan details and relationship reminders cannot leak to unrelated accounts or later device holders. Logs and error paths must avoid leaking sensitive contact details, provider identifiers, integration data, or secrets.

### Denial of Service

Public auth and voting endpoints can be hit anonymously and repeatedly. The system must bound expensive operations, rate limit brute-force and spam-prone routes, and avoid allowing unauthenticated or low-cost authenticated requests to trigger disproportionate database or external-service work such as outbound email, push delivery, or privileged Google Sheets synchronization.

### Elevation of Privilege

There is no admin role, so the main privilege boundary is between unauthenticated users, authenticated users, and holders of public share links. Users must never gain access to another user's contacts or hangout plans by guessing identifiers, exploiting weak session configuration, abusing social-auth account-linking gaps, or reaching production-only bootstrap paths that create reusable accounts.