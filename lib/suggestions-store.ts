import { useState, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSchedulerData, markSuggested as _markSuggested } from "./suggestion-scheduler";

// Dismissed IDs survive until the max cooldown window expires (15 days = C3 cooldown)
const DISMISSED_PERSIST_KEY = "bridges_dismissed_suggestions_v1";
const MAX_DISMISSED_AGE_MS = 15 * 24 * 60 * 60 * 1000;

type DismissedStore = Record<string, string>; // contactId → ISO timestamp

let _dismissedIds = new Set<string>();
let _dismissedStore: DismissedStore = {};
let _dismissedLoaded = false;
let _schedulerDates: Record<string, string> = {};
let _promptCache = new Map<string, string>();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// ─── Dismissed persistence ────────────────────────────────────────────────────

function readDismissedRaw(): string | null {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(DISMISSED_PERSIST_KEY); } catch { return null; }
  }
  return null;
}

function writeDismissedRaw(raw: string): void {
  if (Platform.OS === "web") {
    try { localStorage.setItem(DISMISSED_PERSIST_KEY, raw); } catch {}
  } else {
    AsyncStorage.setItem(DISMISSED_PERSIST_KEY, raw).catch(() => {});
  }
}

async function readDismissedRawAsync(): Promise<string | null> {
  if (Platform.OS === "web") return readDismissedRaw();
  try { return await AsyncStorage.getItem(DISMISSED_PERSIST_KEY); } catch { return null; }
}

function parseDismissedStore(raw: string): DismissedStore {
  try {
    const parsed = JSON.parse(raw) as DismissedStore;
    const cutoff = Date.now() - MAX_DISMISSED_AGE_MS;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, ts]) => new Date(ts).getTime() > cutoff)
    );
  } catch {
    return {};
  }
}

function hydrateFromStore(store: DismissedStore): void {
  _dismissedStore = store;
  const extra = Object.keys(store);
  if (extra.length > 0) {
    _dismissedIds = new Set([..._dismissedIds, ...extra]);
  }
}

// Synchronous hydration for web (localStorage is sync)
function ensureDismissedSync(): void {
  if (_dismissedLoaded || Platform.OS !== "web") return;
  _dismissedLoaded = true;
  const raw = readDismissedRaw();
  if (raw) hydrateFromStore(parseDismissedStore(raw));
}

// Async hydration for native (AsyncStorage)
async function ensureDismissedAsync(): Promise<void> {
  if (_dismissedLoaded) return;
  _dismissedLoaded = true;
  const raw = await readDismissedRawAsync();
  if (raw) hydrateFromStore(parseDismissedStore(raw));
}

// ─── Dismissed IDs ────────────────────────────────────────────────────────────

export function getDismissedIds(): ReadonlySet<string> {
  ensureDismissedSync();
  return _dismissedIds;
}

export function dismissSuggestion(contactId: string): void {
  ensureDismissedSync();
  if (!_dismissedIds.has(contactId)) {
    _dismissedIds = new Set(_dismissedIds).add(contactId);
    _dismissedStore[contactId] = new Date().toISOString();
    writeDismissedRaw(JSON.stringify(_dismissedStore));
    notify();
  }
}

export function clearDismissedSuggestions(): void {
  _dismissedIds = new Set();
  _dismissedStore = {};
  writeDismissedRaw("{}");
  notify();
}

export function useDismissedSuggestions(): ReadonlySet<string> {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(getDismissedIds());
  useEffect(() => {
    let alive = true;
    const unsub = subscribe(() => { if (alive) setDismissed(getDismissedIds()); });
    // Async hydration (needed for native; no-op on web since sync hydration already ran)
    ensureDismissedAsync().then(() => {
      if (alive) setDismissed(getDismissedIds());
    });
    return () => { alive = false; unsub(); };
  }, []);
  return dismissed;
}

// ─── Scheduler Dates ─────────────────────────────────────────────────────────

export function getSchedulerDates(): Record<string, string> {
  return _schedulerDates;
}

export async function markContactSuggested(contactId: string): Promise<void> {
  await _markSuggested(contactId);
  _schedulerDates = await loadSchedulerData();
  notify();
}

export function useSchedulerDates(): Record<string, string> {
  const [dates, setDates] = useState<Record<string, string>>(_schedulerDates);
  useEffect(() => {
    let alive = true;
    function sync() { if (alive) setDates({ ..._schedulerDates }); }
    const unsub = subscribe(sync);
    loadSchedulerData().then((d) => {
      _schedulerDates = d;
      if (alive) setDates({ ...d });
    });
    return () => { alive = false; unsub(); };
  }, []);
  return dates;
}

// ─── Prompt Cache ─────────────────────────────────────────────────────────────

export function getCachedPrompt(contactId: string): string | undefined {
  return _promptCache.get(contactId);
}

export function setCachedPrompt(contactId: string, prompt: string): void {
  _promptCache.set(contactId, prompt);
}

export function clearPromptCache(): void {
  _promptCache = new Map();
}
