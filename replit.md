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
- `components/` - Reusable UI components (Avatar, ContactCard, ChecklistItem, SuggestionCard, CirclesVisualization, EmptyState, ContactsImport)
- `lib/` - Business logic (auth-context, contacts-context, onboarding-context, query-client, storage, helpers, prompts, types)
- `constants/colors.ts` - Theme colors
- `shared/schema.ts` - Drizzle ORM schema (users, contacts tables)
- `server/routes.ts` - API routes with auth middleware
- `server/storage.ts` - Database access layer
- `server/seed.ts` - Demo user seeder

## Features
- Email/password authentication (register, login, logout) with session cookies
- 7-screen onboarding walkthrough (Welcome, Circles Overview, Features Overview, Circle 1/2/3 import, All Set)
- Device contacts import via expo-contacts with photos and birthdays (manual entry fallback on web)
- Orbiting circles visualization with slow solar-system animation (react-native-reanimated)
- User profile photo in center of circles visualization
- Photo uploads for user profiles and contacts (expo-image-picker, base64 encoding)
- Social Health Checklist (birthday reminders, overdue check-ins)
- Contact management with circle assignments (Core 5, Close 10, Acquaintances 35)
- Personalized suggestions/prompts based on circle level and interests
- Interest-based conversation starters
- Mark contacts as recently contacted
- Profile/settings page with circle stats, photo upload, and replay walkthrough option
- User profile photo on home screen header (links to profile)
- Demo user: demo@bridges.app / demo123 (12 seeded contacts)
- Test user: test1@bridges.app / test123 (50 seeded contacts: 5 core, 10 close, 35 acquaintances)

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

## User Preferences
- Dark purple theme matching BuildmyBridges.com
- Clean, minimal, calming UI (Notion + Headspace vibe)
- No emojis in the app
