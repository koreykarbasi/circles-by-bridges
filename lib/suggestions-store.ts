import { useState, useEffect } from "react";
import { loadSchedulerData, markSuggested as _markSuggested } from "./suggestion-scheduler";

let _dismissedIds = new Set<string>();
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

// ─── Dismissed IDs ────────────────────────────────────────────────────────────

export function getDismissedIds(): ReadonlySet<string> {
  return _dismissedIds;
}

export function dismissSuggestion(contactId: string): void {
  if (!_dismissedIds.has(contactId)) {
    _dismissedIds = new Set(_dismissedIds).add(contactId);
    notify();
  }
}

export function clearDismissedSuggestions(): void {
  _dismissedIds = new Set();
  notify();
}

export function useDismissedSuggestions(): ReadonlySet<string> {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(getDismissedIds());
  useEffect(() => {
    return subscribe(() => setDismissed(getDismissedIds()));
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
