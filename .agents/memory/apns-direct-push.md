---
name: Direct APNs push
description: Why and how Bridges bypasses Expo's push service and sends directly to Apple APNs.
---

# Direct APNs Push

## The problem
`ExponentPushToken[...]` tokens were permanently minted under `@replit-private-...` (Expo Go, no projectId). Expo's routing table keeps that account association forever — even after the standalone build re-registers with the correct projectId under `@karbasik/bridges`, Expo returns the same token value and routes sends through the old Replit account's expired credentials.

## The fix
Standalone iOS builds use `Notifications.getDevicePushTokenAsync()` instead of `getExpoPushTokenAsync()`. The raw APNs hex token is stored in the DB prefixed with `apns:` (e.g. `apns:abc123...`).

The server (`server/push-notifications.ts`) detects the `apns:` prefix and calls `sendApnsPush()` which:
- Signs a JWT with ES256 using the APNs Auth Key (stored as `APNS_AUTH_KEY_P8` secret)
- Opens a persistent HTTP/2 connection to `api.push.apple.com`
- Posts directly to `/3/device/{hex-token}`

Expo Go still uses `getExpoPushTokenAsync()` (no projectId) for development.

**Why:** Expo's push service permanently associates ExponentPushTokens with the Expo account that first minted them. No re-registration changes this. Direct APNs bypasses this entirely.

## Credentials
- Key ID: `A95GG3Y47Y` (`APNS_KEY_ID` env var)
- Team ID: `5BJJ2KP2X5` (`APNS_TEAM_ID` env var)
- Bundle ID: `app.replit.bridges` (`APNS_BUNDLE_ID` env var)
- P8 key content: `APNS_AUTH_KEY_P8` secret

## JWT caching
The APNs JWT is cached in memory for 55 minutes (Apple requires refresh before 60 min). The HTTP/2 client is also persistent and reused across sends.
