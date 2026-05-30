import type { Contact } from "./types";
import { getDaysSince, getDaysUntilBirthday } from "./helpers";

export type ReminderType = "birthday" | "check-in-quickpick" | "hangout-quickpick";

export interface Reminder {
  id: string;
  contactId: string;
  contactName: string;
  circleLevel: number;
  type: ReminderType;
  priority: number;
  title: string;
  subtitle: string;
  actionType?: "text" | "call" | "hangout";
}

export const CHECKIN_THRESHOLDS: Record<1 | 2 | 3, number> = { 1: 14, 2: 45, 3: 75 };
export const HANGOUT_THRESHOLDS: Record<1 | 2 | 3, number> = { 1: 21, 2: 60, 3: 90 };
export const ELEVATION_PUSH_DELAY_HOURS: Record<1 | 2 | 3, number> = { 1: 24, 2: 48, 3: 72 };
export const ELEVATION_CLEANUP_DAYS: Record<1 | 2 | 3, { checkin: number; hangout: number }> = {
  1: { checkin: 7, hangout: 10 },
  2: { checkin: 22, hangout: 30 },
  3: { checkin: 37, hangout: 45 },
};

function generateCircle1Reminders(contact: Contact): Reminder[] {
  const reminders: Reminder[] = [];
  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);

  if (daysUntil !== null) {
    if (daysUntil <= 1) {
      reminders.push({
        id: `birthday-0d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: 1,
        type: "birthday",
        priority: 200,
        title: `Today is ${contact.name}'s birthday — wish them a happy birthday!`,
        subtitle: "Today is their birthday",
      });
    } else if (daysUntil <= 7) {
      reminders.push({
        id: `birthday-7d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: 1,
        type: "birthday",
        priority: 190,
        title: `${contact.name}'s birthday is a week away — make sure you have everything sorted!`,
        subtitle: `Birthday in ${daysUntil} days`,
      });
    } else if (daysUntil <= 14) {
      reminders.push({
        id: `birthday-14d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: 1,
        type: "birthday",
        priority: 180,
        title: `${contact.name}'s birthday is 2 weeks away — is your gift and their birthday plans finalised?`,
        subtitle: `Birthday in ${daysUntil} days`,
      });
    } else if (daysUntil <= 30) {
      reminders.push({
        id: `birthday-30d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: 1,
        type: "birthday",
        priority: 170,
        title: `${contact.name}'s birthday is a month away — would you like to plan a surprise party or plan their gift?`,
        subtitle: `Birthday in ${Math.floor(daysUntil / 7)} weeks`,
      });
    }
  }

  const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
  if (daysSinceContact === null || daysSinceContact > CHECKIN_THRESHOLDS[1]) {
    const severity = daysSinceContact === null
      ? 80
      : Math.min(80, 30 + Math.floor((daysSinceContact - CHECKIN_THRESHOLDS[1]) * 3));
    reminders.push({
      id: `checkin-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: 1,
      type: "check-in-quickpick",
      priority: 100 + severity,
      title: `When did you last speak to ${contact.name}?`,
      subtitle: daysSinceContact === null
        ? "You haven't reached out yet"
        : `Last contact: ${daysSinceContact} days ago`,
    });
  }

  const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  if (daysSinceHangout !== null && daysSinceHangout > HANGOUT_THRESHOLDS[1]) {
    const weeksSince = Math.floor(daysSinceHangout / 7);
    const severity = Math.min(60, Math.floor((daysSinceHangout - HANGOUT_THRESHOLDS[1]) * 2));
    reminders.push({
      id: `hangout-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: 1,
      type: "hangout-quickpick",
      priority: 60 + severity,
      title: `When was the last time you intentionally set up a hangout with ${contact.name}?`,
      subtitle: `Last hangout: ${weeksSince} week${weeksSince !== 1 ? "s" : ""} ago`,
    });
  }

  return reminders;
}

function generateCircle2Reminders(contact: Contact): Reminder[] {
  const reminders: Reminder[] = [];

  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (daysUntil !== null) {
    if (daysUntil <= 1) {
      reminders.push({
        id: `birthday-0d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: 2,
        type: "birthday",
        priority: 150,
        title: `Today is ${contact.name}'s birthday — wish them a happy birthday!`,
        subtitle: "Today is their birthday",
      });
    } else if (daysUntil <= 7) {
      reminders.push({
        id: `birthday-7d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: 2,
        type: "birthday",
        priority: 140,
        title: `${contact.name}'s birthday is coming up in a week.`,
        subtitle: `Birthday in ${daysUntil} days`,
      });
    }
  }

  const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
  if (daysSinceContact === null || daysSinceContact > CHECKIN_THRESHOLDS[2]) {
    const severity = daysSinceContact === null
      ? 60
      : Math.min(60, 20 + Math.floor((daysSinceContact - CHECKIN_THRESHOLDS[2]) * 1.2));
    reminders.push({
      id: `checkin-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: 2,
      type: "check-in-quickpick",
      priority: 60 + severity,
      title: `When did you last speak to ${contact.name}?`,
      subtitle: daysSinceContact === null
        ? "You haven't reached out yet"
        : `Last contact: ${daysSinceContact} days ago`,
    });
  }

  const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  if (daysSinceHangout !== null && daysSinceHangout > HANGOUT_THRESHOLDS[2]) {
    const weeksSince = Math.floor(daysSinceHangout / 7);
    const severity = Math.min(50, Math.floor((daysSinceHangout - HANGOUT_THRESHOLDS[2]) * 0.8));
    reminders.push({
      id: `hangout-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: 2,
      type: "hangout-quickpick",
      priority: 50 + severity,
      title: `When did you last hang out with ${contact.name}?`,
      subtitle: `Last hangout: ${weeksSince} week${weeksSince !== 1 ? "s" : ""} ago`,
    });
  }

  return reminders;
}

function generateCircle3Reminders(contact: Contact): Reminder[] {
  const reminders: Reminder[] = [];

  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (daysUntil !== null && daysUntil <= 1) {
    reminders.push({
      id: `birthday-0d-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: 3,
      type: "birthday",
      priority: 70,
      title: `Today is ${contact.name}'s birthday.`,
      subtitle: "Today is their birthday",
    });
  }

  const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
  if (daysSinceContact !== null && daysSinceContact > CHECKIN_THRESHOLDS[3]) {
    const severity = Math.min(30, Math.floor((daysSinceContact - CHECKIN_THRESHOLDS[3]) * 0.4));
    reminders.push({
      id: `checkin-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: 3,
      type: "check-in-quickpick",
      priority: 30 + severity,
      title: `When did you last speak to ${contact.name}?`,
      subtitle: `Last contact: ${daysSinceContact} days ago`,
    });
  }

  const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  if (daysSinceHangout !== null && daysSinceHangout > HANGOUT_THRESHOLDS[3]) {
    const weeksSince = Math.floor(daysSinceHangout / 7);
    reminders.push({
      id: `hangout-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: 3,
      type: "hangout-quickpick",
      priority: 20,
      title: `When did you last hang out with ${contact.name}?`,
      subtitle: `Last hangout: ${weeksSince} week${weeksSince !== 1 ? "s" : ""} ago`,
    });
  }

  return reminders;
}

export function generateReminders(contacts: Contact[]): Reminder[] {
  const reminders: Reminder[] = [];

  for (const contact of contacts) {
    switch (contact.circleLevel) {
      case 1:
        reminders.push(...generateCircle1Reminders(contact));
        break;
      case 2:
        reminders.push(...generateCircle2Reminders(contact));
        break;
      case 3:
        reminders.push(...generateCircle3Reminders(contact));
        break;
    }
  }

  reminders.sort((a, b) => b.priority - a.priority);
  return reminders;
}
