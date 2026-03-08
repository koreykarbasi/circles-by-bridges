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

## Project Structure
- `app/(tabs)/` - Three main tabs: Home, Circles, Suggestions
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
- `server/templates/vote.html` - Public voting page (no auth required)

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
  - Circle 1: Birthday reminders (highest priority), check-in overdue (>7 days)
  - Circle 2: Birthday reminders, hangout tracking alerts at 3/5/10/15 weeks, check-in overdue (>30 days)
  - Circle 3: "Have you hung out in 6 months?" yes/no prompt, check-in overdue (>90 days)
- Home page: max 3 reminders + 2 suggestions, priority-ordered, cross-off to mark done
- Suggestions tab: collapsible full reminders list + suggestions below
- Personalized suggestions/prompts with separate call/text/hangout lists per circle
- Label-based prompts (Childhood Friend, College Friend, Work Friend, etc.)
- Interest-based conversation starters
- Smart prompt tracking (prevents repeats, auto-rotates, per-card shuffle)
- Urgency-based sorting (overdue contacts, upcoming birthdays prioritized)
- Action type badges on suggestion cards (call/text/hangout)
- Hangout planning with 3-step creation flow (Create, Share, Decide)
- Shareable voting links for hangout options (public, no auth required)
- Vote tallying with visual bars and finalize/lock-in feature
- Mark contacts as recently contacted
- Profile/settings page with circle stats, photo upload, and replay walkthrough option
- User profile photo on home screen header (links to profile)
- Demo user: demo@bridges.app / demo123 (12 seeded contacts)
- Test user: test1@bridges.app / test123 (50 seeded contacts: 5 core, 10 close, 35 acquaintances)

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
- GET /api/vote/:shareCode - Public: get hangout for voting (no auth)
- POST /api/vote/:shareCode - Public: cast votes (no auth)

## User Preferences
- Dark purple theme matching BuildmyBridges.com
- Clean, minimal, calming UI (Notion + Headspace vibe)
- No emojis in the app
