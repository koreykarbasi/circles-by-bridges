import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "bridges_hints_seen_v1";

export type HintId =
  | "home_profile"
  | "home_reminders"
  | "home_suggestions"
  | "circles_viz"
  | "circles_calendar"
  | "suggestions_filter"
  | "suggestions_actions"
  | "hangouts_intro"
  | "create_hangout_survey"
  | "edit_custom_reminder"
  | "edit_labels"
  | "import_enrichment_dot";

export const HINT_TEXT: Record<HintId, string> = {
  home_profile:
    "Your profile lives up here — add a photo, view your circle stats, or replay the walkthrough anytime.",
  home_reminders:
    "Reminders are your priority to-dos — birthdays, overdue check-ins, and hangout nudges. Tap the checkmark to cross each one off.",
  home_suggestions:
    "Suggestions are proactive outreach ideas. Tap the action icons on each card to call, text, or plan a hangout.",
  circles_viz:
    "Your contacts orbit you by closeness. Tap any person to open their card and reach out.",
  circles_calendar:
    "The calendar icon in the header lets you plan a group hangout and invite people from your circles.",
  suggestions_filter:
    "Use the filter pills to focus on a specific circle — Core, Close Friends, or Friends.",
  suggestions_actions:
    "Tap the shuffle icon on a card to get a different prompt. Tap the action button to call, text, or plan a hangout.",
  hangouts_intro:
    "Plan a hangout here and share a voting link. Guests rank their favourite times and activities — Bridges picks the best option.",
  create_hangout_survey:
    "Add multiple time slots and activity options. Your guests vote on their favourites, so everyone agrees without a group chat.",
  edit_custom_reminder:
    "Tap 'Add reminder' to set a custom reminder for any date — anniversaries, events, anything personal to this friendship.",
  edit_labels:
    "Labels like 'Childhood Friend' or 'Work Friend' help Bridges personalise the suggestions it gives you for this contact.",
  import_enrichment_dot:
    "Add labels to contacts to get better suggestions — look for the yellow dot on their card.",
};

// In-memory cache so reads are instant after the first async load
let _cache: Set<string> | null = null;

async function loadCache(): Promise<Set<string>> {
  if (_cache) return _cache;
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = localStorage.getItem(STORAGE_KEY);
    } else {
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    }
    _cache = raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    _cache = new Set();
  }
  return _cache;
}

function persist(cache: Set<string>): void {
  const raw = JSON.stringify([...cache]);
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, raw);
    } else {
      AsyncStorage.setItem(STORAGE_KEY, raw).catch(() => {});
    }
  } catch {}
}

export async function markHintSeen(id: HintId): Promise<void> {
  const cache = await loadCache();
  cache.add(id);
  persist(cache);
}

export async function resetAllHints(): Promise<void> {
  _cache = new Set();
  persist(_cache);
}

/**
 * Shows hints in sequence. Pass an ordered array of hint IDs.
 * The first unseen hint in the list is shown; dismissing it advances to the next.
 * Returns [activeHintId | null, dismiss].
 */
export function useSequentialHints(ids: HintId[]): [HintId | null, () => void] {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCache().then((cache) => {
      if (cancelled) return;
      for (let i = 0; i < ids.length; i++) {
        if (!cache.has(ids[i])) {
          setActiveIndex(i);
          return;
        }
      }
      setActiveIndex(null);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  const dismiss = useCallback(() => {
    setActiveIndex((current) => {
      if (current === null) return null;
      markHintSeen(ids[current]);
      // Advance to next unseen hint
      loadCache().then((cache) => {
        for (let i = current + 1; i < ids.length; i++) {
          if (!cache.has(ids[i])) {
            setActiveIndex(i);
            return;
          }
        }
        setActiveIndex(null);
      });
      return null;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  const activeHintId = activeIndex !== null ? ids[activeIndex] : null;
  return [activeHintId, dismiss];
}
