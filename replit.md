# Bridges App

## Overview
Bridges is a relationship management app based on Dunbar's social brain theory. It helps adults maintain and grow relationships by organizing contacts into "emotional proximity" circles and providing timely prompts and reminders.

## Architecture
- **Frontend**: Expo React Native with Expo Router (file-based routing)
- **Backend**: Express server (port 5000) - serves landing page and API
- **Auth**: Email/password with bcrypt hashing, express-session with PostgreSQL store (connect-pg-simple)
- **Storage**: PostgreSQL database for users, contacts, sessions; AsyncStorage for onboarding state
- **State Management**: React Context (AuthProvider, ContactsProvider, OnboardingProvider) + useState
- **Fonts**: Nunito (Google Fonts)
- **Theme**: Dark purple palette (#0B0718 background, #9B7DFF primary)
- **Integrations**: GitHub (code backup), Google Sheets (prompt sync)

## Project Structure
- `app/(tabs)/` - Four main tabs: Home, Circles, Suggestions, Hangouts
- `app/onboarding.tsx` - 7-screen onboarding walkthrough
- `app/auth.tsx` - Login/Register screen (email + password)
- `app/profile.tsx` - Profile/settings page with photo upload, replay walkthrough, logout
- `app/add-contact.tsx` - Modal screen for adding contacts with photo picker
- `app/edit-contact.tsx` - Modal screen for editing contacts with photo picker
- `app/hangouts.tsx` - Hangout plans list screen
- `app/create-hangout.tsx` - 3-step hangout creation flow (title, invitees, options)
- `app/hangout-detail.tsx` - Hangout detail with vote tallies, share link, and finalize
- `components/` - Reusable UI components (Avatar, ContactCard, ChecklistItem, SuggestionCard, CirclesVisualization, EmptyState, ContactsImport, ReminderItem)
- `lib/` - Business logic (auth-context, contacts-context, onboarding-context, query-client, storage, helpers, prompts, reminders, types)
- `constants/colors.ts` - Theme colors
- `shared/schema.ts` - Drizzle ORM schema (users, contacts, hangout_plans, hangout_options, hangout_votes tables)
- `server/routes.ts` - API routes with auth middleware
- `server/storage.ts` - Database access layer
- `server/seed.ts` - Demo user seeder
- `server/googleSheets.ts` - Google Sheets API client (Replit connector integration)
- `server/prompts-sync.ts` - Periodic sync of prompts from Google Sheets (every 24h)
- `server/templates/vote.html` - Public voting page (no auth required)
- `data/` - Runtime data (prompts-cache.json, spreadsheet-id.txt)

## Features
- Email/password authentication (register, login, logout) with session cookies
- 7-screen onboarding walkthrough (Welcome, Circles Overview, Features Overview, Circle 1/2/3 import, All Set)
- Device contacts import via expo-contacts with photos and birthdays (manual entry fallback on web)
- Orbiting circles visualization with slow solar-system animation (react-native-reanimated)
- User profile photo in center of circles visualization
- Photo uploads for user profiles and contacts (expo-image-picker, base64 encoding)
- Social Health Checklist (birthday reminders, overdue check-ins)
- Contact management with circle assignments (Core 5, Close 10, Acquaintances 35)
- Contact labels (predefined + custom free-text) for relationship context
- Birthday required for Core Circle (circle 1) contacts
- Two distinct alert types: Reminders (priority obligations) and Suggestions (proactive outreach)
- Priority-based reminders engine with circle-specific rules:
  - Circle 1: Birthday reminders (30-day advance, escalating), check-in overdue (>7 days)
  - Circle 2: Birthday reminders (30-day advance), hangout overdue (>3 weeks), check-in overdue (>30 days)
  - Circle 3: Birthday reminder on day-of ONLY (no advance, no check-in/hangout reminders)
- Circle 3 suggestions: 3-month nudge + 6-month reconnect nudge (not reminders)
- Suggestion frequency scoring: Circle 2 = ~2x/week, Circle 1 = ~1x/week, Circle 3 = only at 90/180-day thresholds
- Suggestion scheduler: AsyncStorage-backed tracking prevents repeat suggestions, cycling bonus up to +400 based on days since last suggested
- Text suggestions: copyable starter template ("Hey {name}, I was just thinking about you — …") with real name substituted; auto-marks contact as contacted on copy
- Hangout suggestions: calendar button navigates to create-hangout, auto-marks contact as contacted
- Home page: max 3 reminders + 2 suggestions, priority-ordered, cross-off to mark done
- Suggestions tab: collapsible full reminders list + suggestions below
- Personalized suggestions/prompts with separate call/text/hangout lists per circle
- Label-based prompts (Childhood Friend, College Friend, Work Friend, etc.)
- Interest-based conversation starters
- Smart prompt tracking (prevents repeats, auto-rotates, per-card shuffle)
- Urgency-based sorting (overdue contacts, upcoming birthdays prioritized)
- Action type badges on suggestion cards (call/text/hangout)
- Profile completion system: Stage 1 (home banner + Circles tab badge) until 3 Circle 1 with birthdays + 2 Circle 2 + 1 Circle 3; Stage 2 (Circles encouragement card only); Circle 1 contacts without birthdays get inline nudge in circles view
- Auth state caching: user cached in AsyncStorage/localStorage, resolve navigation immediately on startup without spinner (background verify with server)
- New contacts default lastContacted to today (server-side)
- Hangout planning accessible from: home header calendar button, home "Plan a hangout" banner, circles header button, and per-contact calendar icon on every contact card
- Hangout 3-step creation flow (Title → Invitees → Survey Builder)
- Survey builder: activity options (multiple or fixed), time slots, optional location, plus-one toggle, deadline
- Shareable voting links (public, no auth) — drag-and-drop ranked-choice voting with purple gradient cards
- Borda count scoring: rank 1 = max points, rejected = 0; bestRecommendation (bestActivity, bestTime) computed server-side
- Vote page features: reject button per card, plus-one selection (Just me / bringing guests), live results after submission
- Calendar invite (.ics) download after hangout is finalized
- Hangout detail: "Copy link" + "Copy message" buttons, Best picks recommendation banner, Borda score display
- Mark contacts as recently contacted
- Profile/settings page with circle stats, photo upload, and replay walkthrough option
- User profile photo on home screen header (links to profile)
- Google Sheets prompt sync: prompts stored in "Bridges Prompts" spreadsheet, synced every 24h
- GitHub integration for code backup
- Demo user: demo@bridges.app / demo123 (12 seeded contacts)
- Test user: test1@bridges.app / test123 (50 seeded contacts: 5 core, 10 close, 35 acquaintances)

## Prompts Sync System
- All prompts are stored in a Google Sheet called "Bridges Prompts" with 14 tabs
- Tabs: Circle 1/2/3 Call/Text/Hangout, Universal, Birthday, Overdue, Label Prompts, Interest Prompts
- Server syncs from the sheet on startup and every 24 hours
- New prompts added to the sheet are merged with the hardcoded baseline (additive only)
- Manual sync available via POST /api/prompts/sync
- Frontend loads synced data via GET /api/prompts on app startup
- If sync fails, hardcoded prompts are used as fallback
- Cache stored in data/prompts-cache.json, spreadsheet ID in data/spreadsheet-id.txt

## Reminders vs Suggestions
- **Reminders**: Priority obligations to keep friendships healthy (birthdays, overdue check-ins, hangout tracking). Cross them off to mark done. Circle 1 and 2 reminders have higher priority than circle 3.
- **Suggestions**: Proactive outreach ideas to develop friendships (text prompts, call ideas, hangout suggestions). Curated per circle level, labels, and shared interests with separate call/text/hangout lists.

## Contact Schema
- `name`, `circleLevel` (1/2/3), `interests` (text[]), `labels` (text[]), `birthday`, `lastContacted`, `lastHangout`, `notes`, `phone`, `avatarColor`, `photoUri`

## Auth Flow
1. User completes onboarding (stored in AsyncStorage)
2. Auth screen appears (login/register with email+password)
3. On success, session cookie is set and user enters main app
4. All contact data is scoped to the authenticated user's ID

## API Endpoints
- POST /api/auth/register - Create account
- POST /api/auth/login - Log in
- POST /api/auth/logout - Log out
- GET /api/auth/me - Check session
- PUT /api/auth/profile - Update profile photo
- GET /api/contacts - List user's contacts
- POST /api/contacts - Add contact
- PUT /api/contacts/:id - Update contact
- DELETE /api/contacts/:id - Delete contact
- PUT /api/contacts/:id/contacted - Mark as contacted
- GET /api/hangouts - List user's hangout plans
- POST /api/hangouts - Create hangout plan with options
- GET /api/hangouts/:id - Get hangout detail with votes
- PUT /api/hangouts/:id - Update/finalize hangout
- DELETE /api/hangouts/:id - Delete hangout
- POST /api/hangouts/:id/options - Add option to hangout
- GET /api/vote/:shareCode - Public: get hangout for voting (no auth), returns options with bordaScore + bestRecommendation
- POST /api/vote/:shareCode - Public: cast votes (no auth); body: { voterName, votes:[{optionId, rank}], bringsGuests?, plusOneCount? }
- GET /api/hangouts/:id/calendar - Download .ics calendar file (hangout must be finalized)
- GET /api/prompts - Get synced prompts data
- POST /api/prompts/sync - Force sync from Google Sheet

## User Preferences
- Dark purple theme matching BuildmyBridges.com
- Clean, minimal, calming UI (Notion + Headspace vibe)
- No emojis in the app
