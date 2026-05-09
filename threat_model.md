# Threat Model

## Project Overview

Bridges is a relationship-management application with an Expo React Native client and an Express/Node backend backed by PostgreSQL. Users authenticate with email/password sessions and store relationship data, contact details, reminders, hangout plans, and voting responses. Production-relevant server code lives primarily under `server/`, while `app/` and `lib/` contain the client and shared client logic.

This scan assumes only production-reachable behavior matters. Development-only tooling and mockup sandboxes are out of scope unless they are invoked by the production server. TLS is provided by the platform.

## Assets

- **User accounts and sessions** — email addresses, hashed passwords, session identifiers, and active session cookies. Compromise allows impersonation and full access to a user's relationship data.
- **Relationship data and contact metadata** — names, birthdays, phone numbers, notes, labels, photos, reminder state, and hangout history. This is sensitive personal data about both users and their contacts.
- **Hangout planning data** — invitee names, survey options, vote submissions, finalized plans, and calendar exports. Tampering can mislead organizers; disclosure can expose private social graphs.
- **Push notification tokens and schedules** — Expo push tokens and user timezones. Exposure enables targeted notification abuse and privacy leakage.
- **Application secrets and integrations** — `DATABASE_URL`, session signing material, Replit connector identity tokens, and Google Sheets access tokens. Compromise would expose data and external integrations.

## Trust Boundaries

- **Client to API** — the mobile/web client is untrusted. Every API request must be authenticated and authorized server-side.
- **Public link to API** — `/vote/:shareCode` and `/api/vote/:shareCode` are intentionally public and cross an especially sensitive boundary because unauthenticated users can influence stored hangout data.
- **API to PostgreSQL** — the Express server has broad database access. Any auth, integrity, or injection failure at the API layer can expose all stored user data.
- **API to third-party services** — the server calls Google Sheets and Expo Push using server-held credentials. These calls must not be attacker-steerable and must fail safely.
- **Deployment/bootstrap to production data** — startup code in `server/index.ts` executes automatically in production, so any seeding or maintenance logic there is production-reachable and in scope.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `server/push-notifications.ts`, `server/prompts-sync.ts`, `server/googleSheets.ts`
- **Highest-risk areas:** session setup and auth routes in `server/routes.ts`; startup/bootstrap logic in `server/index.ts` and `server/seed.ts`; public voting flow in `server/routes.ts` and `server/templates/vote.html`
- **Public surface:** `/vote/:shareCode`, `GET/POST /api/vote/:shareCode`, unauthenticated calendar download route
- **Authenticated surface:** `/api/auth/me`, `/api/auth/profile`, `/api/contacts*`, `/api/hangouts*`, `/api/prompts*`, notification token updates
- **Usually dev-only unless proven reachable:** `scripts/`, Expo static build helpers. `server/seed.ts` is not dev-only because it is invoked from production startup.

## Threat Categories

### Spoofing

The application relies on cookie-backed sessions for all authenticated APIs. Session identifiers must be signed with an unpredictable secret, and production must fail closed if the secret is missing instead of falling back to a known default. Authentication endpoints must also resist credential guessing and any production bootstrap logic must not create predictable accounts.

### Tampering

Users can mutate contacts, hangouts, votes, prompts sync state, and notification settings. The server must treat all client input as untrusted, validate object ownership on every write, and protect authenticated state-changing routes from cross-site request forgery. Public voting links must preserve ballot integrity and prevent one visitor from submitting unlimited votes for the same survey.

### Information Disclosure

The backend stores private relationship data and exposes a public voting surface. API responses must only disclose the minimum data required to the current user or public invitee. Logs and error paths must avoid leaking sensitive contact details, integration data, or secrets.

### Denial of Service

Public auth and voting endpoints can be hit anonymously and repeatedly. The system must bound expensive operations, rate limit brute-force and spam-prone routes, and avoid allowing unauthenticated or low-cost requests to trigger disproportionate database or external-service work.

### Elevation of Privilege

There is no admin role, so the main privilege boundary is between unauthenticated users, authenticated users, and holders of public share links. Users must never gain access to another user's contacts or hangout plans by guessing identifiers, exploiting weak session configuration, or relying on production bootstrap paths that create reusable accounts.