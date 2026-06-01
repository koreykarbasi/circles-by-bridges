import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const SNOOZE_KEY = "bridges_reminder_snooze_v1";

export const SNOOZE_DAYS: Record<1 | 2 | 3, number> = {
  1: 14,
  2: 22,
  3: 19,
};

type SnoozeStore = Record<string, string>;

let _cache: SnoozeStore | null = null;

async function load(): Promise<SnoozeStore> {
  if (_cache) return _cache;
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = typeof localStorage !== "undefined" ? localStorage.getItem(SNOOZE_KEY) : null;
    } else {
      raw = await AsyncStorage.getItem(SNOOZE_KEY);
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
    try { localStorage.setItem(SNOOZE_KEY, raw); } catch {}
  } else {
    await AsyncStorage.setItem(SNOOZE_KEY, raw).catch(() => {});
  }
}

export async function snoozeContact(contactId: string, days: number): Promise<void> {
  const store = await load();
  store[contactId] = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  await persist();
}

export async function getSnoozedContacts(): Promise<Set<string>> {
  const store = await load();
  const now = Date.now();
  const active = new Set<string>();
  let changed = false;
  for (const [id, until] of Object.entries(store)) {
    if (new Date(until).getTime() > now) {
      active.add(id);
    } else {
      delete store[id];
      changed = true;
    }
  }
  if (changed) {
    await persist();
  }
  return active;
}

export async function clearSnooze(contactId: string): Promise<void> {
  const store = await load();
  delete store[contactId];
  await persist();
}

export function invalidateSnoozeCache(): void {
  _cache = null;
}
