import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Contact } from "./types";
import { getDaysUntilBirthday } from "./helpers";

const REMINDER_NOTIFS_KEY = "bridges_reminder_notifs_v1";
const SUGGESTION_NUDGE_KEY = "bridges_suggestion_nudge_v1";
const MAX_REMINDER_NOTIFS = 10;

interface ReminderNotifEntry {
  notifId: string;
  scheduledFor: string;
}

interface SuggestionNudgeEntry {
  notifId: string;
  scheduledFor: string;
}

// Returns the next 9am as a Date. If it's already past 9am today, returns tomorrow at 9am.
function nextNineAm(): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(9, 0, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

// Returns the next occurrence of preferredHour:00. If already past today, returns tomorrow.
function nextPreferredTime(preferredHour: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(preferredHour, 0, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

// "2026-06-30T09" — hour-level granularity used for dedup comparisons
function hourKey(date: Date): string {
  return date.toISOString().slice(0, 13);
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

interface LocalNotifMessage {
  id: string;
  title: string;
  body: string;
  contactId?: string;
}

function buildBirthdayMessages(contact: Contact): LocalNotifMessage[] {
  const msgs: LocalNotifMessage[] = [];
  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (daysUntil === null) return msgs;

  if (contact.circleLevel === 1) {
    if (daysUntil === 0) {
      msgs.push({ id: `bday-0d-${contact.id}`, title: `Happy birthday, ${contact.name}!`, body: `Today is ${contact.name}'s birthday — wish them a happy birthday!`, contactId: contact.id });
    } else if (daysUntil === 7) {
      msgs.push({ id: `bday-7d-${contact.id}`, title: `${contact.name}'s birthday is coming up`, body: `${contact.name}'s birthday is a week away — make sure you have everything sorted!`, contactId: contact.id });
    } else if (daysUntil === 14) {
      msgs.push({ id: `bday-14d-${contact.id}`, title: `${contact.name}'s birthday in 2 weeks`, body: `${contact.name}'s birthday is 2 weeks away — is your gift and their birthday plans finalised?`, contactId: contact.id });
    } else if (daysUntil === 30) {
      msgs.push({ id: `bday-30d-${contact.id}`, title: `${contact.name}'s birthday is a month away`, body: `${contact.name}'s birthday is coming up — would you like to plan a surprise party or plan their gift?`, contactId: contact.id });
    }
  } else if (contact.circleLevel === 2) {
    if (daysUntil === 0) {
      msgs.push({ id: `bday-0d-${contact.id}`, title: `Happy birthday, ${contact.name}!`, body: `Today is ${contact.name}'s birthday — wish them a happy birthday!`, contactId: contact.id });
    } else if (daysUntil === 7) {
      msgs.push({ id: `bday-7d-${contact.id}`, title: `${contact.name}'s birthday is coming up`, body: `${contact.name}'s birthday is coming up in a week.`, contactId: contact.id });
    }
  } else if (contact.circleLevel === 3) {
    if (daysUntil === 0) {
      msgs.push({ id: `bday-0d-${contact.id}`, title: `${contact.name}'s birthday`, body: `Today is ${contact.name}'s birthday.`, contactId: contact.id });
    }
  }

  return msgs;
}

function buildCustomReminderMessages(contact: Contact): LocalNotifMessage[] {
  const msgs: LocalNotifMessage[] = [];
  const customReminders = contact.customReminders ?? [];

  const milestones: Record<number, number[]> = { 1: [0, 7, 14, 30], 2: [0, 7], 3: [0] };
  const allowed = milestones[contact.circleLevel as 1 | 2 | 3] ?? [0];

  for (const cr of customReminders) {
    if (!cr.label || !cr.date) continue;
    const daysUntil = getDaysUntilBirthday(cr.date);
    if (daysUntil === null || !allowed.includes(daysUntil)) continue;

    const safeLabel = cr.label.trim();
    const idBase = `custom-${contact.id}-${safeLabel.replace(/\s+/g, "-").toLowerCase()}`;

    if (daysUntil === 0) {
      msgs.push({ id: `${idBase}-0d`, title: `${safeLabel} — ${contact.name}`, body: `Today is ${contact.name}'s ${safeLabel}.`, contactId: contact.id });
    } else if (daysUntil === 7) {
      msgs.push({ id: `${idBase}-7d`, title: `${contact.name}'s ${safeLabel} is coming up`, body: `${contact.name}'s ${safeLabel} is a week away.`, contactId: contact.id });
    } else if (daysUntil === 14) {
      msgs.push({ id: `${idBase}-14d`, title: `${contact.name}'s ${safeLabel} in 2 weeks`, body: `${contact.name}'s ${safeLabel} is 2 weeks away.`, contactId: contact.id });
    } else if (daysUntil === 30) {
      msgs.push({ id: `${idBase}-30d`, title: `${contact.name}'s ${safeLabel} is a month away`, body: `${contact.name}'s ${safeLabel} is coming up in a month.`, contactId: contact.id });
    }
  }

  return msgs;
}

/**
 * Schedules local notifications for birthday milestones and custom date reminders.
 * Mirrors the elevation pattern: deduplicates via AsyncStorage, caps at MAX_REMINDER_NOTIFS.
 * Only birthday and custom-date reminders are scheduled here — overdue check-ins/hangouts
 * are handled by the elevation mechanism in checkin-state.ts.
 * No-ops on web (local notifications not supported).
 */
export async function scheduleReminderNotifications(contacts: Contact[]): Promise<void> {
  if (Platform.OS === "web") return;

  const targetTime = nextNineAm();
  const targetHour = hourKey(targetTime);
  const existing = await loadReminderEntries();

  const wanted: LocalNotifMessage[] = [];
  for (const contact of contacts) {
    wanted.push(...buildBirthdayMessages(contact));
    wanted.push(...buildCustomReminderMessages(contact));
  }

  const toSchedule = wanted.slice(0, MAX_REMINDER_NOTIFS);
  const wantedIds = new Set(toSchedule.map((m) => m.id));

  // Cancel notifications that are no longer relevant
  for (const [id, entry] of Object.entries(existing)) {
    if (!wantedIds.has(id)) {
      await cancelNotif(entry.notifId);
      delete existing[id];
    }
  }

  // Schedule new or rescheduled notifications
  for (const msg of toSchedule) {
    const prev = existing[msg.id];
    if (prev && prev.scheduledFor.slice(0, 13) === targetHour) {
      continue; // Already scheduled for this hour — skip
    }
    if (prev) {
      await cancelNotif(prev.notifId);
    }
    try {
      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: msg.title,
          body: msg.body,
          sound: true,
          data: msg.contactId ? { contactId: msg.contactId } : {},
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: targetTime,
        },
      });
      existing[msg.id] = { notifId, scheduledFor: targetTime.toISOString() };
    } catch {}
  }

  await saveReminderEntries(existing);
}

/**
 * Schedules (or cancels) the daily suggestion nudge local notification.
 * Fires at 9am (morning preference) or 5pm (afternoon preference).
 * Skips if already scheduled for the same hour slot today/tomorrow.
 * No-ops on web.
 */
export async function scheduleSuggestionNudge(
  frequency: string | null | undefined,
  preferredTime: string | null | undefined,
): Promise<void> {
  if (Platform.OS === "web") return;

  if (!frequency || frequency === "off") {
    const raw = await AsyncStorage.getItem(SUGGESTION_NUDGE_KEY);
    if (raw) {
      try {
        const entry = JSON.parse(raw) as SuggestionNudgeEntry;
        await cancelNotif(entry.notifId);
      } catch {}
      await AsyncStorage.removeItem(SUGGESTION_NUDGE_KEY).catch(() => {});
    }
    return;
  }

  const preferredHour = preferredTime === "afternoon" ? 17 : 9;
  const targetTime = nextPreferredTime(preferredHour);
  const targetHour = hourKey(targetTime);

  const raw = await AsyncStorage.getItem(SUGGESTION_NUDGE_KEY);
  if (raw) {
    try {
      const entry = JSON.parse(raw) as SuggestionNudgeEntry;
      if (entry.scheduledFor.slice(0, 13) === targetHour) {
        return; // Already scheduled for the right slot
      }
      await cancelNotif(entry.notifId);
    } catch {}
  }

  try {
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Time to reach out",
        body: "Open Bridges to see today's suggestion.",
        sound: true,
        data: {},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetTime,
      },
    });
    const entry: SuggestionNudgeEntry = { notifId, scheduledFor: targetTime.toISOString() };
    await AsyncStorage.setItem(SUGGESTION_NUDGE_KEY, JSON.stringify(entry));
  } catch {}
}
