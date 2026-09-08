import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { apiRequest } from "@/lib/query-client";
import { CHECKIN_THRESHOLDS } from "@shared/reminder-thresholds";
import {
  ELEVATION_DELAY_HOURS,
  ELEVATION_LIFETIME_HOURS,
} from "@shared/suggestion-priority";
import { getCheckinDaysSince } from "@shared/checkin-time";

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

async function cancelTrackedElevationNotifications(store: ElevationStore): Promise<void> {
  for (const [key, entry] of Object.entries(store)) {
    await tryCancelNotification(entry.scheduledNotifId);
    store[key] = { ...entry, scheduledNotifId: undefined };
  }
}

export async function setElevation(entry: Omit<ElevationEntry, "scheduledNotifId">): Promise<void> {
  const store = await load();
  const now = new Date();

  // Preserve the first elevation while it is active, even if both Home and
  // Suggestions report the same action. Elevations only affect server-side
  // ranking now; they must never create a device-local push.
  const key = storeKey(entry.contactId, entry.type);
  const existing = store[key];
  if (existing && new Date(existing.cleanupDue) > now) {
    await tryCancelNotification(existing.scheduledNotifId);
    store[key] = { ...existing, scheduledNotifId: undefined };
    await persist();
    return;
  }

  // Retain elevation state for priority scoring and remove any job left by an
  // older build. The server is the only authority that may deliver a push.
  store[key] = { ...entry, scheduledNotifId: undefined };
  await cancelTrackedElevationNotifications(store);
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

export async function setCheckinElevationIfOverdue(params: {
  contactId: string;
  contactName: string;
  circleLevel: 1 | 2 | 3;
  selectedDate: Date;
}): Promise<boolean> {
  const { contactId, contactName, circleLevel, selectedDate } = params;
  const daysSince = getCheckinDaysSince(selectedDate);
  if (daysSince === null) return false;
  if (daysSince <= CHECKIN_THRESHOLDS[circleLevel]) return false;

  const now = new Date();
  await setElevation({
    contactId,
    contactName,
    circleLevel,
    type: "checkin",
    elevatedAt: now.toISOString(),
    pushDue: new Date(now.getTime() + ELEVATION_DELAY_HOURS[circleLevel] * 3_600_000).toISOString(),
    cleanupDue: new Date(now.getTime() + ELEVATION_LIFETIME_HOURS[circleLevel] * 3_600_000).toISOString(),
  });
  await invalidateElevationCache();
  return true;
}
