import React from "react";

const _dismissed = new Set<string>();
const _listeners: Array<() => void> = [];

function notify() {
  _listeners.forEach((l) => l());
}

export function dismissReminder(id: string) {
  _dismissed.add(id);
  notify();
}

export function clearDismissedReminders() {
  _dismissed.clear();
  notify();
}

export function useDismissedReminders(): Set<string> {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    _listeners.push(forceUpdate);
    return () => {
      const idx = _listeners.indexOf(forceUpdate);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }, []);
  return _dismissed;
}
