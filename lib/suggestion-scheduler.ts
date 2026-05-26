import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SCHEDULER_KEY = "bridges_suggestion_scheduler_v2";

export const CIRCLE_COOLDOWN_DAYS: Record<1 | 2 | 3, number> = {
  1: 7,
  2: 3,
  3: 15,
};

export function isInCooldown(
  circleLevel: 1 | 2 | 3,
  daysSinceLastSuggested: number | null,
): boolean {
  if (daysSinceLastSuggested === null) return false;
  return daysSinceLastSuggested < CIRCLE_COOLDOWN_DAYS[circleLevel];
}

interface SchedulerData {
  lastSuggested: Record<string, string>;
}

let cache: SchedulerData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function getFromStorage(): string | null {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(SCHEDULER_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

function saveToStorage(raw: string): void {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(SCHEDULER_KEY, raw);
    } catch {}
  } else {
    AsyncStorage.setItem(SCHEDULER_KEY, raw).catch(() => {});
  }
}

async function loadFromAsyncStorage(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await AsyncStorage.getItem(SCHEDULER_KEY);
  } catch {
    return null;
  }
}

function ensureCache(): SchedulerData {
  if (!cache) {
    cache = { lastSuggested: {} };
    const raw = getFromStorage();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        cache = parsed;
      } catch {}
    }
  }
  return cache!;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (cache) saveToStorage(JSON.stringify(cache));
  }, 300);
}

export async function loadSchedulerData(): Promise<Record<string, string>> {
  if (!cache) {
    cache = { lastSuggested: {} };
    const raw = Platform.OS === "web" ? getFromStorage() : await loadFromAsyncStorage();
    if (raw) {
      try {
        cache = JSON.parse(raw);
      } catch {}
    }
  }
  return cache!.lastSuggested;
}

export function markSuggested(contactId: string): void {
  const data = ensureCache();
  data.lastSuggested[contactId] = new Date().toISOString();
  scheduleSave();
}

export function getDaysSinceLastSuggestedSync(
  contactId: string,
  lastSuggestedDates: Record<string, string>,
): number | null {
  const dateStr = lastSuggestedDates[contactId];
  if (!dateStr) return null;
  const last = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
}

export function scoreSuggestion(
  circleLevel: 1 | 2 | 3,
  daysSinceLastSuggested: number | null,
  daysSinceContact: number | null,
  daysUntilBirthday: number | null,
): number {
  let score = 0;

  if (circleLevel === 2) score += 2000;
  else if (circleLevel === 1) score += 1200;
  else score += 1000;

  if (daysSinceLastSuggested === null) {
    score += 400;
  } else {
    score += Math.min(daysSinceLastSuggested * 30, 400);
  }

  if (daysUntilBirthday !== null) {
    if (daysUntilBirthday <= 7) score += 250;
    else if (daysUntilBirthday <= 14) score += 120;
    else if (daysUntilBirthday <= 30) score += 50;
  }

  if (daysSinceContact !== null) {
    score += Math.min(daysSinceContact, 90);
  } else {
    score += 40;
  }

  return score;
}
