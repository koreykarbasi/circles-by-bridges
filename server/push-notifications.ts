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

// Parses MM/DD, MM/DD/YYYY, or YYYY-MM-DD without UTC timezone shift.
// Compares as local calendar dates so day-of-birthday is always day 0.
function getDaysUntilBirthday(birthday?: string | null): number | null {
  if (!birthday) return null;

  let month: number;
  let day: number;

  const slashParts = birthday.split("/");
  if (slashParts.length >= 2) {
    month = parseInt(slashParts[0], 10) - 1; // 0-indexed
    day = parseInt(slashParts[1], 10);
  } else {
    const dashParts = birthday.split("-");
    if (dashParts.length === 3) {
      month = parseInt(dashParts[1], 10) - 1;
      day = parseInt(dashParts[2], 10);
    } else {
      return null;
    }
  }

  if (isNaN(month) || isNaN(day) || month < 0 || month > 11 || day < 1 || day > 31) return null;

  const now = new Date();
  // Compare calendar dates only — no time component so "today" is always 0
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = new Date(now.getFullYear(), month, day);
  if (thisYear < todayMidnight) thisYear.setFullYear(thisYear.getFullYear() + 1);
  return Math.floor((thisYear.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

interface CustomReminder {
  label: string;
  date: string;
}

// notifType drives per-type dedup so birthday logs don't suppress check-in
// logs and vice versa.
interface PushMessage {
  title: string;
  body: string;
  contactId?: string;
  notifType: "birthday" | "reminder" | "milestone";
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

// Birthday day-of messages — delivered when the hourly run fires on the birthday.
function buildBirthdayDayOfMessages(contact: ContactRow): PushMessage[] {
  const messages: PushMessage[] = [];
  const daysUntil = getDaysUntilBirthday(contact.birthday);
  if (daysUntil !== 0) return messages;

  if (contact.circleLevel === 1 || contact.circleLevel === 2) {
    messages.push({
      title: `Happy birthday, ${contact.name}!`,
      body: `Today is ${contact.name}'s birthday — wish them a happy birthday!`,
      contactId: contact.id,
      notifType: "birthday",
    });
  } else if (contact.circleLevel === 3) {
    messages.push({
      title: `${contact.name}'s birthday`,
      body: `Today is ${contact.name}'s birthday.`,
      contactId: contact.id,
      notifType: "birthday",
    });
  }
  return messages;
}

// Non-day-of reminder messages: birthday milestones (notifType='milestone') and
// check-in overdue (notifType='reminder'). Check-in is placed FIRST so the
// per-contact collapse (one message per contact) favours the actionable reminder
// over a milestone when both are present.
function buildReminderMessages(contact: ContactRow): PushMessage[] {
  const messages: PushMessage[] = [];
  const daysUntilBirthday = getDaysUntilBirthday(contact.birthday);

  if (contact.circleLevel === 1) {
    // Check-in overdue: > 17 days (in-app card shows at 14d; push fires 3 days later)
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact === null || daysSinceContact > 17) {
      messages.push({
        title: `When was the last time you spoke to ${contact.name}?`,
        body: `Open the app to select an answer.`,
        contactId: contact.id,
        notifType: "reminder",
      });
    }
    // Birthday advance milestones (day-of handled separately)
    if (daysUntilBirthday !== null && daysUntilBirthday > 0) {
      if (daysUntilBirthday === 7) {
        messages.push({
          title: `${contact.name}'s birthday is coming up`,
          body: `${contact.name}'s birthday is a week away — make sure you have everything sorted!`,
          contactId: contact.id,
          notifType: "milestone",
        });
      } else if (daysUntilBirthday === 14) {
        messages.push({
          title: `${contact.name}'s birthday in 2 weeks`,
          body: `${contact.name}'s birthday is 2 weeks away — is your gift and their birthday plans finalised?`,
          contactId: contact.id,
          notifType: "milestone",
        });
      } else if (daysUntilBirthday === 30) {
        messages.push({
          title: `${contact.name}'s birthday is a month away`,
          body: `${contact.name}'s birthday is coming up — would you like to plan a surprise party or plan their gift?`,
          contactId: contact.id,
          notifType: "milestone",
        });
      }
    }
    // Custom reminders: C1 advance at 30/14/7/day-of
    buildCustomReminderMessages(contact, [30, 14, 7, 0], messages);
  } else if (contact.circleLevel === 2) {
    // Check-in overdue: > 48 days (in-app card shows at 45d; push fires 3 days later)
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact !== null && daysSinceContact > 48) {
      messages.push({
        title: `When was the last time you spoke to ${contact.name}?`,
        body: `Open the app to select an answer.`,
        contactId: contact.id,
        notifType: "reminder",
      });
    }
    // Birthday advance milestone (day-of handled separately)
    if (daysUntilBirthday !== null && daysUntilBirthday === 7) {
      messages.push({
        title: `${contact.name}'s birthday is coming up`,
        body: `${contact.name}'s birthday is coming up in a week.`,
        contactId: contact.id,
        notifType: "milestone",
      });
    }
    // Custom reminders: C2 advance at 7/day-of
    buildCustomReminderMessages(contact, [7, 0], messages);
  } else if (contact.circleLevel === 3) {
    // Check-in overdue: > 78 days (in-app card shows at 75d; push fires 3 days later)
    const daysSinceContact3 = getDaysSince(contact.lastContacted);
    if (daysSinceContact3 !== null && daysSinceContact3 > 78) {
      messages.push({
        title: `When was the last time you spoke to ${contact.name}?`,
        body: `Open the app to select an answer.`,
        contactId: contact.id,
        notifType: "reminder",
      });
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
        notifType: "birthday",
      });
    } else if (daysUntil === 7) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is coming up`,
        body: `${contact.name}'s ${cr.label} is a week away.`,
        contactId: contact.id,
        notifType: "milestone",
      });
    } else if (daysUntil === 14) {
      messages.push({
        title: `${contact.name}'s ${cr.label} in 2 weeks`,
        body: `${contact.name}'s ${cr.label} is 2 weeks away.`,
        contactId: contact.id,
        notifType: "milestone",
      });
    } else if (daysUntil === 30) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is a month away`,
        body: `${contact.name}'s ${cr.label} is coming up in a month.`,
        contactId: contact.id,
        notifType: "milestone",
      });
    }
  }
}

// ─── 24-hour per-contact deduplication ───────────────────────────────────────

async function getRecentlySentContactIds(userId: string, types: string[]): Promise<Set<string>> {
  try {
    const placeholders = types.map((_, i) => `$${i + 2}`).join(", ");
    const result = await pool.query<{ contact_id: string }>(
      `SELECT DISTINCT contact_id FROM notification_log
       WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '24 hours'
         AND notif_type IN (${placeholders})`,
      [userId, ...types],
    );
    return new Set(result.rows.map((r) => r.contact_id));
  } catch {
    return new Set();
  }
}

async function logNotifiedContacts(userId: string, contactIds: Set<string>, notifType: string): Promise<void> {
  for (const contactId of contactIds) {
    try {
      await pool.query(
        `INSERT INTO notification_log (user_id, contact_id, notif_type) VALUES ($1, $2, $3)`,
        [userId, contactId, notifType],
      );
    } catch {
      // Non-fatal: dedup is best-effort
    }
  }
}

async function pruneOldNotificationLog(): Promise<void> {
  try {
    // Keep suggestion/cycle logs 60 days so pool rotation works across large contact sets.
    // All other notification types prune after 7 days.
    await pool.query(
      `DELETE FROM notification_log WHERE sent_at < NOW() - INTERVAL '7 days' AND notif_type NOT IN ('suggestion', 'suggestion_cycle_reset')`,
    );
    await pool.query(
      `DELETE FROM notification_log WHERE sent_at < NOW() - INTERVAL '60 days'`,
    );
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

// ─── Daily reminder dispatch ──────────────────────────────────────────────────

export async function sendDailyReminders() {
  console.log("[push] Checking per-user reminders (runs hourly; per-contact 24h dedup spreads delivery through the day)…");
  try {
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

      const userContacts = await db
        .select()
        .from(contacts)
        .where(eq(contacts.userId, user.id));

      // Build separate message lists per type.
      // Birthday dedup is separate from reminder dedup so a birthday push
      // yesterday does not suppress a check-in push today (and vice versa).
      const birthdayMessages: PushMessage[] = [];
      const reminderMessages: PushMessage[] = []; // check-in overdue
      const milestoneMessages: PushMessage[] = []; // birthday advance notices

      const tz = user.notificationTimezone ?? "UTC";
      const isNineAm = isNineAmLocalNow(tz);

      for (const contact of userContacts) {
        // Birthday day-of messages are only sent during the 9am local window so
        // users receive them first thing in the morning, not mid-afternoon.
        if (isNineAm) {
          for (const msg of buildBirthdayDayOfMessages(contact)) {
            birthdayMessages.push(msg);
          }
        }
        for (const msg of buildReminderMessages(contact)) {
          if (msg.notifType === "reminder") reminderMessages.push(msg);
          else milestoneMessages.push(msg);
        }
      }

      // Separate 24h dedup windows per type
      const recentBirthdayIds = await getRecentlySentContactIds(user.id, ["birthday"]);
      const recentReminderIds = await getRecentlySentContactIds(user.id, ["reminder", "elevation", "milestone"]);

      // Collapse to one per contact within each type group, excluding recently sent.
      function dedupMessages(msgs: PushMessage[], recentIds: Set<string>): PushMessage[] {
        const seen = new Set<string>();
        return msgs.filter((m) => {
          if (!m.contactId) return true;
          if (recentIds.has(m.contactId)) return false;
          if (seen.has(m.contactId)) return false;
          seen.add(m.contactId);
          return true;
        });
      }

      const filteredBirthday = dedupMessages(birthdayMessages, recentBirthdayIds);
      // Check-in reminders come first (more actionable); milestones are lower priority
      const filteredReminders = dedupMessages([...reminderMessages, ...milestoneMessages], recentReminderIds);

      // Priority order: birthday day-of > check-in overdue > milestone.
      // If a contact has BOTH a birthday today AND an overdue check-in, send only
      // the birthday (same-day collision). The check-in is eligible again tomorrow
      // because it uses its own dedup namespace ('reminder' not 'birthday').
      const birthdayContactIds = new Set(filteredBirthday.map((m) => m.contactId).filter(Boolean) as string[]);
      const filteredRemindersNoConflict = filteredReminders.filter(
        (m) => !m.contactId || !birthdayContactIds.has(m.contactId),
      );
      const toSend = [...filteredBirthday, ...filteredRemindersNoConflict].slice(0, 3);

      // Diagnostic logging
      const totalEligible = filteredBirthday.length + filteredReminders.length;
      if (toSend.length === 0) {
        if (birthdayMessages.length + reminderMessages.length + milestoneMessages.length > 0) {
          console.log(`[push]   user ${user.id.slice(0, 8)}: ${userContacts.length} contacts — all in 24h dedup window`);
        }
        continue;
      }
      console.log(
        `[push]   user ${user.id.slice(0, 8)}: ${totalEligible} eligible, sending ${toSend.length} notification(s)`,
      );

      const notifiedBirthdayIds = new Set<string>();
      const notifiedReminderIds = new Set<string>();

      for (const msg of toSend) {
        const ok = await sendExpoPush(
          user.pushToken,
          msg.title,
          msg.body,
          msg.contactId ? { contactId: msg.contactId } : undefined,
        );
        if (ok && msg.contactId) {
          if (msg.notifType === "birthday") {
            notifiedBirthdayIds.add(msg.contactId);
          } else {
            notifiedReminderIds.add(msg.contactId);
          }
          sent++;
          console.log(`[push]     sent [${msg.notifType}] "${msg.title.slice(0, 50)}" → contact ${msg.contactId.slice(0, 8)}`);
        }
      }

      // Log each type separately so future dedup windows stay isolated
      if (notifiedBirthdayIds.size > 0) {
        await logNotifiedContacts(user.id, notifiedBirthdayIds, "birthday");
      }
      if (notifiedReminderIds.size > 0) {
        // Use the specific type for milestones so they have their own dedup window
        for (const msg of toSend) {
          if (msg.contactId && notifiedReminderIds.has(msg.contactId)) {
            await logNotifiedContacts(user.id, new Set([msg.contactId]), msg.notifType);
          }
        }
      }
    }
    if (sent > 0) {
      console.log(`[push] sendDailyReminders: sent ${sent} notification(s) total`);
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
    const [plan] = await db
      .select()
      .from(hangoutPlans)
      .where(eq(hangoutPlans.id, planId));
    if (!plan) return;

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

    const timePart = timeOption?.label ?? timeOption?.dateTime ?? null;
    const locationPart =
      activityOption?.location ??
      timeOption?.location ??
      activityOption?.activity ??
      activityOption?.label ??
      null;

    let bodyParts: string[] = [plan.title];
    if (timePart) bodyParts.push(timePart);
    const notificationBody =
      bodyParts.join(" — ") + (locationPart ? ` at ${locationPart}` : "");

    // Invitee notifications are intentionally omitted here. Matching voters to
    // registered accounts by username is unsafe because usernames are mutable
    // and non-unique — an attacker could set their display name to a common
    // invitee name and intercept private event details. There is no stable,
    // unforgeable binding between a vote (identified only by a free-text
    // voterName) and a user account in the current data model. Until per-vote
    // user-ID binding is added, no push is sent to invitees on finalization.
    console.log(
      `[push] Hangout ${planId} finalized — invitee push notifications skipped (no safe voter→account binding).`,
    );
  } catch (err) {
    console.error("[push] Error sending hangout finalized notifications:", err);
  }
}

// ─── Suggestion nudges ────────────────────────────────────────────────────────
//
// Full-pool rotation: contacts are nudged in score order (highest first) within
// a "cycle". Once every contact in the pool has been nudged at least once, a new
// cycle starts. This prevents the same high-scorer from dominating indefinitely.
//
// Cycle boundary is tracked via a 'suggestion_cycle_reset' entry in notification_log.
// Suggestion entries are retained for 60 days (vs 7 days for reminders) so the full
// pool can rotate even for users with many contacts.
//
// Scoring mirrors lib/suggestion-scheduler.ts scoreSuggestion() exactly:
//   base (C1=1200 C2=1300 C3=1100) + cooldown bonus + recency bonus

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
function dedupWindowHours(frequency: string): number {
  if (frequency === "3x_week") return 60;  // 2.5 days
  if (frequency === "weekly") return 144;  // 6 days
  return 23;                               // daily
}

// ─── Profile completion weekly push (Sunday 9am local) ───────────────────────

export async function sendProfileCompletionPushes() {
  try {
    const usersWithTokens = await db
      .select({
        id: users.id,
        pushToken: users.pushToken,
        notificationTimezone: users.notificationTimezone,
        lastProfilePushAt: users.lastProfilePushAt,
      })
      .from(users)
      .where(isNotNull(users.pushToken));

    let sent = 0;
    for (const user of usersWithTokens) {
      if (!user.pushToken) continue;

      const tz = user.notificationTimezone ?? "UTC";
      if (!isNineAmLocalNow(tz)) continue;
      if (getLocalDayOfWeek(tz) !== 0) continue; // 0 = Sunday

      if (user.lastProfilePushAt) {
        const daysSinceLastPush = Math.floor(
          (Date.now() - new Date(user.lastProfilePushAt).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSinceLastPush <= 6) continue;
      }

      const c1NoBirthday = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM contacts WHERE user_id = $1 AND circle_level = 1 AND (birthday IS NULL OR birthday = '')`,
        [user.id],
      );
      const missingCount = parseInt(c1NoBirthday.rows[0]?.count ?? "0", 10);
      if (missingCount === 0) continue;

      const ok = await sendExpoPush(
        user.pushToken,
        "Complete your Bridges profile",
        "Some of your Core contacts are missing birthdays — add them to unlock reminders.",
      );
      if (ok) {
        await pool.query(
          `UPDATE users SET last_profile_push_at = NOW() WHERE id = $1`,
          [user.id],
        );
        sent++;
      }
    }

    if (sent > 0) {
      console.log(`[push] Sent ${sent} profile completion pushes.`);
    }
  } catch (err) {
    console.error("[push] Error sending profile completion pushes:", err);
  }
}

export async function sendSuggestionNudges() {
  const nowUtc = new Date().toISOString();
  console.log(`[push] sendSuggestionNudges running at ${nowUtc}`);
  try {
    const result = await pool.query<{
      id: string;
      push_token: string;
      notification_timezone: string | null;
      suggestion_notif_frequency: string;
      suggestion_notif_time: string | null;
    }>(
      `SELECT id, push_token, notification_timezone,
              COALESCE(suggestion_notif_frequency, 'daily') AS suggestion_notif_frequency,
              suggestion_notif_time
       FROM users
       WHERE push_token IS NOT NULL
         AND COALESCE(suggestion_notif_frequency, 'daily') != 'off'`,
    );

    console.log(`[push] Suggestion nudge candidates: ${result.rows.length} user(s) with token + freq != off`);

    let sent = 0;
    for (const user of result.rows) {
      const tz = user.notification_timezone ?? "UTC";
      const localHour = getLocalHour(tz);
      const preferredHour = user.suggestion_notif_time === "afternoon" ? 17 : 9;
      console.log(`[push]   user ${user.id.slice(0, 8)} tz=${tz} localHour=${localHour} preferredHour=${preferredHour} freq=${user.suggestion_notif_frequency}`);
      if (localHour !== preferredHour) {
        console.log(`[push]   → skip: hour mismatch (${localHour} != ${preferredHour})`);
        continue;
      }

      const freq = user.suggestion_notif_frequency;
      const localDayOfWeek = getLocalDayOfWeek(tz);
      if (freq === "3x_week" && ![1, 3, 6].includes(localDayOfWeek)) {
        console.log(`[push]   → skip: 3x_week day mismatch (day ${localDayOfWeek})`);
        continue;
      }
      if (freq === "weekly" && localDayOfWeek !== 3) {
        console.log(`[push]   → skip: weekly day mismatch (day ${localDayOfWeek})`);
        continue;
      }

      // Frequency-matched dedup window — only suggestion + elevation types.
      // Reminder-type entries are intentionally excluded so daily reminders at 9am
      // do not suppress the suggestion nudge that fires immediately after.
      const windowHours = dedupWindowHours(freq);
      const recentResult = await pool.query<{ contact_id: string }>(
        `SELECT DISTINCT contact_id FROM notification_log
         WHERE user_id = $1 AND sent_at > NOW() - make_interval(hours => $2)
           AND notif_type IN ('suggestion', 'elevation')`,
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
      if (contactsResult.rows.length === 0) {
        console.log(`[push]   → skip: no contacts`);
        continue;
      }

      // ── Full-pool cycle tracking ──────────────────────────────────────────
      // A "cycle" ends when every contact in the pool has received at least one
      // suggestion push. When the cycle completes, we insert a cycle-reset marker
      // and begin a new cycle. This prevents high-scorers from repeating forever.

      const cycleResetResult = await pool.query<{ sent_at: string }>(
        `SELECT MAX(sent_at) AS sent_at FROM notification_log
         WHERE user_id = $1 AND notif_type = 'suggestion_cycle_reset'`,
        [user.id],
      );
      const cycleStartAt = cycleResetResult.rows[0]?.sent_at ?? null;

      // Contacts already nudged in the current cycle
      const cycleResult2 = cycleStartAt
        ? await pool.query<{ contact_id: string }>(
            `SELECT DISTINCT contact_id FROM notification_log
             WHERE user_id = $1 AND notif_type = 'suggestion' AND sent_at > $2`,
            [user.id, cycleStartAt],
          )
        : await pool.query<{ contact_id: string }>(
            `SELECT DISTINCT contact_id FROM notification_log
             WHERE user_id = $1 AND notif_type = 'suggestion'`,
            [user.id],
          );
      const alreadyNudgedInCycle = new Set(cycleResult2.rows.map((r) => r.contact_id));

      const allContactIds = new Set(contactsResult.rows.map((c) => c.id));
      const allNudgedThisCycle = [...allContactIds].every((id) => alreadyNudgedInCycle.has(id));

      if (allNudgedThisCycle) {
        console.log(`[push]   → cycle complete (${allContactIds.size} contacts nudged) — starting new cycle`);
        // Insert reset marker so the next query sees an empty cycle
        try {
          await pool.query(
            `INSERT INTO notification_log (user_id, contact_id, notif_type) VALUES ($1, $2, 'suggestion_cycle_reset')`,
            [user.id, [...allContactIds][0] ?? "system"],
          );
        } catch {
          // Non-fatal
        }
        alreadyNudgedInCycle.clear();
      }

      // Last-pushed timestamp per contact (used for tie-breaking within the cycle)
      const lastPushedResult = await pool.query<{ contact_id: string; last_sent: string }>(
        `SELECT contact_id, MAX(sent_at) AS last_sent
         FROM notification_log WHERE user_id = $1 AND notif_type = 'suggestion' GROUP BY contact_id`,
        [user.id],
      );
      const lastPushedMap = new Map(
        lastPushedResult.rows.map((r) => [r.contact_id, r.last_sent]),
      );

      // Score every contact in the pool
      const scored: { id: string; name: string; score: number; inCycle: boolean; lastPushedAt: number }[] = [];
      let skippedDedup = 0;
      let skippedCycle = 0;

      for (const c of contactsResult.rows) {
        const inDedup = recentContactIds.has(c.id);
        const inCycle = alreadyNudgedInCycle.has(c.id);

        if (inDedup) { skippedDedup++; continue; }
        if (inCycle) { skippedCycle++; continue; }

        const lastPushed = lastPushedMap.get(c.id);
        const daysSinceLastPushed = lastPushed
          ? Math.floor((Date.now() - new Date(lastPushed).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const daysSinceContact = c.last_contacted
          ? Math.floor((Date.now() - new Date(c.last_contacted).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const score = scoreSuggestionServer(c.circle_level, daysSinceLastPushed, daysSinceContact);
        scored.push({
          id: c.id,
          name: c.name,
          score,
          inCycle,
          lastPushedAt: lastPushed ? new Date(lastPushed).getTime() : 0,
        });
      }

      console.log(
        `[push]   → pool: ${contactsResult.rows.length} total, ${scored.length} eligible this cycle, ${skippedDedup} in dedup window, ${skippedCycle} already nudged this cycle`,
      );

      if (scored.length === 0) {
        console.log(`[push]   → skip: no eligible contacts in current cycle`);
        continue;
      }

      // Within the eligible set, pick highest score. If tied, prefer least-recently-pushed.
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.lastPushedAt - b.lastPushedAt;
      });
      const bestContact = { id: scored[0].id, name: scored[0].name };
      const bestScore = scored[0].score;

      console.log(`[push]   → sending to user ${user.id.slice(0, 8)} for contact "${bestContact.id.slice(0, 8)}" score=${bestScore} (${scored.length} eligible in cycle)`);

      // Vary the copy so the same body doesn't repeat — deterministic per contact+day
      const nudgeTemplates: { title: (n: string) => string; body: (n: string) => string }[] = [
        { title: (n) => `Time to reach out to ${n}`, body: () => "Open the app to see what to say." },
        { title: (n) => `${n} is due for a check-in`, body: (n) => `It's been a while since you connected with ${n} — open Bridges for a suggestion.` },
        { title: () => "A friendly nudge", body: (n) => `Thinking of ${n}? Open Bridges for a quick way to reach out.` },
        { title: (n) => `Say hi to ${n}`, body: () => "Open Bridges for a suggestion on what to say." },
      ];
      const dayKey = new Date().toISOString().slice(0, 10);
      let hash = 0;
      for (const ch of `${bestContact.id}${dayKey}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      const template = nudgeTemplates[hash % nudgeTemplates.length];

      const ok = await sendExpoPush(
        user.push_token,
        template.title(bestContact.name),
        template.body(bestContact.name),
        { contactId: bestContact.id },
      );
      if (ok) {
        await logNotifiedContacts(user.id, new Set([bestContact.id]), "suggestion");
        sent++;
        console.log(`[push]   → delivered OK`);
      } else {
        console.log(`[push]   → delivery failed (Expo push service error)`);
      }
    }

    console.log(`[push] Suggestion nudge run complete: ${sent} sent`);
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
    await sendProfileCompletionPushes().catch((err) => console.error("[push] Uncaught:", err));
  }

  // Catch-up run ~15s after startup — fires immediately if a user's 9am/midnight window
  // is currently open. Guards are inside sendDailyReminders/sendSuggestionNudges so this
  // is always safe to call; it simply skips users outside their delivery window.
  setTimeout(() => {
    runHourly().catch((err) => console.error("[push] Startup catch-up error:", err));
  }, 15_000);

  // First run at the top of the next hour, then every hour after that
  setTimeout(() => {
    runHourly();
    setInterval(runHourly, MS_PER_HOUR);
  }, msUntilNextHour());

  console.log("[push] Hourly notification scheduler started (delivers at 9am/5pm per user timezone)");
}
