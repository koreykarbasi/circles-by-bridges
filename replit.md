# Bridges App

## Overview
Bridges is a relationship management app based on Dunbar's social brain theory. It helps adults maintain and grow relationships by organizing contacts into "emotional proximity" circles and providing timely prompts and reminders.

## Architecture
- **Frontend**: Expo React Native with Expo Router (file-based routing)
- **Backend**: Express server (port 5000) - serves landing page and API
- **Storage**: AsyncStorage for local data persistence
- **State Management**: React Context (ContactsProvider) + useState
- **Fonts**: Nunito (Google Fonts)
- **Theme**: Purple-based calming palette

## Project Structure
- `app/(tabs)/` - Three main tabs: Home, Circles, Suggestions
- `app/add-contact.tsx` - Modal screen for adding contacts
- `app/edit-contact.tsx` - Modal screen for editing contacts
- `components/` - Reusable UI components (Avatar, ContactCard, ChecklistItem, SuggestionCard, CirclesVisualization, EmptyState)
- `lib/` - Business logic (contacts-context, storage, helpers, prompts, types)
- `constants/colors.ts` - Theme colors

## Features
- Concentric circles visualization of contacts
- Social Health Checklist (birthday reminders, overdue check-ins)
- Contact management with circle assignments (Core 5, Close 10, Acquaintances 35)
- Personalized suggestions/prompts based on circle level and interests
- Interest-based conversation starters
- Mark contacts as recently contacted

## User Preferences
- Purple theme matching BuildmyBridges.com
- Clean, minimal, calming UI (Notion + Headspace vibe)
- No emojis in the app
