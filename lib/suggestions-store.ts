import { useState, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CIRCLE_COOLDOWN_DAYS,
  loadSchedulerData,
  markSuggested as _markSuggested,
} from "./suggestion-scheduler";
import { apiRequest } from "./query-client";

// Dismissed IDs persist for the paid circle-specific cooldown.
const DISMISSED_PERSIST_KEY = "bridges_dismissed_suggestions_v1";
const PENDING_SERVER_DISMISSALS_KEY = "bridges_pending_suggestion_dismissals_v1";

interface DismissedEntry {
  dismissedAt: string;
  circleLevel: 1 | 2 | 3;
}

type DismissedStore = Record<string, DismissedEntry>;

// Always replaced (never mutated) so React's Object.is dependency checks fire.
let _dismissedIds: ReadonlySet<string> = new Set<string>();
let _dismissedStore: DismissedStore = {};
let _dismissedLoaded = false;
// Dismissals queued before async hydration completes — merged in afterward.
let _pendingDismissals: DismissedStore = {};

let _schedulerDates: Record<string, string> = {};
let _promptCache = new Map<string, string>();
const _listeners = new Set<() => void>();
let _dismissalSyncChain: Promise<boolean> = Promise.resolve(true);

function notify() {
  _listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

function readDismissedSync(): string | null {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(DISMISSED_PERSIST_KEY); } catch { return null; }
  }
  return null;
}

function writeDismissed(data: DismissedStore): void {
  const raw = JSON.stringify(data);
  if (Platform.OS === "web") {
    try { localStorage.setItem(DISMISSED_PERSIST_KEY, raw); } catch {}
  } else {
    AsyncStorage.setItem(DISMISSED_PERSIST_KEY, raw).catch(() => {});
  }
}

async function readDismissedAsync(): Promise<string | null> {
  if (Platform.OS === "web") return readDismissedSync();
  try { return await AsyncStorage.getItem(DISMISSED_PERSIST_KEY); } catch { return null; }
}

async function readPendingServerDismissals(): Promise<Record<string, true>> {
  try {
    const raw =
      Platform.OS === "web"
        ? localStorage.getItem(PENDING_SERVER_DISMISSALS_KEY)
        : await AsyncStorage.getItem(PENDING_SERVER_DISMISSALS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writePendingServerDismissals(pending: Record<string, true>): Promise<void> {
  const raw = JSON.stringify(pending);
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(PENDING_SERVER_DISMISSALS_KEY, raw);
    } catch {}
  } else {
    await AsyncStorage.setItem(PENDING_SERVER_DISMISSALS_KEY, raw).catch(() => {});
  }
}

function parseDismissedStore(raw: string): DismissedStore {
  try {
    const parsed = JSON.parse(raw) as Record<string, DismissedEntry | string>;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([contactId, value]) => {
          const entry: DismissedEntry =
            typeof value === "string"
              ? { dismissedAt: value, circleLevel: 3 }
              : value;
          return [contactId, entry] as const;
        })
        .filter(([, entry]) => {
          const ageMs = now - new Date(entry.dismissedAt).getTime();
          return ageMs < CIRCLE_COOLDOWN_DAYS[entry.circleLevel] * 86_400_000;
        }),
    );
  } catch {
    return {};
  }
}

function applyStore(store: DismissedStore): void {
  // Merge: in-memory session entries take precedence over stored data.
  _dismissedStore = { ...store, ..._dismissedStore };
  const next = new Set(_dismissedIds);
  for (const id of Object.keys(store)) next.add(id);
  _dismissedIds = next; // new reference so React detects the change
}

function ensureDismissedSync(): void {
  if (_dismissedLoaded || Platform.OS !== "web") return;
  _dismissedLoaded = true;
  const raw = readDismissedSync();
  if (raw) applyStore(parseDismissedStore(raw));
}

async function ensureDismissedAsync(): Promise<void> {
  if (_dismissedLoaded) return;
  _dismissedLoaded = true;
  const raw = await readDismissedAsync();
  const stored = raw ? parseDismissedStore(raw) : {};
  if (Object.keys(_pendingDismissals).length > 0) {
    // Merge stored data with any dismissals that arrived before hydration.
    const merged = { ...stored, ..._pendingDismissals };
    _pendingDismissals = {};
    applyStore(merged);
    writeDismissed(_dismissedStore);
  } else {
    applyStore(stored);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getDismissedIds(): ReadonlySet<string> {
  ensureDismissedSync();
  return _dismissedIds;
}

export function dismissSuggestion(
  contactId: string,
  circleLevel: 1 | 2 | 3 = 3,
): void {
  ensureDismissedSync();
  if (_dismissedIds.has(contactId)) return;
  const next = new Set(_dismissedIds);
  next.add(contactId);
  _dismissedIds = next; // new reference
  const entry: DismissedEntry = {
    dismissedAt: new Date().toISOString(),
    circleLevel,
  };
  if (_dismissedLoaded) {
    _dismissedStore[contactId] = entry;
    writeDismissed(_dismissedStore);
  } else {
    // Hydration not yet complete — queue for later so we don't overwrite stored entries.
    _pendingDismissals[contactId] = entry;
  }
  notify();
}

async function syncPendingServerDismissals(contactId?: string): Promise<boolean> {
  const pending = await readPendingServerDismissals();
  if (contactId) pending[contactId] = true;
  await writePendingServerDismissals(pending);

  let allSynced = true;
  for (const pendingContactId of Object.keys(pending)) {
    try {
      await apiRequest("POST", "/api/suggestions/dismiss", {
        contactId: pendingContactId,
      });
      delete pending[pendingContactId];
    } catch {
      allSynced = false;
    }
  }
  await writePendingServerDismissals(pending);
  return allSynced;
}

export function persistSuggestionDismissal(contactId: string): Promise<boolean> {
  _dismissalSyncChain = _dismissalSyncChain.then(() =>
    syncPendingServerDismissals(contactId),
  );
  return _dismissalSyncChain;
}

export function flushPendingSuggestionDismissals(): Promise<boolean> {
  _dismissalSyncChain = _dismissalSyncChain.then(() =>
    syncPendingServerDismissals(),
  );
  return _dismissalSyncChain;
}

export function clearDismissedSuggestions(): void {
  _dismissedIds = new Set();
  _dismissedStore = {};
  _pendingDismissals = {};
  if (Platform.OS === "web") {
    try { localStorage.removeItem(DISMISSED_PERSIST_KEY); } catch {}
  } else {
    AsyncStorage.removeItem(DISMISSED_PERSIST_KEY).catch(() => {});
  }
  notify();
}

export function useDismissedSuggestions(): ReadonlySet<string> {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(getDismissedIds());
  useEffect(() => {
    let alive = true;
    function refresh() { if (alive) setDismissed(_dismissedIds); } // already a new ref
    const unsub = subscribe(refresh);
    ensureDismissedAsync().then(() => {
      if (alive) setDismissed(_dismissedIds);
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
