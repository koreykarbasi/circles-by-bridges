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
  actionType?: "text" | "call" | "hangout";
}

function generateCircle1Reminders(contact: Contact): Reminder[] {
  const reminders: Reminder[] = [];
  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);

  if (daysUntil !== null) {
    if (daysUntil === 0) {
      reminders.push({
        id: `birthday-0d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: contact.circleLevel,
        type: "birthday",
        priority: 200,
        title: `Today is ${contact.name}'s birthday — wish them a happy birthday!`,
        subtitle: "Today is their birthday",
      });
    } else if (daysUntil === 1) {
      reminders.push({
        id: `birthday-0d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: contact.circleLevel,
        type: "birthday",
        priority: 198,
        title: `${contact.name}'s birthday is tomorrow`,
        subtitle: "Tomorrow is their birthday",
      });
    } else if (daysUntil <= 7) {
      reminders.push({
        id: `birthday-7d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: contact.circleLevel,
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
        circleLevel: contact.circleLevel,
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
        circleLevel: contact.circleLevel,
        type: "birthday",
        priority: 170,
        title: `${contact.name}'s birthday is a month away. Would you like to plan something special?`,
        subtitle: `Birthday in ${Math.floor(daysUntil / 7)} weeks`,
      });
    }
  }

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
      priority: 100 + severity,
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

  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (daysUntil !== null) {
    if (daysUntil === 0) {
      reminders.push({
        id: `birthday-0d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: contact.circleLevel,
        type: "birthday",
        priority: 150,
        title: `Today is ${contact.name}'s birthday — wish them a happy birthday!`,
        subtitle: "Today is their birthday",
      });
    } else if (daysUntil === 1) {
      reminders.push({
        id: `birthday-0d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: contact.circleLevel,
        type: "birthday",
        priority: 148,
        title: `${contact.name}'s birthday is tomorrow`,
        subtitle: "Tomorrow is their birthday",
      });
    } else if (daysUntil <= 7) {
      reminders.push({
        id: `birthday-7d-${contact.id}`,
        contactId: contact.id,
        contactName: contact.name,
        circleLevel: contact.circleLevel,
        type: "birthday",
        priority: 140,
        title: `${contact.name}'s birthday is coming up in a week.`,
        subtitle: `Birthday in ${daysUntil} days`,
      });
    }
  }

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
    const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
    const isNewContact = daysSinceContact === null || daysSinceContact < 7;
    if (!isNewContact) {
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
  const reminders: Reminder[] = [];

  const daysUntil = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (daysUntil === 0) {
    reminders.push({
      id: `birthday-0d-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "birthday",
      priority: 70,
      title: `Today is ${contact.name}'s birthday.`,
      subtitle: "Today is their birthday",
    });
  } else if (daysUntil === 1) {
    reminders.push({
      id: `birthday-0d-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "birthday",
      priority: 68,
      title: `${contact.name}'s birthday is tomorrow.`,
      subtitle: "Tomorrow is their birthday",
    });
  }

  const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
  const hangoutOverdue =
    daysSinceHangout !== null
      ? daysSinceHangout > 60
      : daysSinceContact !== null && daysSinceContact > 45;
  if (hangoutOverdue) {
    reminders.push({
      id: `hangout-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "hangout-overdue",
      priority: 45,
      title: `Plan a hangout with ${contact.name}`,
      subtitle:
        daysSinceHangout !== null
          ? `Last hangout was ${Math.floor(daysSinceHangout / 7)} weeks ago`
          : "You haven't hung out with them yet",
      actionType: "hangout",
    });
  }

  if (daysSinceContact !== null && daysSinceContact > 90) {
    reminders.push({
      id: `checkin-${contact.id}`,
      contactId: contact.id,
      contactName: contact.name,
      circleLevel: contact.circleLevel,
      type: "check-in-overdue",
      priority: 35,
      title: `Reach out to ${contact.name}`,
      subtitle: `Last contact: ${daysSinceContact} days ago`,
      actionType: "call",
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
