import { db, pool } from "./db";
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
  if (isNaN(bday.getTime())) return null;
  const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  if (thisYear < now) thisYear.setFullYear(thisYear.getFullYear() + 1);
  return Math.floor((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

interface CustomReminder {
  label: string;
  date: string;
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
  customReminders?: unknown;
};

// Birthday day-of messages — delivered at midnight so users wake up with the reminder
function buildBirthdayDayOfMessages(contact: ContactRow): PushMessage[] {
  const messages: PushMessage[] = [];
  if (getDaysUntilBirthday(contact.birthday) !== 0) return messages;

  if (contact.circleLevel === 1 || contact.circleLevel === 2) {
    messages.push({
      title: `Happy birthday, ${contact.name}!`,
      body: `Today is ${contact.name}'s birthday — wish them a happy birthday!`,
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
          body: `${contact.name}'s birthday is coming up — would you like to plan a surprise party or plan their gift?`,
          contactId: contact.id,
        });
      }
    }
    // Check-in overdue: > 14 days
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact === null || daysSinceContact > 14) {
      const body = daysSinceContact === null
        ? "You haven't reached out yet"
        : `${daysSinceContact} days since you last connected`;
      messages.push({ title: `Check in with ${contact.name}`, body, contactId: contact.id });
    }
    // Custom reminders: C1 advance at 30/14/7/day-of
    buildCustomReminderMessages(contact, [30, 14, 7, 0], messages);
  } else if (contact.circleLevel === 2) {
    // Birthday advance milestone (day-of handled at midnight)
    if (daysUntilBirthday !== null && daysUntilBirthday === 7) {
      messages.push({
        title: `${contact.name}'s birthday is coming up`,
        body: `${contact.name}'s birthday is coming up in a week.`,
        contactId: contact.id,
      });
    }
    // Check-in overdue: > 45 days
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact !== null && daysSinceContact > 45) {
      messages.push({ title: `Check in with ${contact.name}`, body: `${daysSinceContact} days since you last connected`, contactId: contact.id });
    }
    // Hangout overdue: > 60 days
    const daysSinceHangout = getDaysSince(contact.lastHangout);
    if (daysSinceHangout !== null && daysSinceHangout > 60) {
      const weeks = Math.floor(daysSinceHangout / 7);
      messages.push({ title: `Plan a hangout with ${contact.name}`, body: `${weeks} weeks since your last hangout`, contactId: contact.id });
    }
    // Custom reminders: C2 advance at 7/day-of
    buildCustomReminderMessages(contact, [7, 0], messages);
  } else if (contact.circleLevel === 3) {
    // Check-in overdue: > 75 days
    const daysSinceContact3 = getDaysSince(contact.lastContacted);
    if (daysSinceContact3 !== null && daysSinceContact3 > 75) {
      messages.push({ title: `Check in with ${contact.name}`, body: `${daysSinceContact3} days since you last connected`, contactId: contact.id });
    }
    // Custom reminders: C3 day-of only
    buildCustomReminderMessages(contact, [0], messages);
  }

  return messages;
}

function buildCustomReminderMessages(
  contact: ContactRow,
  milestones: number[],
  messages: PushMessage[],
): void {
  let reminders: CustomReminder[] = [];
  try {
    const raw = contact.customReminders;
    if (Array.isArray(raw)) reminders = raw as CustomReminder[];
  } catch {
    return;
  }

  for (const cr of reminders) {
    if (!cr.label || !cr.date) continue;
    const daysUntil = getDaysUntilBirthday(cr.date);
    if (daysUntil === null) continue;
    if (!milestones.includes(daysUntil)) continue;

    if (daysUntil === 0) {
      messages.push({
        title: `${cr.label} — ${contact.name}`,
        body: `Today is ${contact.name}'s ${cr.label}.`,
        contactId: contact.id,
      });
    } else if (daysUntil === 7) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is coming up`,
        body: `${contact.name}'s ${cr.label} is a week away.`,
        contactId: contact.id,
      });
    } else if (daysUntil === 14) {
      messages.push({
        title: `${contact.name}'s ${cr.label} in 2 weeks`,
        body: `${contact.name}'s ${cr.label} is 2 weeks away.`,
        contactId: contact.id,
      });
    } else if (daysUntil === 30) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is a month away`,
        body: `${contact.name}'s ${cr.label} is coming up in a month.`,
        contactId: contact.id,
      });
    }
  }
}

// ─── 24-hour per-contact deduplication ───────────────────────────────────────

async function getRecentlySentContactIds(userId: string): Promise<Set<string>> {
  try {
    const result = await pool.query<{ contact_id: string }>(
      `SELECT DISTINCT contact_id FROM notification_log WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '24 hours'`,
      [userId],
    );
    return new Set(result.rows.map((r) => r.contact_id));
  } catch {
    return new Set();
  }
}

async function logNotifiedContacts(userId: string, contactIds: Set<string>): Promise<void> {
  for (const contactId of contactIds) {
    try {
      await pool.query(
        `INSERT INTO notification_log (user_id, contact_id) VALUES ($1, $2)`,
        [userId, contactId],
      );
    } catch {
      // Non-fatal: dedup is best-effort
    }
  }
}

async function pruneOldNotificationLog(): Promise<void> {
  try {
    await pool.query(`DELETE FROM notification_log WHERE sent_at < NOW() - INTERVAL '7 days'`);
  } catch {
    // Non-fatal
  }
}

// ─── Expo push sender ─────────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/api/v2/push/send";

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  try {
    const payload = { to: token, title, body, sound: "default", data: data ?? {} };
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[push] HTTP ${res.status} sending to ${token.slice(0, 20)}…`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[push] Failed to send notification:", err);
    return false;
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

// Returns the local day-of-week (0=Sun … 6=Sat) in the given timezone.
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
function getLocalDayOfWeek(timezone: string): number {
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(new Date());
    const idx = DAY_SHORT.indexOf(short as (typeof DAY_SHORT)[number]);
    return idx >= 0 ? idx : new Date().getDay();
  } catch {
    return new Date().getDay();
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
    // Clean up stale dedup log entries at the start of each run
    await pruneOldNotificationLog();

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

      // Collapse to one message per contact (first/highest-priority wins)
      const seenInRun = new Set<string>();
      const deduped = messages.filter((msg) => {
        if (!msg.contactId) return true;
        if (seenInRun.has(msg.contactId)) return false;
        seenInRun.add(msg.contactId);
        return true;
      });

      // Deduplicate: skip messages for contacts already notified in the last 24h
      // (covers both previous server sends AND locally-scheduled elevation pushes)
      const recentContactIds = await getRecentlySentContactIds(user.id);
      const filtered = deduped.filter(
        (msg) => !msg.contactId || !recentContactIds.has(msg.contactId),
      );

      // Cap at 3 notifications per user per delivery window to avoid spam
      const notifiedContactIds = new Set<string>();
      for (const msg of filtered.slice(0, 3)) {
        const ok = await sendExpoPush(
          user.pushToken,
          msg.title,
          msg.body,
          msg.contactId ? { contactId: msg.contactId } : undefined,
        );
        if (ok) {
          if (msg.contactId) notifiedContactIds.add(msg.contactId);
          sent++;
        }
      }

      // Log newly notified contacts for future deduplication
      if (notifiedContactIds.size > 0) {
        await logNotifiedContacts(user.id, notifiedContactIds);
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

// ─── Suggestion nudges ────────────────────────────────────────────────────────
//
// Scoring mirrors lib/suggestion-scheduler.ts scoreSuggestion() exactly:
//   base (C1=1200 C2=1300 C3=1100) + cooldown bonus + recency bonus
//   No birthday bonus — birthday push is handled by the daily reminder path.
//
// "Days since last suggested" server-side = days since contact was last pushed
// via this function, using notification_log as the source of truth.
//
// Elevated contacts are already registered in notification_log via the
// /api/notifications/local-log endpoint called by lib/checkin-state.ts when
// a local elevation notification is scheduled. They are excluded naturally by
// the frequency-matched dedup window.

function scoreSuggestionServer(
  circleLevel: number,
  daysSinceLastPushed: number | null,
  daysSinceContact: number | null,
): number {
  let score = circleLevel === 2 ? 1300 : circleLevel === 1 ? 1200 : 1100;

  // Cooldown bonus: lower cap so real-world recency dominates
  if (daysSinceLastPushed === null) {
    score += 150;
  } else {
    score += Math.min(daysSinceLastPushed * 12, 150);
  }

  // Recency bonus: primary signal — how long since you actually spoke to them
  if (daysSinceContact !== null) {
    score += Math.min(daysSinceContact * 2, 250);
  } else {
    score += 40; // never contacted
  }

  return score;
}

// Returns the dedup window in hours based on user frequency.
// Elevated contacts registered via local-log are excluded for this window too.
function dedupWindowHours(frequency: string): number {
  if (frequency === "3x_week") return 60;  // 2.5 days
  if (frequency === "weekly") return 144;  // 6 days
  return 23;                               // daily
}

export async function sendSuggestionNudges() {
  try {
    const result = await pool.query<{
      id: string;
      push_token: string;
      notification_timezone: string | null;
      suggestion_notif_frequency: string;
      suggestion_notif_time: string | null;
    }>(
      `SELECT id, push_token, notification_timezone, suggestion_notif_frequency, suggestion_notif_time
       FROM users
       WHERE push_token IS NOT NULL
         AND suggestion_notif_frequency IS NOT NULL
         AND suggestion_notif_frequency != 'off'`,
    );

    let sent = 0;
    for (const user of result.rows) {
      const tz = user.notification_timezone ?? "UTC";
      const localHour = getLocalHour(tz);
      const preferredHour = user.suggestion_notif_time === "afternoon" ? 17 : 9;
      if (localHour !== preferredHour) continue;

      const freq = user.suggestion_notif_frequency;
      const localDayOfWeek = getLocalDayOfWeek(tz);
      if (freq === "3x_week" && ![1, 3, 6].includes(localDayOfWeek)) continue; // Mon, Wed, Sat
      if (freq === "weekly" && localDayOfWeek !== 3) continue; // Wednesday

      // Frequency-matched dedup window — also covers elevated contacts whose
      // local notifications were registered via /api/notifications/local-log
      const windowHours = dedupWindowHours(freq);
      const recentResult = await pool.query<{ contact_id: string }>(
        `SELECT DISTINCT contact_id FROM notification_log
         WHERE user_id = $1 AND sent_at > NOW() - make_interval(hours => $2)`,
        [user.id, windowHours],
      );
      const recentContactIds = new Set(recentResult.rows.map((r) => r.contact_id));

      const contactsResult = await pool.query<{
        id: string;
        name: string;
        circle_level: number;
        last_contacted: string | null;
      }>(
        `SELECT id, name, circle_level, last_contacted FROM contacts WHERE user_id = $1`,
        [user.id],
      );
      if (contactsResult.rows.length === 0) continue;

      // Days since each contact was last pushed (server-side cooldown equivalent)
      const lastPushedResult = await pool.query<{ contact_id: string; last_sent: string }>(
        `SELECT contact_id, MAX(sent_at) AS last_sent
         FROM notification_log WHERE user_id = $1 GROUP BY contact_id`,
        [user.id],
      );
      const lastPushedMap = new Map(
        lastPushedResult.rows.map((r) => [r.contact_id, r.last_sent]),
      );

      let bestContact: { id: string; name: string } | null = null;
      let bestScore = -1;

      for (const c of contactsResult.rows) {
        // Skip contacts in dedup window (includes elevated + recently pushed)
        if (recentContactIds.has(c.id)) continue;

        const lastPushed = lastPushedMap.get(c.id);
        const daysSinceLastPushed = lastPushed
          ? Math.floor((Date.now() - new Date(lastPushed).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const daysSinceContact = c.last_contacted
          ? Math.floor((Date.now() - new Date(c.last_contacted).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const score = scoreSuggestionServer(c.circle_level, daysSinceLastPushed, daysSinceContact);
        if (score > bestScore) {
          bestScore = score;
          bestContact = { id: c.id, name: c.name };
        }
      }

      if (!bestContact) continue;

      // Only log as notified if the push actually delivered (fix 404 burn bug)
      const ok = await sendExpoPush(
        user.push_token,
        `Time to reach out to ${bestContact.name}`,
        "Open the app to see what to say.",
        { contactId: bestContact.id },
      );
      if (ok) {
        await logNotifiedContacts(user.id, new Set([bestContact.id]));
        sent++;
      }
    }

    if (sent > 0) {
      console.log(`[push] Sent ${sent} suggestion nudges.`);
    }
  } catch (err) {
    console.error("[push] Error sending suggestion nudges:", err);
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

  async function runHourly() {
    await sendDailyReminders().catch((err) => console.error("[push] Uncaught:", err));
    await sendSuggestionNudges().catch((err) => console.error("[push] Uncaught:", err));
  }

  // First run at the top of the next hour, then every hour after that
  setTimeout(() => {
    runHourly();
    setInterval(runHourly, MS_PER_HOUR);
  }, msUntilNextHour());

  console.log("[push] Hourly notification scheduler started (delivers at 9am/5pm per user timezone)");
}
