import React from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PERSIST_KEY = "bridges_dismissed_reminders_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day — enough to survive a restart

type DismissedStore = Record<string, string>; // reminderId → ISO timestamp

let _dismissed = new Set<string>();
let _store: DismissedStore = {};
let _loaded = false;
const _listeners: Array<() => void> = [];

function notify() {
  _listeners.forEach((l) => l());
}

function storageRead(): string | null {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(PERSIST_KEY); } catch { return null; }
  }
  return null;
}

function storageWrite(raw: string | null): void {
  if (Platform.OS === "web") {
    try {
      raw !== null ? localStorage.setItem(PERSIST_KEY, raw) : localStorage.removeItem(PERSIST_KEY);
    } catch {}
  } else {
    if (raw !== null) {
      AsyncStorage.setItem(PERSIST_KEY, raw).catch(() => {});
    } else {
      AsyncStorage.removeItem(PERSIST_KEY).catch(() => {});
    }
  }
}

function parsedStore(raw: string): DismissedStore {
  try {
    const parsed = JSON.parse(raw) as DismissedStore;
    const cutoff = Date.now() - MAX_AGE_MS;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, ts]) => new Date(ts).getTime() > cutoff)
    );
  } catch { return {}; }
}

function hydrate(store: DismissedStore): void {
  // Merge: in-memory entries (current session) take precedence over stored
  _store = { ...store, ..._store };
  for (const id of Object.keys(store)) {
    _dismissed.add(id);
  }
}

// Sync hydration for web
function ensureSync(): void {
  if (_loaded || Platform.OS !== "web") return;
  _loaded = true;
  const raw = storageRead();
  if (raw) hydrate(parsedStore(raw));
}

// Async hydration for native
async function ensureAsync(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    if (raw) hydrate(parsedStore(raw));
  } catch {}
}

export function dismissReminder(id: string) {
  ensureSync();
  if (!_dismissed.has(id)) {
    _dismissed.add(id);
    _store[id] = new Date().toISOString();
    storageWrite(JSON.stringify(_store));
    notify();
  }
}

export function clearDismissedReminders() {
  _dismissed.clear();
  _store = {};
  storageWrite("{}");
  notify();
}

export function useDismissedReminders(): Set<string> {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    _listeners.push(forceUpdate);
    // Async hydration on mount (native)
    ensureAsync().then(() => forceUpdate());
    return () => {
      const idx = _listeners.indexOf(forceUpdate);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }, []);
  ensureSync(); // web: sync on first render
  return _dismissed;
}
