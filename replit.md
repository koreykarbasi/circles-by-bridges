# Bridges App

## Overview
Bridges is a relationship management app based on Dunbar's social brain theory. It helps adults maintain and grow relationships by organizing contacts into "emotional proximity" circles and providing timely prompts and reminders.

## Architecture
- **Frontend**: Expo React Native with Expo Router (file-based routing)
- **Backend**: Express server (port 5000) - serves landing page and API
- **Storage**: PostgreSQL database for contacts, AsyncStorage for onboarding state
- **State Management**: React Context (ContactsProvider, OnboardingProvider) + useState
- **Fonts**: Nunito (Google Fonts)
- **Theme**: Dark purple palette (#0B0718 background, #9B7DFF primary)

## Project Structure
- `app/(tabs)/` - Three main tabs: Home, Circles, Suggestions
- `app/onboarding.tsx` - 7-screen onboarding walkthrough
- `app/profile.tsx` - Profile/settings page with replay walkthrough
- `app/add-contact.tsx` - Modal screen for adding contacts
- `app/edit-contact.tsx` - Modal screen for editing contacts
- `components/` - Reusable UI components (Avatar, ContactCard, ChecklistItem, SuggestionCard, CirclesVisualization, EmptyState, ContactsImport)
- `lib/` - Business logic (contacts-context, onboarding-context, storage, helpers, prompts, types)
- `constants/colors.ts` - Theme colors

## Features
- 7-screen onboarding walkthrough (Welcome, Circles Overview, Features Overview, Circle 1/2/3 import, All Set)
- Device contacts import via expo-contacts (manual entry fallback on web)
- Concentric circles visualization of contacts
- Social Health Checklist (birthday reminders, overdue check-ins)
- Contact management with circle assignments (Core 5, Close 10, Acquaintances 35)
- Personalized suggestions/prompts based on circle level and interests
- Interest-based conversation starters
- Mark contacts as recently contacted
- Profile/settings page with circle stats and replay walkthrough option
- User profile avatar icon on home screen header

## User Preferences
- Dark purple theme matching BuildmyBridges.com
- Clean, minimal, calming UI (Notion + Headspace vibe)
- No emojis in the app
