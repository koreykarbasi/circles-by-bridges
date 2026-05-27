import { db } from "./db";
import { users, contacts, hangoutVotes, hangoutOptions, hangoutPlans } from "@shared/schema";
import { isNotNull, eq } from "drizzle-orm";

// ─── Reminder helpers (mirrors lib/helpers.ts + lib/reminders.ts) ─────────────

function getDaysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const date = new Date(dateStr);
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysUntilBirthday(birthday?: string | null): number | null {
  if (!birthday) return null;
  const now = new Date();
  const bday = new Date(birthday);
  const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  if (thisYear < now) thisYear.setFullYear(thisYear.getFullYear() + 1);
  return Math.floor((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

interface PushMessage {
  title: string;
  body: string;
  contactId?: string;
}

type ContactRow = {
  id: string;
  name: string;
  circleLevel: number;
  birthday?: string | null;
  lastContacted?: string | null;
  lastHangout?: string | null;
};

// Birthday day-of messages — delivered at midnight so users wake up with the reminder
function buildBirthdayDayOfMessages(contact: ContactRow): PushMessage[] {
  const messages: PushMessage[] = [];
  if (getDaysUntilBirthday(contact.birthday) !== 0) return messages;

  if (contact.circleLevel === 1 || contact.circleLevel === 2) {
    messages.push({
      title: `Happy birthday, ${contact.name}!`,
      body: `Today is ${contact.name}'s birthday — reach out and wish them a happy birthday!`,
      contactId: contact.id,
    });
  } else if (contact.circleLevel === 3) {
    messages.push({
      title: `${contact.name}'s birthday`,
      body: `Today is ${contact.name}'s birthday.`,
      contactId: contact.id,
    });
  }
  return messages;
}

// Non-day-of reminder messages — delivered at 9am
function buildReminderMessages(contact: ContactRow): PushMessage[] {
  const messages: PushMessage[] = [];
  const daysUntilBirthday = getDaysUntilBirthday(contact.birthday);

  if (contact.circleLevel === 1) {
    // Birthday advance milestones (day-of handled at midnight)
    if (daysUntilBirthday !== null && daysUntilBirthday > 0) {
      if (daysUntilBirthday === 7) {
        messages.push({
          title: `${contact.name}'s birthday is coming up`,
          body: `${contact.name}'s birthday is a week away — make sure you have everything sorted!`,
          contactId: contact.id,
        });
      } else if (daysUntilBirthday === 14) {
        messages.push({
          title: `${contact.name}'s birthday in 2 weeks`,
          body: `${contact.name}'s birthday is 2 weeks away — is your gift and their birthday plans finalised?`,
          contactId: contact.id,
        });
      } else if (daysUntilBirthday === 30) {
        messages.push({
          title: `${contact.name}'s birthday is a month away`,
          body: `${contact.name}'s birthday is coming up. Would you like to plan something special?`,
          contactId: contact.id,
        });
      }
    }
    // Check-in overdue: > 7 days
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact === null || daysSinceContact > 7) {
      const body = daysSinceContact === null
        ? "You haven't reached out yet"
        : `${daysSinceContact} days since you last connected`;
      messages.push({ title: `Check in with ${contact.name}`, body, contactId: contact.id });
    }
  } else if (contact.circleLevel === 2) {
    // Birthday advance milestone (day-of handled at midnight)
    if (daysUntilBirthday !== null && daysUntilBirthday === 7) {
      messages.push({
        title: `${contact.name}'s birthday is coming up`,
        body: `${contact.name}'s birthday is a week away — plan something special.`,
        contactId: contact.id,
      });
    }
    // Hangout overdue: > 3 weeks
    const daysSinceHangout = getDaysSince(contact.lastHangout);
    if (daysSinceHangout === null || daysSinceHangout > 21) {
      const body = daysSinceHangout === null
        ? "You haven't hung out yet"
        : `${Math.floor(daysSinceHangout / 7)} weeks since your last hangout`;
      messages.push({ title: `Plan a hangout with ${contact.name}`, body, contactId: contact.id });
    }
  }
  // Circle 3: no non-birthday reminders at 9am

  return messages;
}

// ─── Expo push sender ─────────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/api/v2/push/send";

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  try {
    const payload = { to: token, title, body, sound: "default", data: data ?? {} };
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[push] HTTP ${res.status} sending to ${token.slice(0, 20)}…`);
    }
  } catch (err) {
    console.error("[push] Failed to send notification:", err);
  }
}

// ─── Per-user local-time checks ───────────────────────────────────────────────

function getLocalHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return new Date().getUTCHours();
  }
}

// Returns true if it is currently between 9:00 and 9:59 in the given timezone.
function isNineAmLocalNow(timezone: string): boolean {
  return getLocalHour(timezone) === 9;
}

// Returns true if it is currently between 0:00 and 0:59 in the given timezone.
function isMidnightLocalNow(timezone: string): boolean {
  return getLocalHour(timezone) === 0;
}

// ─── Daily reminder dispatch ──────────────────────────────────────────────────

export async function sendDailyReminders() {
  console.log("[push] Checking per-user reminders (midnight birthday + 9am)…");
  try {
    const usersWithTokens = await db
      .select({
        id: users.id,
        pushToken: users.pushToken,
        notificationTimezone: users.notificationTimezone,
      })
      .from(users)
      .where(isNotNull(users.pushToken));

    let sent = 0;
    for (const user of usersWithTokens) {
      if (!user.pushToken) continue;

      const tz = user.notificationTimezone ?? "UTC";
      const atMidnight = isMidnightLocalNow(tz);
      const atNineAm = isNineAmLocalNow(tz);
      if (!atMidnight && !atNineAm) continue;

      const userContacts = await db
        .select()
        .from(contacts)
        .where(eq(contacts.userId, user.id));

      const messages: PushMessage[] = [];
      for (const contact of userContacts) {
        if (atMidnight) {
          // Birthday day-of notifications fire at midnight
          messages.push(...buildBirthdayDayOfMessages(contact));
        } else {
          // Advance birthday milestones + overdue check-ins/hangouts fire at 9am
          messages.push(...buildReminderMessages(contact));
        }
      }

      // Cap at 3 notifications per user per delivery window to avoid spam
      for (const msg of messages.slice(0, 3)) {
        await sendExpoPush(
          user.pushToken,
          msg.title,
          msg.body,
          msg.contactId ? { contactId: msg.contactId } : undefined,
        );
        sent++;
      }
    }
    if (sent > 0) {
      console.log(`[push] Sent ${sent} notifications.`);
    }
  } catch (err) {
    console.error("[push] Error sending reminders:", err);
  }
}

// ─── Hangout finalized notifications ─────────────────────────────────────────

export async function sendHangoutFinalizedNotifications(
  planId: string,
  organizerUserId: string,
): Promise<void> {
  try {
    // Load the plan
    const [plan] = await db
      .select()
      .from(hangoutPlans)
      .where(eq(hangoutPlans.id, planId));
    if (!plan) return;

    // Load all options to resolve the finalized time slot and activity/location
    const options = await db
      .select()
      .from(hangoutOptions)
      .where(eq(hangoutOptions.planId, planId));

    const timeOption = options.find(
      (o) => o.id === plan.finalizedTimeOptionId,
    );
    const activityOption = options.find(
      (o) => o.id === plan.finalizedOptionId,
    );

    // Build a readable summary for the notification body
    const timePart = timeOption?.label ?? timeOption?.dateTime ?? null;
    const locationPart =
      activityOption?.location ??
      timeOption?.location ??
      activityOption?.activity ??
      activityOption?.label ??
      null;

    // Format: "[Title] — [time] at [location]"
    let bodyParts: string[] = [plan.title];
    if (timePart) bodyParts.push(timePart);
    const notificationBody =
      bodyParts.join(" — ") + (locationPart ? ` at ${locationPart}` : "");

    // Collect unique voter names
    const allVotes = await db
      .select({ voterName: hangoutVotes.voterName })
      .from(hangoutVotes)
      .where(eq(hangoutVotes.planId, planId));

    const uniqueVoterNames = [
      ...new Set(
        allVotes
          .map((v) => v.voterName.trim().toLowerCase())
          .filter((name) => name.length > 0),
      ),
    ];
    if (uniqueVoterNames.length === 0) return;

    // Find registered users whose username matches a voter name (case-insensitive)
    // and who have a push token and are not the organizer
    const registeredUsers = await db
      .select({
        id: users.id,
        username: users.username,
        pushToken: users.pushToken,
      })
      .from(users)
      .where(isNotNull(users.pushToken));

    let sent = 0;
    for (const user of registeredUsers) {
      if (user.id === organizerUserId) continue;
      if (!user.pushToken || !user.username) continue;
      const normalizedUsername = user.username.trim().toLowerCase();
      if (!uniqueVoterNames.includes(normalizedUsername)) continue;

      await sendExpoPush(
        user.pushToken,
        "Your hangout is confirmed!",
        notificationBody,
        { hangoutId: planId },
      );
      sent++;
    }

    if (sent > 0) {
      console.log(
        `[push] Sent ${sent} hangout-finalized notifications for plan ${planId}`,
      );
    }
  } catch (err) {
    console.error("[push] Error sending hangout finalized notifications:", err);
  }
}

// ─── Hourly scheduler ─────────────────────────────────────────────────────────
// Runs every hour; sendDailyReminders() only delivers to users for whom it
// is currently 9am local time, so each user gets notified once per day.

export function scheduleDailyNotifications() {
  const MS_PER_HOUR = 60 * 60 * 1000;

  function msUntilNextHour(): number {
    const now = Date.now();
    return MS_PER_HOUR - (now % MS_PER_HOUR);
  }

  // First run at the top of the next hour, then every hour after that
  setTimeout(() => {
    sendDailyReminders().catch((err) => console.error("[push] Uncaught:", err));
    setInterval(() => {
      sendDailyReminders().catch((err) => console.error("[push] Uncaught:", err));
    }, MS_PER_HOUR);
  }, msUntilNextHour());

  console.log("[push] Hourly notification scheduler started (delivers at 9am per user timezone)");
}
