import { db, pool } from "./db";
import { users, contacts, hangoutVotes, hangoutOptions, hangoutPlans } from "@shared/schema";
import { isNotNull, eq } from "drizzle-orm";
import { getDaysUntilBirthday, getDaysUntilBirthdayInTz, getDaysSince } from "./birthday-utils";
export { getDaysUntilBirthday };

interface CustomReminder {
  label: string;
  date: string;
}

// notifType drives per-type dedup so birthday logs don't suppress check-in
// logs and vice versa.
// "birthday"  — day-of birthday (actual birthday, not custom)
// "custom"    — custom reminders: day-of AND advance (7d/14d/30d)
// "reminder"  — check-in overdue
// "milestone" — birthday advance notices (C1: 30d/14d/7d, C2: 7d)
export interface PushMessage {
  title: string;
  body: string;
  contactId?: string;
  notifType: "birthday" | "custom" | "reminder" | "milestone";
}

export type ContactRow = {
  id: string;
  name: string;
  circleLevel: number;
  birthday?: string | null;
  lastContacted?: string | null;
  lastHangout?: string | null;
  customReminders?: unknown;
};

// Birthday day-of messages — delivered when the hourly run fires on the birthday.
// timezone must be the user's local timezone so day-of detection uses their calendar
// date, not the server's UTC date (critical for timezones ahead of UTC).
export function buildBirthdayDayOfMessages(contact: ContactRow, timezone: string): PushMessage[] {
  const messages: PushMessage[] = [];
  const daysUntil = getDaysUntilBirthdayInTz(contact.birthday, timezone);
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
export function buildReminderMessages(contact: ContactRow, timezone: string): PushMessage[] {
  const messages: PushMessage[] = [];
  const daysUntilBirthday = getDaysUntilBirthdayInTz(contact.birthday, timezone);

  if (contact.circleLevel === 1) {
    // Check-in overdue: > 17 days (in-app card shows at 14d; push fires 3 days later)
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact === null || daysSinceContact > 17) {
      messages.push({
        title: `Time to check in with ${contact.name}`,
        body: `Open the app to confirm when you last spoke.`,
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
    buildCustomReminderMessages(contact, [30, 14, 7, 0], timezone, messages);
  } else if (contact.circleLevel === 2) {
    // Check-in overdue: > 48 days (in-app card shows at 45d; push fires 3 days later)
    const daysSinceContact = getDaysSince(contact.lastContacted);
    if (daysSinceContact !== null && daysSinceContact > 48) {
      messages.push({
        title: `Time to check in with ${contact.name}`,
        body: `Open the app to confirm when you last spoke.`,
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
    buildCustomReminderMessages(contact, [7, 0], timezone, messages);
  } else if (contact.circleLevel === 3) {
    // Check-in overdue: > 78 days (in-app card shows at 75d; push fires 3 days later)
    const daysSinceContact3 = getDaysSince(contact.lastContacted);
    if (daysSinceContact3 !== null && daysSinceContact3 > 78) {
      messages.push({
        title: `Time to check in with ${contact.name}`,
        body: `Open the app to confirm when you last spoke.`,
        contactId: contact.id,
        notifType: "reminder",
      });
    }
    // Custom reminders: C3 day-of only
    buildCustomReminderMessages(contact, [0], timezone, messages);
  }

  return messages;
}

function buildCustomReminderMessages(
  contact: ContactRow,
  milestones: number[],
  timezone: string,
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
    const daysUntil = getDaysUntilBirthdayInTz(cr.date, timezone);
    if (daysUntil === null) continue;
    if (!milestones.includes(daysUntil)) continue;

    // All custom reminders (day-of and advance) use notifType "custom" so they
    // have their own dedup namespace and can be priority-sorted independently
    // from actual birthdays and birthday milestones.
    if (daysUntil === 0) {
      messages.push({
        title: `${cr.label} — ${contact.name}`,
        body: `Today is ${contact.name}'s ${cr.label}.`,
        contactId: contact.id,
        notifType: "custom",
      });
    } else if (daysUntil === 7) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is coming up`,
        body: `${contact.name}'s ${cr.label} is a week away.`,
        contactId: contact.id,
        notifType: "custom",
      });
    } else if (daysUntil === 14) {
      messages.push({
        title: `${contact.name}'s ${cr.label} in 2 weeks`,
        body: `${contact.name}'s ${cr.label} is 2 weeks away.`,
        contactId: contact.id,
        notifType: "custom",
      });
    } else if (daysUntil === 30) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is a month away`,
        body: `${contact.name}'s ${cr.label} is coming up in a month.`,
        contactId: contact.id,
        notifType: "custom",
      });
    }
  }
}

// ─── 24-hour per-contact deduplication ───────────────────────────────────────

// Exported for unit testing. Filters a list of push messages so that:
//   - contacts already in `recentIds` (sent within the last 24 h under the same
//     notifType namespace) are dropped,
//   - only the first message per contactId is kept when duplicates appear in one
//     batch (same-run dedup).
// Messages without a contactId are always passed through.
export function dedupMessages(msgs: PushMessage[], recentIds: Set<string>): PushMessage[] {
  const seen = new Set<string>();
  return msgs.filter((m) => {
    if (!m.contactId) return true;
    if (recentIds.has(m.contactId)) return false;
    if (seen.has(m.contactId)) return false;
    seen.add(m.contactId);
    return true;
  });
}

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

export async function logNotifiedContacts(userId: string, contactIds: Set<string>, notifType: string): Promise<void> {
  for (const contactId of contactIds) {
    let inserted = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await pool.query(
          `INSERT INTO notification_log (user_id, contact_id, notif_type) VALUES ($1, $2, $3)`,
          [userId, contactId, notifType],
        );
        inserted = true;
        break;
      } catch (err) {
        if (attempt === 2) {
          console.warn(
            `[push-notifications] logNotifiedContacts: failed to insert dedup record after 2 attempts`,
            { userId, contactId, notifType, error: err instanceof Error ? err.message : String(err) },
          );
        }
      }
    }
    void inserted;
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

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Returns true on success, false on a transient/unknown error, or "expired"
 * when Expo tells us the token is no longer valid (HTTP 404 or DeviceNotRegistered
 * in the response body). Callers that receive "expired" must clear the token from
 * the DB so the server doesn't keep retrying a dead address.
 */
async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean | "expired"> {
  try {
    const payload = { to: token, title, body, sound: "default", data: data ?? {} };
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`[push] HTTP 404 for token ${token.slice(0, 20)}… — token is expired`);
        return "expired";
      }
      console.error(`[push] HTTP ${res.status} sending to ${token.slice(0, 20)}…`);
      return false;
    }
    // Even on HTTP 200 Expo can report DeviceNotRegistered inside the body.
    // When sending a single message object (our case), Expo returns data as a
    // plain object; when sending an array it returns data as an array. Handle both.
    try {
      const json = await res.json() as {
        data?: { status?: string; details?: { error?: string } } | Array<{ status?: string; details?: { error?: string } }>;
      };
      // Normalise to a single ticket entry regardless of shape
      const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
      if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
        console.warn(`[push] DeviceNotRegistered for token ${token.slice(0, 20)}… — token is expired`);
        return "expired";
      }
      // Log unexpected non-success shapes at debug level so they surface without
      // blocking delivery of genuinely successful sends.
      if (ticket?.status === "error") {
        console.warn(`[push] Expo push error for token ${token.slice(0, 20)}…: ${JSON.stringify(ticket)}`);
      }
    } catch {
      // JSON parse failed — HTTP was OK so treat as delivered
    }
    return true;
  } catch (err) {
    console.error("[push] Failed to send notification:", err);
    return false;
  }
}

/** Clears an expired push token from the DB so the scheduler skips this user next run. */
async function clearExpiredPushToken(userId: string, token: string): Promise<void> {
  try {
    // Guard: only clear if the token in the DB still matches (a foreground re-register
    // could have already replaced it with a fresh token between the select and here).
    await pool.query(
      `UPDATE users SET push_token = NULL WHERE id = $1 AND push_token = $2`,
      [userId, token],
    );
    console.warn(`[push] Cleared expired push token for user ${userId.slice(0, 8)}`);
  } catch (err) {
    console.error(`[push] Failed to clear expired token for user ${userId.slice(0, 8)}:`, err);
  }
}

// ─── Per-user local-time checks ───────────────────────────────────────────────

/**
 * Normalise the raw hour string returned by `Intl.DateTimeFormat` with
 * `hour12: false`.  Some runtimes/locales return "24" instead of "0" for
 * midnight; this utility centralises the guard so every future caller that
 * parses Intl hour output gets the correct 0–23 value automatically.
 */
export function parseIntlHour(raw: string): number {
  const h = parseInt(raw, 10);
  return h === 24 ? 0 : h;
}

export function getLocalHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseIntlHour(formatter.format(new Date()));
  } catch {
    console.warn(
      `[push] getLocalHour: unrecognised timezone "${timezone}", falling back to UTC. ` +
      `User will receive pushes at the wrong local hour until their timezone is corrected.`
    );
    return new Date().getUTCHours();
  }
}

export function getLocalMinute(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      minute: "numeric",
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return new Date().getUTCMinutes();
  }
}

// Returns the local day-of-week (0=Sun … 6=Sat) in the given timezone.
// Implementation note: this function uses the `weekday: "short"` Intl option
// (string-based day lookup) rather than deriving the day from an hour value.
// This means the 24→0 midnight edge case that affects hour-based Intl output
// does NOT apply here.  If this function is ever refactored to derive the day
// from an hour offset (e.g. using `hour: "numeric", hour12: false`), the raw
// Intl hour string must be passed through `parseIntlHour()` first to guard
// against runtimes that return "24" instead of "0" at midnight.
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function getLocalDayOfWeek(timezone: string): number {
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(new Date());
    const idx = DAY_SHORT.indexOf(short as (typeof DAY_SHORT)[number]);
    return idx >= 0 ? idx : new Date().getDay();
  } catch {
    console.warn(
      `[push] getLocalDayOfWeek: unrecognised timezone "${timezone}", falling back to server local day. ` +
      `User will receive pushes on the wrong local day until their timezone is corrected.`
    );
    return new Date().getDay();
  }
}

// Returns true if it is currently between 9:00 and 9:59 in the given timezone.
export function isNineAmLocalNow(timezone: string): boolean {
  return getLocalHour(timezone) === 9;
}

// Returns true if it is currently between 17:00 and 17:59 in the given timezone.
export function isFivePmLocalNow(timezone: string): boolean {
  return getLocalHour(timezone) === 17;
}

// ─── Daily reminder dispatch ──────────────────────────────────────────────────

/**
 * Runs the 9am / 5pm delivery logic for a single user with a known push token.
 *
 * Extracted from the hourly loop so it can also be called directly after a new
 * token is registered — allowing a user who re-registers mid-window (e.g. after
 * their expired token was just cleared) to receive the notification they would
 * have missed waiting for the next scheduled run.
 *
 * Returns the number of messages successfully delivered (0 if outside a window,
 * nothing eligible, all dedup'd, or the token expired again).
 */
export async function sendRemindersForUser(
  userId: string,
  pushToken: string,
  timezone: string,
): Promise<number> {
  const tz = timezone || "UTC";
  const isNineAm = isNineAmLocalNow(tz);
  const isFivePm = isFivePmLocalNow(tz);

  if (!isNineAm && !isFivePm) return 0;

  const userContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId));

  // ── Build message pools per window ────────────────────────────────────────
  //
  // 9am (cap*):  day-of birthday (all, uncapped)  OR  1× custom > 1× check-in
  // 5pm (cap 1): check-in overdue  >  birthday advance milestone (C1/C2)
  //
  // * Multiple contacts can share a birthday — all fire at 9am. If any birthday
  //   fires, custom and check-in are skipped that morning to avoid flooding.
  //
  const nineAmBirthdayMsgs: PushMessage[] = [];
  const nineAmCustomMsgs: PushMessage[] = [];
  const nineAmReminderMsgs: PushMessage[] = [];
  const fivePmReminderMsgs: PushMessage[] = [];
  const fivePmMilestoneMsgs: PushMessage[] = [];

  for (const contact of userContacts) {
    if (isNineAm) {
      for (const msg of buildBirthdayDayOfMessages(contact, tz)) {
        nineAmBirthdayMsgs.push(msg);
      }
    }
    for (const msg of buildReminderMessages(contact, tz)) {
      switch (msg.notifType) {
        case "reminder":
          if (isNineAm) nineAmReminderMsgs.push(msg);
          if (isFivePm) fivePmReminderMsgs.push(msg);
          break;
        case "custom":
          if (isNineAm) nineAmCustomMsgs.push(msg);
          break;
        case "milestone":
          if (isFivePm) fivePmMilestoneMsgs.push(msg);
          break;
      }
    }
  }

  // ── 24h dedup: each type has its own namespace ─────────────────────────────
  const recentBirthdayIds  = await getRecentlySentContactIds(userId, ["birthday"]);
  const recentCustomIds    = await getRecentlySentContactIds(userId, ["custom"]);
  const recentReminderIds  = await getRecentlySentContactIds(userId, ["reminder", "elevation"]);
  const recentMilestoneIds = await getRecentlySentContactIds(userId, ["milestone"]);

  // ── 9am selection ─────────────────────────────────────────────────────────
  const nineAmMsgs: PushMessage[] = [];
  if (isNineAm) {
    const filteredBirthdays = dedupMessages(nineAmBirthdayMsgs, recentBirthdayIds);
    if (filteredBirthdays.length > 0) {
      nineAmMsgs.push(...filteredBirthdays);
    } else {
      const fallback = [
        ...dedupMessages(nineAmCustomMsgs, recentCustomIds),
        ...dedupMessages(nineAmReminderMsgs, recentReminderIds),
      ];
      if (fallback[0]) nineAmMsgs.push(fallback[0]);
    }
  }

  // ── 5pm selection ─────────────────────────────────────────────────────────
  // Cross-type same-contact guard: if contact X already received a birthday or
  // custom push today, suppress their check-in at 5pm (delay to tomorrow).
  let fivePmMsg: PushMessage | null = null;
  if (isFivePm) {
    const crossTypeBlockIds = new Set([...recentBirthdayIds, ...recentCustomIds]);
    const filteredReminder = dedupMessages(
      fivePmReminderMsgs,
      new Set([...recentReminderIds, ...crossTypeBlockIds]),
    );
    const filteredMilestone = dedupMessages(fivePmMilestoneMsgs, recentMilestoneIds);
    fivePmMsg = [...filteredReminder, ...filteredMilestone][0] ?? null;
  }

  const toSend = [...nineAmMsgs, ...(fivePmMsg ? [fivePmMsg] : [])];

  if (toSend.length === 0) {
    const totalBuilt = nineAmBirthdayMsgs.length + nineAmCustomMsgs.length +
      nineAmReminderMsgs.length + fivePmReminderMsgs.length + fivePmMilestoneMsgs.length;
    if (totalBuilt > 0) {
      console.log(`[push]   user ${userId.slice(0, 8)}: eligible messages exist but all in 24h dedup window`);
    }
    return 0;
  }

  console.log(
    `[push]   user ${userId.slice(0, 8)}: sending ${toSend.length} notification(s) ` +
    `[${toSend.map((m) => `${m.notifType}@${(m.contactId ?? "?").slice(0, 8)}`).join(", ")}]`,
  );

  // ── Send & log ─────────────────────────────────────────────────────────────
  const notifiedByType = new Map<string, Set<string>>();
  let sent = 0;

  for (const msg of toSend) {
    const result = await sendExpoPush(
      pushToken,
      msg.title,
      msg.body,
      msg.contactId ? { contactId: msg.contactId } : undefined,
    );
    if (result === "expired") {
      await clearExpiredPushToken(userId, pushToken);
      return 0;
    }
    if (result && msg.contactId) {
      if (!notifiedByType.has(msg.notifType)) notifiedByType.set(msg.notifType, new Set());
      notifiedByType.get(msg.notifType)!.add(msg.contactId);
      sent++;
      console.log(`[push]     sent [${msg.notifType}] "${msg.title.slice(0, 50)}" → contact ${msg.contactId.slice(0, 8)}`);
    }
  }

  for (const [type, ids] of notifiedByType.entries()) {
    await logNotifiedContacts(userId, ids, type);
  }

  return sent;
}

export async function sendDailyReminders() {
  console.log("[push] Checking per-user reminders (9am and 5pm windows; 1 push per window per user)…");
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
      sent += await sendRemindersForUser(user.id, user.pushToken, user.notificationTimezone ?? "UTC");
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

      const result = await sendExpoPush(
        user.pushToken,
        "Complete your Bridges profile",
        "Some of your Core contacts are missing birthdays — add them to unlock reminders.",
      );
      if (result === "expired") {
        await clearExpiredPushToken(user.id, user.pushToken);
        continue;
      }
      if (result) {
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

      const result = await sendExpoPush(
        user.push_token,
        template.title(bestContact.name),
        template.body(bestContact.name),
        { contactId: bestContact.id },
      );
      if (result === "expired") {
        await clearExpiredPushToken(user.id, user.push_token);
        console.log(`[push]   → token expired; cleared from DB`);
      } else if (result) {
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

// Module-level flag so that if the server restarts near an hour boundary and
// two scheduler ticks overlap, the second tick is a no-op rather than sending
// duplicate notifications or consuming the per-day dedup budget twice.
let schedulerRunning = false;

export function scheduleDailyNotifications() {
  const MS_PER_15MIN = 15 * 60 * 1000;

  function msUntilNext15Min(): number {
    const now = Date.now();
    return MS_PER_15MIN - (now % MS_PER_15MIN);
  }

  async function runTick() {
    if (schedulerRunning) {
      console.log("[push] Scheduler tick skipped — previous run still in progress");
      return;
    }
    schedulerRunning = true;
    try {
      await sendDailyReminders().catch((err) => console.error("[push] Uncaught:", err));
      await sendSuggestionNudges().catch((err) => console.error("[push] Uncaught:", err));
      await sendProfileCompletionPushes().catch((err) => console.error("[push] Uncaught:", err));
    } finally {
      schedulerRunning = false;
    }
  }

  // Catch-up run ~15s after startup — fires immediately if a user's 9am/6:15pm window
  // is currently open. Guards are inside sendDailyReminders/sendSuggestionNudges so this
  // is always safe to call; it simply skips users outside their delivery window.
  setTimeout(() => {
    runTick().catch((err) => console.error("[push] Startup catch-up error:", err));
  }, 15_000);

  // Align to the next 15-minute boundary (:00, :15, :30, :45), then tick every 15 min
  setTimeout(() => {
    runTick();
    setInterval(runTick, MS_PER_15MIN);
  }, msUntilNext15Min());

  console.log("[push] Notification scheduler started (delivers at 9am/5pm per user timezone)");
}
