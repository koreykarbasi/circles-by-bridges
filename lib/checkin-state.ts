import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { apiRequest } from "@/lib/query-client";

const ELEVATION_KEY = "bridges_checkin_elevation_v1";

export type ElevationType = "checkin" | "hangout";

export interface ElevationEntry {
  contactId: string;
  contactName: string;
  circleLevel: 1 | 2 | 3;
  type: ElevationType;
  elevatedAt: string;
  pushDue: string;
  cleanupDue: string;
  scheduledNotifId?: string;
}

type ElevationStore = Record<string, ElevationEntry>;

function storeKey(contactId: string, type: ElevationType): string {
  return `${contactId}:${type}`;
}

let _cache: ElevationStore | null = null;

async function load(): Promise<ElevationStore> {
  if (_cache) return _cache;
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = typeof localStorage !== "undefined" ? localStorage.getItem(ELEVATION_KEY) : null;
    } else {
      raw = await AsyncStorage.getItem(ELEVATION_KEY);
    }
    _cache = raw ? JSON.parse(raw) : {};
  } catch {
    _cache = {};
  }
  return _cache!;
}

async function persist(): Promise<void> {
  if (!_cache) return;
  const raw = JSON.stringify(_cache);
  if (Platform.OS === "web") {
    try { localStorage.setItem(ELEVATION_KEY, raw); } catch {}
  } else {
    await AsyncStorage.setItem(ELEVATION_KEY, raw).catch(() => {});
  }
}

async function tryCancelNotification(notifId: string | undefined): Promise<void> {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {}
}

// Re-sorts all active elevations by priority score and reschedules their
// notifications with at least a 1-day gap between each. Called whenever
// the elevation store changes (add or remove).
//
// Priority order: highest ELEVATION_SCORE_BONUS first (C1 > C2 > C3);
// tie-break by elevatedAt ascending (first tapped = fires first).
// Entries whose scheduled fire time would fall after their cleanupDue are
// skipped — the elevation will have expired before the notification fires.
async function rescheduleElevationNotifications(store: ElevationStore): Promise<void> {
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Only schedule for entries that are still within their cleanup window
  const activeEntries = Object.values(store).filter(
    (e) => new Date(e.cleanupDue) > now,
  );

  // Sort: highest score first, earliest elevatedAt breaks ties
  const sorted = [...activeEntries].sort((a, b) => {
    const scoreA = ELEVATION_SCORE_BONUS[a.circleLevel];
    const scoreB = ELEVATION_SCORE_BONUS[b.circleLevel];
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(a.elevatedAt).getTime() - new Date(b.elevatedAt).getTime();
  });

  // Cancel every existing notification before re-scheduling
  for (const entry of sorted) {
    if (entry.scheduledNotifId) {
      await tryCancelNotification(entry.scheduledNotifId);
      const key = storeKey(entry.contactId, entry.type);
      if (store[key]) store[key] = { ...store[key], scheduledNotifId: undefined };
    }
  }

  let nextFireTime: Date | null = null;

  for (const entry of sorted) {
    const key = storeKey(entry.contactId, entry.type);
    if (!store[key]) continue;

    const fireAt =
      nextFireTime === null
        ? new Date(entry.pushDue)
        : new Date(nextFireTime.getTime() + ONE_DAY_MS);

    nextFireTime = fireAt;

    // Skip if fire time is already in the past
    if (fireAt <= now) {
      store[key] = { ...store[key], scheduledNotifId: undefined };
      continue;
    }

    // If the queue pushes this notification past the original cleanupDue, extend
    // it so the contact stays active until their turn fires. Cleanup is set to
    // 2 hours after the scheduled fire time as a grace window for the user to act.
    const cleanupDate = new Date(entry.cleanupDue);
    if (fireAt >= cleanupDate) {
      const extendedCleanup = new Date(fireAt.getTime() + 2 * 60 * 60 * 1000);
      store[key] = { ...store[key], cleanupDue: extendedCleanup.toISOString() };
    }

    const title =
      entry.type === "hangout"
        ? `Plan a hangout with ${entry.contactName}`
        : `Spoken to ${entry.contactName} lately?`;
    const body =
      entry.type === "hangout"
        ? `It's been a while since you hung out with ${entry.contactName} — open the app to set up a hangout.`
        : `When was the last time you contacted ${entry.contactName}? Open the app to submit or get suggestions on what to say.`;

    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    }).catch(() => undefined);

    store[key] = { ...store[key], scheduledNotifId: id };
  }
}

export async function setElevation(entry: Omit<ElevationEntry, "scheduledNotifId">): Promise<void> {
  const store = await load();
  const now = new Date();

  // If this exact contact+type already has a future scheduled notification,
  // leave it — avoids double-fire when the same contact appears on both
  // Home and Suggestions tabs.
  for (const v of Object.values(store)) {
    if (
      v.contactId === entry.contactId &&
      v.type === entry.type &&
      v.scheduledNotifId &&
      new Date(v.pushDue) > now
    ) {
      return;
    }
  }

  // Store the entry; reschedule assigns the scheduledNotifId
  const key = storeKey(entry.contactId, entry.type);
  store[key] = { ...entry, scheduledNotifId: undefined };

  // Re-sort all active elevations and assign notification times
  await rescheduleElevationNotifications(store);
  await persist();

  // Always log to server so server-push dedup doesn't double-notify this contact
  apiRequest("POST", "/api/notifications/local-log", { contactId: entry.contactId }).catch(() => {});
}

export async function getElevations(): Promise<ElevationEntry[]> {
  const store = await load();
  return Object.values(store);
}

export async function getElevation(contactId: string, type: ElevationType): Promise<ElevationEntry | null> {
  const store = await load();
  return store[storeKey(contactId, type)] ?? null;
}

export async function clearElevation(contactId: string, type: ElevationType): Promise<void> {
  const store = await load();
  const key = storeKey(contactId, type);
  const entry = store[key];
  if (entry?.scheduledNotifId) {
    await tryCancelNotification(entry.scheduledNotifId);
  }
  delete store[key];
  _cache = store;

  // Reschedule remaining elevations — removing one may allow others to move up
  await rescheduleElevationNotifications(store);
  await persist();
}

export async function getExpiredElevations(): Promise<ElevationEntry[]> {
  const store = await load();
  const now = Date.now();
  return Object.values(store).filter((e) => new Date(e.cleanupDue).getTime() <= now);
}

export async function invalidateElevationCache(): Promise<void> {
  _cache = null;
}

export const ELEVATION_SCORE_BONUS: Record<1 | 2 | 3, number> = { 1: 3000, 2: 1500, 3: 1001 };
