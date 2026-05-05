import { db } from "./db";
import { users, contacts } from "@shared/schema";
import { isNotNull } from "drizzle-orm";

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

function buildMessages(
  contact: { id: string; name: string; circleLevel: number; birthday?: string | null; lastContacted?: string | null; lastHangout?: string | null },
): PushMessage[] {
  const messages: PushMessage[] = [];
  const daysUntilBirthday = getDaysUntilBirthday(contact.birthday);

  if (contact.circleLevel === 1) {
    // Birthday: within 7 days
    if (daysUntilBirthday !== null && daysUntilBirthday <= 7) {
      const subtitle =
        daysUntilBirthday === 0
          ? "Today is their birthday"
          : daysUntilBirthday === 1
          ? "Their birthday is tomorrow"
          : `Birthday in ${daysUntilBirthday} days`;
      messages.push({
        title: `${contact.name}'s birthday is coming up`,
        body: subtitle,
        contactId: contact.id,
      });
    }
    // Check-in overdue: > 7 days
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact === null || daysSinceContact > 7) {
      const daysText =
        daysSinceContact === null ? "You haven't reached out yet" : `${daysSinceContact} days since you last connected`;
      messages.push({
        title: `Check in with ${contact.name}`,
        body: daysText,
        contactId: contact.id,
      });
    }
  } else if (contact.circleLevel === 2) {
    // Birthday: within 7 days
    if (daysUntilBirthday !== null && daysUntilBirthday <= 7) {
      const subtitle =
        daysUntilBirthday === 0
          ? "Today is their birthday"
          : daysUntilBirthday === 1
          ? "Their birthday is tomorrow"
          : `Birthday in ${daysUntilBirthday} days`;
      messages.push({
        title: `${contact.name}'s birthday is coming up`,
        body: subtitle,
        contactId: contact.id,
      });
    }
    // Hangout overdue: > 3 weeks
    const daysSinceHangout = getDaysSince(contact.lastHangout);
    if (daysSinceHangout === null || daysSinceHangout > 21) {
      const hText =
        daysSinceHangout === null
          ? "You haven't hung out yet"
          : `${Math.floor(daysSinceHangout / 7)} weeks since your last hangout`;
      messages.push({
        title: `Plan a hangout with ${contact.name}`,
        body: hText,
        contactId: contact.id,
      });
    }
  }
  // Circle 3: no push notifications

  return messages;
}

// ─── Expo push sender ─────────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/api/v2/push/send";

async function sendExpoPush(token: string, title: string, body: string, data?: Record<string, string>) {
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

// ─── Daily reminder dispatch ──────────────────────────────────────────────────

export async function sendDailyReminders() {
  console.log("[push] Sending daily reminders…");
  try {
    const usersWithTokens = await db
      .select({ id: users.id, pushToken: users.pushToken })
      .from(users)
      .where(isNotNull(users.pushToken));

    let sent = 0;
    for (const user of usersWithTokens) {
      if (!user.pushToken) continue;
      const userContacts = await db
        .select()
        .from(contacts)
        .where(
          // drizzle eq imported inline to avoid circular dep
          (await import("drizzle-orm")).eq(contacts.userId, user.id),
        );

      const messages: PushMessage[] = [];
      for (const contact of userContacts) {
        messages.push(...buildMessages(contact));
      }

      // Cap at 3 notifications per user per day to avoid spam
      const toSend = messages.slice(0, 3);
      for (const msg of toSend) {
        await sendExpoPush(
          user.pushToken,
          msg.title,
          msg.body,
          msg.contactId ? { contactId: msg.contactId } : undefined,
        );
        sent++;
      }
    }
    console.log(`[push] Daily reminders done. Sent ${sent} notifications to ${usersWithTokens.length} users.`);
  } catch (err) {
    console.error("[push] Error sending daily reminders:", err);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function scheduleDailyNotifications() {
  if (schedulerInterval) return;

  function msUntil9amUtc(): number {
    const now = new Date();
    const next9am = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0, 0),
    );
    if (next9am <= now) next9am.setUTCDate(next9am.getUTCDate() + 1);
    return next9am.getTime() - now.getTime();
  }

  function scheduleNext() {
    const delay = msUntil9amUtc();
    console.log(`[push] Next daily reminder in ${Math.round(delay / 60000)} minutes`);
    setTimeout(() => {
      sendDailyReminders().catch((err) => console.error("[push] Uncaught error:", err));
      schedulerInterval = setInterval(() => {
        sendDailyReminders().catch((err) => console.error("[push] Uncaught error:", err));
      }, 24 * 60 * 60 * 1000);
    }, delay);
  }

  scheduleNext();
  console.log("[push] Daily notification scheduler started");
}
