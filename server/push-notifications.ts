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
    // Check-in overdue: > 17 days (in-app card shows at 14d; push fires 3 days later)
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact === null || daysSinceContact > 17) {
      messages.push({
        title: `Spoken to ${contact.name} lately?`,
        body: `When was the last time you contacted ${contact.name}? Open the app to submit or get suggestions on what to say.`,
        contactId: contact.id,
      });
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
    // Check-in overdue: > 48 days (in-app card shows at 45d; push fires 3 days later)
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact !== null && daysSinceContact > 48) {
      messages.push({
        title: `Spoken to ${contact.name} lately?`,
        body: `When was the last time you contacted ${contact.name}? Open the app to submit or get suggestions on what to say.`,
        contactId: contact.id,
      });
    }
    // Hangout-overdue reminders are intentionally never pushed — they are shown
    // in-app only (quick-pick card), matching hangout-quickpick reminders on circle 1/3.
    // Custom reminders: C2 advance at 7/day-of
    buildCustomReminderMessages(contact, [7, 0], messages);
  } else if (contact.circleLevel === 3) {
    // Check-in overdue: > 78 days (in-app card shows at 75d; push fires 3 days later)
    const daysSinceContact3 = getDaysSince(contact.lastContacted);
    if (daysSinceContact3 !== null && daysSinceContact3 > 78) {
      messages.push({
        title: `Spoken to ${contact.name} lately?`,
        body: `When was the last time you contacted ${contact.name}? Open the app to submit or get suggestions on what to say.`,
        contactId: contact.id,
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

async function getRecentlySentContactIds(userId: string, types: string[]): Promise<Set<string>> {
  try {
    const placeholders = types.map((_, i) => `$${i + 2}`).join(", ");
    const result = await pool.query<{ contact_id: string }>(
      `SELECT DISTINCT contact_id FROM notification_log
       WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '24 hours'
         AND (notif_type IS NULL OR notif_type IN (${placeholders}))`,
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

// ─── Daily reminder dispatch ──────────────────────────────────────────────────

export async function sendDailyReminders() {
  console.log("[push] Checking per-user reminders (runs hourly; per-contact 24h dedup spreads delivery through the day)…");
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

      const userContacts = await db
        .select()
        .from(contacts)
        .where(eq(contacts.userId, user.id));

      // Checked every hour rather than gated to a single fixed slot, so a reminder
      // that becomes newly active (e.g. a check-in crosses its overdue threshold,
      // or a birthday milestone hits) is delivered on the very next hourly run
      // instead of waiting for one bundled daily window. The per-contact 24h
      // dedup below still prevents repeat spam for the same reminder.
      const messages: PushMessage[] = [];
      for (const contact of userContacts) {
        messages.push(...buildBirthdayDayOfMessages(contact));
        messages.push(...buildReminderMessages(contact));
      }

      // Collapse to one message per contact (first/highest-priority wins)
      const seenInRun = new Set<string>();
      const deduped = messages.filter((msg) => {
        if (!msg.contactId) return true;
        if (seenInRun.has(msg.contactId)) return false;
        seenInRun.add(msg.contactId);
        return true;
      });

      // Deduplicate: skip contacts already notified via reminder or elevation in last 24h.
      // Does NOT filter out suggestion-type entries so the two paths don't suppress each other.
      const recentContactIds = await getRecentlySentContactIds(user.id, ["reminder", "elevation"]);
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

      // Log newly notified contacts for future deduplication (type: reminder)
      if (notifiedContactIds.size > 0) {
        await logNotifiedContacts(user.id, notifiedContactIds, "reminder");
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

      // Rate-limit: only send if last_profile_push_at is null or > 6 days ago
      if (user.lastProfilePushAt) {
        const daysSinceLastPush = Math.floor(
          (Date.now() - new Date(user.lastProfilePushAt).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSinceLastPush <= 6) continue;
      }

      // Count C1 contacts missing a birthday
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

      // Frequency-matched dedup window — filters suggestion + elevation types only.
      // Reminder-type entries are intentionally excluded so daily reminders at 9am
      // do not suppress the suggestion nudge that fires immediately after.
      const windowHours = dedupWindowHours(freq);
      const recentResult = await pool.query<{ contact_id: string }>(
        `SELECT DISTINCT contact_id FROM notification_log
         WHERE user_id = $1 AND sent_at > NOW() - make_interval(hours => $2)
           AND (notif_type IS NULL OR notif_type IN ('suggestion', 'elevation'))`,
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

      // Days since each contact was last pushed (server-side cooldown equivalent)
      const lastPushedResult = await pool.query<{ contact_id: string; last_sent: string }>(
        `SELECT contact_id, MAX(sent_at) AS last_sent
         FROM notification_log WHERE user_id = $1 GROUP BY contact_id`,
        [user.id],
      );
      const lastPushedMap = new Map(
        lastPushedResult.rows.map((r) => [r.contact_id, r.last_sent]),
      );

      const scored: { id: string; name: string; score: number; lastPushedAt: number }[] = [];

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
        scored.push({
          id: c.id,
          name: c.name,
          score,
          lastPushedAt: lastPushed ? new Date(lastPushed).getTime() : 0,
        });
      }

      if (scored.length === 0) {
        console.log(`[push]   → skip: all ${contactsResult.rows.length} contacts in dedup window`);
        continue;
      }

      // Rotate among the top-3 scored candidates instead of always picking the
      // single highest scorer — otherwise the same contact (e.g. the one with the
      // longest-standing overdue check-in) wins every single day. Among the top-3,
      // prefer whichever was least-recently pushed (never-pushed contacts first).
      scored.sort((a, b) => b.score - a.score);
      const topCandidates = scored.slice(0, 3);
      topCandidates.sort((a, b) => a.lastPushedAt - b.lastPushedAt);
      const bestContact = { id: topCandidates[0].id, name: topCandidates[0].name };
      const bestScore = topCandidates[0].score;

      console.log(`[push]   → sending to user ${user.id.slice(0, 8)} for contact "${bestContact.id.slice(0, 8)}" score=${bestScore} (rotated among top ${topCandidates.length})`);

      // Vary the copy so the same body text doesn't repeat every time a contact is
      // nudged again — pick a template deterministically from contact id + day so
      // repeated runs on the same day for the same contact stay consistent.
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

      // Only log as notified if the push actually delivered (fix 404 burn bug)
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
