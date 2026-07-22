import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Contact } from "./types";

const REMINDER_NOTIFS_KEY = "bridges_reminder_notifs_v1";
const SUGGESTION_NUDGE_KEY = "bridges_suggestion_nudge_v2";

interface ReminderNotifEntry {
  notifId: string;
  scheduledFor: string;
}

interface SuggestionNudgeEntry {
  notifId: string;
  scheduledFor: string;
  topContactId: string | null;
  /** Prompt text used in the last scheduled nudge — used to advance the rotation the next day. */
  prompt?: string;
}

async function loadReminderEntries(): Promise<Record<string, ReminderNotifEntry>> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_NOTIFS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReminderNotifEntry>) : {};
  } catch {
    return {};
  }
}

async function saveReminderEntries(entries: Record<string, ReminderNotifEntry>): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDER_NOTIFS_KEY, JSON.stringify(entries));
  } catch {}
}

async function cancelNotif(notifId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {}
}

// Module-level serialization: ensures concurrent callers don't race on the
// AsyncStorage read-then-write inside scheduleReminderNotifications.
let reminderScheduleInFlight: Promise<void> | null = null;

/**
 * Schedules local notifications for all active reminders (birthday milestones,
 * custom date reminders, overdue check-ins, overdue hangouts). Derives notifications
 * from the same logic as generateReminders() in lib/reminders.ts so thresholds are
 * always in sync. Mirrors the elevation pattern: deduplicates via AsyncStorage,
 * caps at MAX_REMINDER_NOTIFS, cancels stale entries. No-ops on web.
 *
 * Concurrent calls are serialized: if a call is already in progress, the new call
 * waits for it to finish and then runs itself so it uses the freshest contacts data.
 */
export async function scheduleReminderNotifications(contacts: Contact[]): Promise<void> {
  if (Platform.OS === "web") return;

  // Server-side push (server/push-notifications.ts) is now the single source of
  // truth for reminder push notifications — it runs hourly and delivers even when
  // the app is closed/killed. Scheduling local OS notifications here in parallel
  // used to cause duplicate/triplicate notifications for the same reminder, since
  // neither system knew about the other. We keep this function around (no-op after
  // one-time cleanup) so existing call sites don't need to change.
  if (reminderScheduleInFlight) {
    await reminderScheduleInFlight;
  }

  let resolve!: () => void;
  reminderScheduleInFlight = new Promise<void>((res) => { resolve = res; });
  try {
    await _cancelAllLocalReminderNotifications();
  } finally {
    reminderScheduleInFlight = null;
    resolve();
  }
}

/**
 * Schedules a test notification 5 seconds from now so the user can verify
 * that push notifications are wired up correctly on their device.
 * No-ops on web.
 */
export async function sendTestNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Bridges",
      body: "Bridges notifications are working",
      data: { url: "/" },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}

async function _cancelAllLocalReminderNotifications(): Promise<void> {
  const existing = await loadReminderEntries();
  for (const entry of Object.values(existing)) {
    await cancelNotif(entry.notifId);
  }
  await saveReminderEntries({});
}

// Serialization lock for scheduleSuggestionNudge — same pattern as reminder
// scheduling to prevent duplicate notifications when multiple tabs mount simultaneously.
let nudgeScheduleInFlight: Promise<void> | null = null;

/**
 * Schedules (or cancels) the daily suggestion nudge local notification.
 * Fires at 9am (morning) or 5pm (afternoon) based on user preference.
 * Personalized with the top-scored suggestion contact's name when contacts are provided.
 * Picks a fresh prompt each day — if the same contact stays top-ranked, getNextPrompt
 * is used to advance past yesterday's copy so the body text never repeats.
 * Skips rescheduling only when the same day+hour slot AND the same top contact are
 * already stored (dedup). Changing preferred time mid-day still triggers a reschedule.
 * No-ops on web.
 *
 * Only call this from ONE place (index.tsx) to avoid duplicate notifications.
 * Concurrent calls are serialized via nudgeScheduleInFlight.
 */
export async function scheduleSuggestionNudge(
  frequency: string | null | undefined,
  preferredTime: string | null | undefined,
  contacts?: Contact[],
): Promise<void> {
  if (Platform.OS === "web") return;

  // Server-side push (server/push-notifications.ts sendSuggestionNudges) is now the
  // single source of truth for suggestion nudge notifications — it already rotates
  // across the top-scored contacts and runs regardless of app state. Scheduling a
  // local OS notification here in parallel used to cause duplicate/truncated nudge
  // notifications alongside the real push. This function now just cancels any
  // previously-scheduled local nudge so old installs don't keep firing stale ones.
  if (nudgeScheduleInFlight) {
    await nudgeScheduleInFlight;
    return; // Let the first caller do the work; subsequent callers skip.
  }

  let resolve!: () => void;
  nudgeScheduleInFlight = new Promise<void>((res) => { resolve = res; });
  try {
    const raw = await AsyncStorage.getItem(SUGGESTION_NUDGE_KEY);
    if (raw) {
      try {
        const entry = JSON.parse(raw) as SuggestionNudgeEntry;
        await cancelNotif(entry.notifId);
      } catch {}
      await AsyncStorage.removeItem(SUGGESTION_NUDGE_KEY).catch(() => {});
    }
  } finally {
    nudgeScheduleInFlight = null;
    resolve();
  }
}
