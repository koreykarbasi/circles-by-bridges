import type { Contact } from "./types";
import { getDaysSince, getDaysUntilBirthday } from "./helpers";

export interface Reminder {
  id: string;
  contactId: string;
  contactName: string;
  circleLevel: number;
  type: "birthday" | "hangout-overdue" | "check-in-overdue" | "hangout-6month";
  priority: number;
  title: string;
  subtitle: string;
  actionType: "text" | "call" | "hangout";
}

function generateBirthdayReminders(contact: Contact, baseScore: number): Reminder[] {
  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (daysUntil === null || daysUntil > 30) return [];

  let proximityBonus = 0;
  let subtitle = "";

  if (daysUntil <= 1) {
    proximityBonus = 100;
    subtitle = daysUntil === 0 ? "Birthday is today!" : "Birthday is tomorrow!";
  } else if (daysUntil <= 3) {
    proximityBonus = 90;
    subtitle = `Birthday in ${daysUntil} days`;
  } else if (daysUntil <= 7) {
    proximityBonus = 75;
    subtitle = `Birthday in ${daysUntil} days`;
  } else if (daysUntil <= 14) {
    proximityBonus = 60;
    subtitle = `Birthday in ${Math.floor(daysUntil / 7)} week${daysUntil >= 14 ? "s" : ""}`;
  } else {
    proximityBonus = 50;
    subtitle = `Birthday in ${Math.floor(daysUntil / 7)} weeks`;
  }

  return [
    {
      id: `birthday-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "birthday",
      priority: baseScore + proximityBonus,
      title: `${contact.name}'s birthday is coming up`,
      subtitle,
      actionType: daysUntil <= 1 ? "call" : "text",
    },
  ];
}

function generateCircle1Reminders(contact: Contact): Reminder[] {
  const reminders: Reminder[] = [];
  const baseScore = 100;

  reminders.push(...generateBirthdayReminders(contact, baseScore));

  const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
  if (daysSinceContact === null || daysSinceContact > 7) {
    const severity = daysSinceContact === null ? 80 : Math.min(80, 30 + Math.floor((daysSinceContact - 7) * 3));
    const daysText = daysSinceContact === null ? "never" : `${daysSinceContact} days ago`;
    reminders.push({
      id: `checkin-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "check-in-overdue",
      priority: baseScore + severity,
      title: `Check in with ${contact.name}`,
      subtitle: daysSinceContact === null ? "You haven't reached out yet" : `Last contact: ${daysText}`,
      actionType: daysSinceContact !== null && daysSinceContact > 14 ? "call" : "text",
    });
  }

  return reminders;
}

function generateCircle2Reminders(contact: Contact): Reminder[] {
  const reminders: Reminder[] = [];
  const baseScore = 60;

  reminders.push(...generateBirthdayReminders(contact, baseScore));

  const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  if (daysSinceHangout !== null) {
    const weeksSince = Math.floor(daysSinceHangout / 7);
    let hangoutBonus = 0;
    let subtitle = "";

    if (weeksSince >= 15) {
      hangoutBonus = 95;
      subtitle = `Last hangout was ${weeksSince} weeks ago`;
    } else if (weeksSince >= 10) {
      hangoutBonus = 85;
      subtitle = `Last hangout was ${weeksSince} weeks ago`;
    } else if (weeksSince >= 5) {
      hangoutBonus = 70;
      subtitle = `Last hangout was ${weeksSince} weeks ago`;
    } else if (weeksSince >= 3) {
      hangoutBonus = 50;
      subtitle = `Last hangout was ${weeksSince} weeks ago`;
    }

    if (hangoutBonus > 0) {
      reminders.push({
        id: `hangout-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: contact.circleLevel,
        type: "hangout-overdue",
        priority: baseScore + hangoutBonus,
        title: `Plan a hangout with ${contact.name}`,
        subtitle,
        actionType: "hangout",
      });
    }
  } else {
    reminders.push({
      id: `hangout-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "hangout-overdue",
      priority: baseScore + 50,
      title: `Plan a hangout with ${contact.name}`,
      subtitle: "You haven't hung out yet",
      actionType: "hangout",
    });
  }

  const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
  if (daysSinceContact === null || daysSinceContact > 30) {
    const severity = daysSinceContact === null ? 60 : Math.min(80, 30 + Math.floor((daysSinceContact - 30) * 1.5));
    const daysText = daysSinceContact === null ? "never" : `${daysSinceContact} days ago`;
    reminders.push({
      id: `checkin-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "check-in-overdue",
      priority: baseScore + severity,
      title: `Reach out to ${contact.name}`,
      subtitle: daysSinceContact === null ? "You haven't reached out yet" : `Last contact: ${daysText}`,
      actionType: daysSinceContact !== null && daysSinceContact > 60 ? "call" : "text",
    });
  }

  return reminders;
}

function generateCircle3Reminders(contact: Contact): Reminder[] {
  // Circle 3: ONLY birthday reminder, and ONLY on the actual day itself
  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (daysUntil !== 0) return [];

  return [
    {
      id: `birthday-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "birthday",
      priority: 70,
      title: `It's ${contact.name}'s birthday today`,
      subtitle: "Today is their birthday",
      actionType: "text",
    },
  ];
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
