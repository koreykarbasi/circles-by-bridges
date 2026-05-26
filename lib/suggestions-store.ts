import { useState, useEffect } from "react";

let _dismissedIds = new Set<string>();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

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
    _listeners.add(sync);
    return () => { _listeners.delete(sync); };
    function sync() { setDismissed(getDismissedIds()); }
  }, []);
  return dismissed;
}
