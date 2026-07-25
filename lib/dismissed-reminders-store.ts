import React from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PERSIST_KEY = "bridges_dismissed_reminders_v1";
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days — covers same-day dismissals and overnight

type DismissedStore = Record<string, string>; // reminderId → ISO timestamp

// Always replaced (never mutated) so React's Object.is dependency checks fire correctly.
let _dismissed = new Set<string>();
let _store: DismissedStore = {};
let _loaded = false;
// Dismissals that happened before async hydration — flushed and merged afterward.
let _pending: DismissedStore = {};
const _listeners: Array<() => void> = [];

function notify() {
  _listeners.forEach((l) => l());
}

function storageWrite(data: DismissedStore): void {
  const raw = JSON.stringify(data);
  if (Platform.OS === "web") {
    try { localStorage.setItem(PERSIST_KEY, raw); } catch {}
  } else {
    AsyncStorage.setItem(PERSIST_KEY, raw).catch(() => {});
  }
}

function parseStore(raw: string): DismissedStore {
  try {
    const parsed = JSON.parse(raw) as DismissedStore;
    const cutoff = Date.now() - MAX_AGE_MS;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, ts]) => new Date(ts).getTime() > cutoff)
    );
  } catch { return {}; }
}

function hydrate(store: DismissedStore): void {
  // Merge: current session entries (_store) take precedence over stored data.
  _store = { ...store, ..._store };
  const next = new Set(_dismissed);
  for (const id of Object.keys(store)) next.add(id);
  _dismissed = next; // new reference so useMemo deps fire
}

// Sync hydration for web
function ensureSync(): void {
  if (_loaded || Platform.OS !== "web") return;
  _loaded = true;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) hydrate(parseStore(raw));
  } catch {}
}

// Async hydration for native
async function ensureAsync(): Promise<void> {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    const store = raw ? parseStore(raw) : {};
    // Merge stored data with any pending dismissals from this session.
    if (Object.keys(_pending).length > 0) {
      const merged = { ...store, ..._pending };
      _pending = {};
      hydrate(merged);
      storageWrite(_store);
    } else {
      hydrate(store);
    }
  } catch {}
}

export function dismissReminder(id: string) {
  ensureSync();
  if (_dismissed.has(id)) return;
  const next = new Set(_dismissed);
  next.add(id);
  _dismissed = next; // new reference
  const ts = new Date().toISOString();
  if (_loaded) {
    _store[id] = ts;
    storageWrite(_store);
  } else {
    // Hydration still in flight — queue the write so it merges correctly.
    _pending[id] = ts;
  }
  notify();
}

export function clearDismissedReminders() {
  _dismissed = new Set();
  _store = {};
  _pending = {};
  if (Platform.OS === "web") {
    try { localStorage.removeItem(PERSIST_KEY); } catch {}
  } else {
    AsyncStorage.removeItem(PERSIST_KEY).catch(() => {});
  }
  notify();
}

export function useDismissedReminders(): ReadonlySet<string> {
  const [snapshot, setSnapshot] = React.useState<ReadonlySet<string>>(_dismissed);

  React.useEffect(() => {
    let alive = true;
    function refresh() { if (alive) setSnapshot(_dismissed); } // _dismissed is already a new ref
    _listeners.push(refresh);
    ensureAsync().then(() => { if (alive) setSnapshot(_dismissed); });
    return () => {
      const idx = _listeners.indexOf(refresh);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }, []);

  ensureSync();
  return snapshot;
}
