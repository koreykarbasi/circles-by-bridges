import type { Contact } from "./types";
import { getDaysSince, getDaysUntilBirthday, formatLastContacted } from "./helpers";

export type ReminderType =
  | "birthday"
  | "check-in-quickpick"
  | "hangout-quickpick"
  | "custom-reminder"
  | "profile-completion-high"
  | "profile-completion-medium"
  | "profile-completion-low";

export interface Reminder {
  id: string;
  contactId?: string;
  contactName: string;
  circleLevel: number;
  type: ReminderType;
  priority: number;
  title: string;
  subtitle: string;
  actionType?: "text" | "call" | "hangout";
  suggestedMessage?: string;
  persistent?: boolean;
}

export const CHECKIN_THRESHOLDS: Record<1 | 2 | 3, number> = { 1: 14, 2: 45, 3: 75 };
export const HANGOUT_THRESHOLDS: Record<1 | 2 | 3, number> = { 1: 21, 2: 60, 3: 90 };
export const ELEVATION_PUSH_DELAY_HOURS: Record<1 | 2 | 3, number> = { 1: 24, 2: 48, 3: 72 };
export const ELEVATION_CLEANUP_DAYS: Record<1 | 2 | 3, { checkin: number; hangout: number }> = {
  1: { checkin: 6, hangout: 6 },
  2: { checkin: 7, hangout: 7 },
  3: { checkin: 8, hangout: 8 },
};

// Priority baselines for custom reminders per circle (equivalent to birthday priorities)
const CUSTOM_REMINDER_PRIORITIES: Record<1 | 2 | 3, { today: number; week: number; twoWeek: number; month: number }> = {
  1: { today: 200, week: 190, twoWeek: 180, month: 170 },
  2: { today: 150, week: 140, twoWeek: 140, month: 140 },
  3: { today: 70, week: 70, twoWeek: 70, month: 70 },
};

function generateCustomReminders(contact: Contact, circleLevel: 1 | 2 | 3): Reminder[] {
  const reminders: Reminder[] = [];
  const customReminders = contact.customReminders ?? [];
  const priorities = CUSTOM_REMINDER_PRIORITIES[circleLevel];

  for (const cr of customReminders) {
    if (!cr.label || !cr.date) continue;
    const daysUntil = getDaysUntilBirthday(cr.date);
    if (daysUntil === null) continue;

    const safeLabel = cr.label.trim();
    const idBase = `custom-${contact.id}-${safeLabel.replace(/\s+/g, "-").toLowerCase()}`;

    // Circle 1: advance notice at 30d/14d/7d/day-of
    // Circle 2: advance notice at 7d/day-of
    // Circle 3: day-of only
    if (circleLevel === 1) {
      if (daysUntil <= 1) {
        reminders.push({
          id: `${idBase}-0d`,
          contactId: contact.id,
          contactName: contact.name,
          circleLevel,
          type: "custom-reminder",
          priority: priorities.today,
          title: `Today is ${contact.name}'s ${safeLabel}`,
          subtitle: "Today",
        });
      } else if (daysUntil <= 7) {
        reminders.push({
          id: `${idBase}-7d`,
          contactId: contact.id,
          contactName: contact.name,
          circleLevel,
          type: "custom-reminder",
          priority: priorities.week,
          title: `${contact.name}'s ${safeLabel} is in ${daysUntil} days`,
          subtitle: `Coming up in ${daysUntil} days`,
        });
      } else if (daysUntil <= 14) {
        reminders.push({
          id: `${idBase}-14d`,
          contactId: contact.id,
          contactName: contact.name,
          circleLevel,
          type: "custom-reminder",
          priority: priorities.twoWeek,
          title: `${contact.name}'s ${safeLabel} is 2 weeks away`,
          subtitle: `In ${daysUntil} days`,
        });
      } else if (daysUntil <= 30) {
        reminders.push({
          id: `${idBase}-30d`,
          contactId: contact.id,
          contactName: contact.name,
          circleLevel,
          type: "custom-reminder",
          priority: priorities.month,
          title: `${contact.name}'s ${safeLabel} is coming up`,
          subtitle: `In ${Math.floor(daysUntil / 7)} weeks`,
        });
      }
    } else if (circleLevel === 2) {
      if (daysUntil <= 1) {
        reminders.push({
          id: `${idBase}-0d`,
          contactId: contact.id,
          contactName: contact.name,
          circleLevel,
          type: "custom-reminder",
          priority: priorities.today,
          title: `Today is ${contact.name}'s ${safeLabel}`,
          subtitle: "Today",
        });
      } else if (daysUntil <= 7) {
        reminders.push({
          id: `${idBase}-7d`,
          contactId: contact.id,
          contactName: contact.name,
          circleLevel,
          type: "custom-reminder",
          priority: priorities.week,
          title: `${contact.name}'s ${safeLabel} is coming up in a week`,
          subtitle: `In ${daysUntil} days`,
        });
      }
    } else {
      // Circle 3: day-of only
      if (daysUntil <= 1) {
        reminders.push({
          id: `${idBase}-0d`,
          contactId: contact.id,
          contactName: contact.name,
          circleLevel,
          type: "custom-reminder",
          priority: priorities.today,
          title: `Today is ${contact.name}'s ${safeLabel}`,
          subtitle: "Today",
        });
      }
    }
  }

  return reminders;
}

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
        actionType: "text",
        suggestedMessage: `Happy Birthday ${contact.name}! 🎂`,
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

  reminders.push(...generateCustomReminders(contact, 1));

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
        : `Last contact: ${formatLastContacted(contact.lastContacted ?? undefined)}`,
    });
  }

  // DISABLED: hangout tracking
  // const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  // if (daysSinceHangout !== null && daysSinceHangout > HANGOUT_THRESHOLDS[1]) {
  //   const severity = Math.min(60, Math.floor((daysSinceHangout - HANGOUT_THRESHOLDS[1]) * 2));
  //   reminders.push({
  //     id: `hangout-${contact.id}`,
  //     contactId: contact.id,
  //     contactName: contact.name,
  //     circleLevel: 1,
  //     type: "hangout-quickpick",
  //     priority: 60 + severity,
  //     title: `When did you last hang out with ${contact.name}?`,
  //     subtitle: `Last hangout: ${formatLastContacted(contact.lastHangout ?? undefined)}`,
  //   });
  // }

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
        actionType: "text",
        suggestedMessage: `Happy Birthday ${contact.name}! 🎂`,
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

  reminders.push(...generateCustomReminders(contact, 2));

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
        : `Last contact: ${formatLastContacted(contact.lastContacted ?? undefined)}`,
    });
  }

  // DISABLED: hangout tracking
  // const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  // if (daysSinceHangout !== null && daysSinceHangout > HANGOUT_THRESHOLDS[2]) {
  //   const severity = Math.min(50, Math.floor((daysSinceHangout - HANGOUT_THRESHOLDS[2]) * 0.8));
  //   reminders.push({
  //     id: `hangout-${contact.id}`,
  //     contactId: contact.id,
  //     contactName: contact.name,
  //     circleLevel: 2,
  //     type: "hangout-quickpick",
  //     priority: 50 + severity,
  //     title: `When did you last hang out with ${contact.name}?`,
  //     subtitle: `Last hangout: ${formatLastContacted(contact.lastHangout ?? undefined)}`,
  //   });
  // }

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
      actionType: "text",
      suggestedMessage: `Happy Birthday ${contact.name}! 🎂`,
    });
  }

  reminders.push(...generateCustomReminders(contact, 3));

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
      subtitle: `Last contact: ${formatLastContacted(contact.lastContacted ?? undefined)}`,
    });
  }

  // DISABLED: hangout tracking
  // const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  // if (daysSinceHangout !== null && daysSinceHangout > HANGOUT_THRESHOLDS[3]) {
  //   reminders.push({
  //     id: `hangout-${contact.id}`,
  //     contactId: contact.id,
  //     contactName: contact.name,
  //     circleLevel: 3,
  //     type: "hangout-quickpick",
  //     priority: 20,
  //     title: `When did you last hang out with ${contact.name}?`,
  //     subtitle: `Last hangout: ${formatLastContacted(contact.lastHangout ?? undefined)}`,
  //   });
  // }

  return reminders;
}

export function generateProfileCompletionReminders(contacts: Contact[]): Reminder[] {
  const reminders: Reminder[] = [];

  const c1NoBirthday = contacts.filter((c) => c.circleLevel === 1 && !c.birthday);
  if (c1NoBirthday.length > 0) {
    reminders.push({
      id: "profile-completion-high",
      contactName: "",
      circleLevel: 1,
      type: "profile-completion-high",
      priority: 160,
      title: "Add birthdays to your Core contacts to unlock reminders.",
      subtitle: `${c1NoBirthday.length} Core contact${c1NoBirthday.length > 1 ? "s" : ""} missing a birthday`,
    });
  }

  const c2NoBirthday = contacts.filter((c) => c.circleLevel === 2 && !c.birthday);
  const c1c2MissingEnrichment = contacts.filter(
    (c) =>
      (c.circleLevel === 1 || c.circleLevel === 2) &&
      (c.labels ?? []).length === 0 &&
      (c.interests ?? []).length === 0,
  );
  if (c2NoBirthday.length > 0 || c1c2MissingEnrichment.length > 0) {
    reminders.push({
      id: "profile-completion-medium",
      contactName: "",
      circleLevel: 2,
      type: "profile-completion-medium",
      priority: 112,
      title: "Some close contacts are missing birthdays or profile details.",
      subtitle: [
        c2NoBirthday.length > 0 ? `${c2NoBirthday.length} missing birthday` : "",
        c1c2MissingEnrichment.length > 0 ? `${c1c2MissingEnrichment.length} missing labels/interests` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  const c3NoBirthday = contacts.filter((c) => c.circleLevel === 3 && !c.birthday);
  const anyMissingEnrichment = contacts.filter(
    (c) => (c.labels ?? []).length === 0 && (c.interests ?? []).length === 0,
  );
  if (c3NoBirthday.length > 0 || anyMissingEnrichment.length > 0) {
    reminders.push({
      id: "profile-completion-low",
      contactName: "",
      circleLevel: 3,
      type: "profile-completion-low",
      priority: 5,
      persistent: true,
      title: "Some contacts are missing birthdays, labels, or interests — find them by the yellow dot.",
      subtitle: [
        c3NoBirthday.length > 0 ? `${c3NoBirthday.length} missing birthday` : "",
        anyMissingEnrichment.length > 0 ? `${anyMissingEnrichment.length} missing labels/interests` : "",
      ]
        .filter(Boolean)
        .join(" · "),
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

  reminders.push(...generateProfileCompletionReminders(contacts));

  reminders.sort((a, b) => b.priority - a.priority);
  return reminders;
}
