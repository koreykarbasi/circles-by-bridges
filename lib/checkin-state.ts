import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

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

async function tryScheduleNotification(contactName: string, pushDue: string, type: ElevationType): Promise<string | undefined> {
  try {
    const triggerDate = new Date(pushDue);
    if (triggerDate <= new Date()) return undefined;
    const title = type === "hangout"
      ? `Plan a hangout with ${contactName}`
      : `Reach out to ${contactName}`;
    const body = type === "hangout"
      ? `It's been a while since you hung out with ${contactName} — open the app to set up a hangout.`
      : `It's been a while since you connected with ${contactName} — check the app for suggestions on what to say.`;
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    return id;
  } catch {
    return undefined;
  }
}

async function tryCancelNotification(notifId: string | undefined): Promise<void> {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {}
}

export async function setElevation(entry: Omit<ElevationEntry, "scheduledNotifId">): Promise<void> {
  const store = await load();

  // If ANY elevation for this contact already has a future scheduled notification,
  // leave it in place — avoids double-fire when the same contact appears on both
  // Home and Suggestions tabs.
  const now = new Date();
  for (const v of Object.values(store)) {
    if (v.contactId === entry.contactId && v.scheduledNotifId && new Date(v.pushDue) > now) {
      return;
    }
  }

  const key = storeKey(entry.contactId, entry.type);
  const existing = store[key];
  if (existing?.scheduledNotifId) {
    await tryCancelNotification(existing.scheduledNotifId);
  }
  const scheduledNotifId = await tryScheduleNotification(entry.contactName, entry.pushDue, entry.type);
  store[key] = { ...entry, scheduledNotifId };
  await persist();
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
