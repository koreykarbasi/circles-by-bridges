import { db, pool } from "./db";
import { users, contacts, hangoutVotes, hangoutOptions, hangoutPlans } from "@shared/schema";
import { isNotNull, eq } from "drizzle-orm";
import { getDaysUntilBirthday, getDaysUntilBirthdayInTz } from "./birthday-utils";
export { getDaysUntilBirthday };
import { importPKCS8, SignJWT } from "jose";
import http2 from "http2";
import {
  CIRCLE_COOLDOWN_DAYS,
  ELEVATION_SCORE_BONUS,
  elevationBonusForAge,
  elevationPhaseForAge,
  PRIORITY_COHORT_SIZE,
  scorePrioritySuggestion,
  selectSuggestionForDelivery,
} from "@shared/suggestion-priority";
import {
  CHECKIN_THRESHOLDS,
  isCheckinQuickPickEligible,
} from "@shared/reminder-thresholds";
import { getCheckinDaysSince } from "@shared/checkin-time";

interface CustomReminder {
  label: string;
  date: string;
}

// notifType drives per-type dedup so birthday logs don't suppress check-in
// logs and vice versa.
// "birthday"  — day-of birthday (actual birthday, not custom)
// "custom"    — custom reminders: day-of AND advance (7d/14d/30d)
// "reminder"  — check-in overdue
// "milestone" — birthday advance notices (C1: 30d/14d/7d/1d, C2: 7d)
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
  createdAt?: string | Date | null;
  emptyLastContactPromptDueAt?: string | Date | null;
};

function getContactDaysSince(
  value: string | Date | null | undefined,
  timezone: string,
  now = new Date(),
): number | null {
  return getCheckinDaysSince(value, timezone, now);
}

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
    // A quick-pick visible in the app is immediately eligible for the selected
    // daily reminder. Keep this aligned with lib/reminders.ts.
    const daysSinceContact = getContactDaysSince(contact.lastContacted, timezone);
    const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
    if (isCheckinQuickPickEligible(1, daysSinceContact, daysSinceCreated, contact.emptyLastContactPromptDueAt)) {
      messages.push({
        title: `Check in with ${contact.name}`,
        body: `Open the app to confirm when you last spoke.`,
        contactId: contact.id,
        notifType: "reminder",
      });
    }
    // Birthday advance milestones (day-of handled separately)
    if (daysUntilBirthday !== null && daysUntilBirthday > 0) {
      if (daysUntilBirthday === 1) {
        messages.push({
          title: `${contact.name}'s birthday is tomorrow`,
          body: `${contact.name}'s birthday is tomorrow — make sure you're ready to celebrate!`,
          contactId: contact.id,
          notifType: "milestone",
        });
      } else if (daysUntilBirthday === 7) {
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
    // Keep the server threshold identical to the visible quick-pick threshold.
    const daysSinceContact = getContactDaysSince(contact.lastContacted, timezone);
    const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
    if (isCheckinQuickPickEligible(2, daysSinceContact, daysSinceCreated, contact.emptyLastContactPromptDueAt)) {
      messages.push({
        title: `Check in with ${contact.name}`,
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
    // Keep the server threshold identical to the visible quick-pick threshold.
    const daysSinceContact3 = getContactDaysSince(contact.lastContacted, timezone);
    const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
    if (isCheckinQuickPickEligible(3, daysSinceContact3, daysSinceCreated, contact.emptyLastContactPromptDueAt)) {
      messages.push({
        title: `Check in with ${contact.name}`,
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

export async function pruneOldNotificationLog(): Promise<void> {
  try {
    // Keep suggestion delivery/dismissal history 60 days for rotation and cooldowns.
    // Priority snapshots are current user state, not historical events, so they
    // remain until Home atomically replaces them or the user account is deleted.
    // All other notification types prune after 7 days.
    await pool.query(
      `DELETE FROM notification_log
       WHERE sent_at < NOW() - INTERVAL '7 days'
         AND notif_type NOT IN (
           'suggestion',
           'suggestion_push',
           'suggestion_dismissed',
           'suggestion_priority_1',
           'suggestion_priority_2',
           'suggestion_priority_3'
         )`,
    );
    await pool.query(
      `DELETE FROM notification_log
       WHERE sent_at < NOW() - INTERVAL '60 days'
         AND notif_type NOT IN (
           'suggestion_priority_1',
           'suggestion_priority_2',
           'suggestion_priority_3'
         )`,
    );
  } catch {
    // Non-fatal
  }
}

// ─── Expo push sender ─────────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
type PushDeliveryResult = "accepted" | "rejected" | "expired" | "uncertain";

/**
 * Distinguishes provider acceptance, definitive rejection, an expired token,
 * and transport errors where the provider may have accepted the request.
 */
async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushDeliveryResult> {
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
      return "rejected";
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
      if (ticket?.status === "error" && ticket?.details?.error === "InvalidCredentials") {
        console.error(
          `[push] *** CREDENTIAL FAILURE *** InvalidCredentials for token ${token.slice(0, 30)}…\n` +
          `[push] This means the APNs credentials for the app bundle registered with Expo have expired or are missing.\n` +
          `[push] Full Expo response: ${JSON.stringify(ticket)}\n` +
          `[push] Token retained: this is an app-wide credential problem, not a device-specific token failure.\n` +
          `[push] FIX: Repair the Expo/APNs credential configuration and send again.`
        );
        return "rejected";
      }
      // Any other Expo-reported error is a definitive failure so callers
      // don't write a dedup entry for an undelivered notification.
      if (ticket?.status === "error") {
        console.error(`[push] Expo push error for token ${token.slice(0, 20)}…: ${JSON.stringify(ticket)}`);
        return "rejected";
      }
    } catch {
      // JSON parse failed — HTTP was OK so treat as delivered
    }
    return "accepted";
  } catch (err) {
    console.error("[push] Failed to send notification:", err);
    return "uncertain";
  }
}

// ─── Direct APNs (bypasses Expo's account-based credential routing) ───────────
// Used when the app registers an "apns:<hex>" device token instead of an
// ExponentPushToken. Sends directly to Apple's HTTP/2 push endpoint using the
// APNs Auth Key, so no Expo account association is involved.

let _apnsJwt: string | null = null;
let _apnsJwtIssuedAt = 0;
let _apnsClient: http2.ClientHttp2Session | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_apnsJwt && now - _apnsJwtIssuedAt < 55 * 60) return _apnsJwt;
  const keyP8 = process.env.APNS_AUTH_KEY_P8;
  const keyId = process.env.APNS_KEY_ID ?? "A95GG3Y47Y";
  const teamId = process.env.APNS_TEAM_ID ?? "5BJJ2KP2X5";
  if (!keyP8) throw new Error("[push] APNS_AUTH_KEY_P8 secret is not set");
  const privateKey = await importPKCS8(keyP8, "ES256");
  _apnsJwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuedAt()
    .setIssuer(teamId)
    .sign(privateKey);
  _apnsJwtIssuedAt = now;
  return _apnsJwt;
}

function getApnsClient(): http2.ClientHttp2Session {
  if (!_apnsClient || _apnsClient.destroyed) {
    _apnsClient = http2.connect("https://api.push.apple.com");
    _apnsClient.on("error", (err) => {
      console.error("[push] APNs HTTP/2 connection error:", err);
      _apnsClient = null;
    });
  }
  return _apnsClient;
}

async function sendApnsPush(
  deviceToken: string,
  title: string,
  body: string,
): Promise<PushDeliveryResult> {
  try {
    const jwt = await getApnsJwt();
    const bundleId = process.env.APNS_BUNDLE_ID ?? "app.replit.bridges";
    const client = getApnsClient();
    const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" } });

    return new Promise((resolve) => {
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        ":scheme": "https",
        ":authority": "api.push.apple.com",
        "authorization": `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
      });

      let status = 0;
      let responseBody = "";
      req.on("response", (h) => { status = h[":status"] as number; });
      req.on("data", (chunk) => { responseBody += chunk; });
      req.on("end", () => {
        if (status === 200) {
          resolve("accepted");
          return;
        }
        try {
          const json = JSON.parse(responseBody);
          if (json.reason === "Unregistered" || json.reason === "BadDeviceToken") {
            console.warn(`[push] APNs ${json.reason} for token ${deviceToken.slice(0, 10)}…`);
            resolve("expired");
          } else {
            console.error(`[push] APNs error ${status}: ${responseBody}`);
            resolve("rejected");
          }
        } catch {
          console.error(`[push] APNs error ${status}: ${responseBody}`);
          resolve("rejected");
        }
      });
      req.on("error", (err) => {
        console.error("[push] APNs request error:", err);
        _apnsClient = null;
        resolve("uncertain");
      });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.error("[push] sendApnsPush error:", err);
    return "rejected";
  }
}

/**
 * Routes to direct APNs (token starts with "apns:") or Expo push service.
 * This is the single send entry-point used by all scheduler paths.
 */
async function sendPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushDeliveryResult> {
  if (token.startsWith("apns:")) {
    return sendApnsPush(token.slice(5), title, body);
  }
  return sendExpoPush(token, title, body, data);
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

function normalizeNotificationTimezone(timezone: string): string {
  const candidate = timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    console.warn(
      `[push] Unrecognised notification timezone "${candidate}"; using UTC for delivery checks.`,
    );
    return "UTC";
  }
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

/**
 * True throughout the scheduled local hour.
 *
 * Autoscale may not start an instance at exactly :00 even when the heartbeat
 * begins before the delivery window. Keeping the full hour eligible lets the
 * startup catch-up and quarter-hour ticks recover from a delayed cold start.
 * Durable pre-send claims, per-user advisory locks, and delivery logs prevent
 * repeated ticks or concurrent instances from sending duplicates.
 */
export function isAtLocalDeliveryStart(
  timezone: string,
  targetHour: number,
  now = new Date(),
): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = parseIntlHour(parts.find((part) => part.type === "hour")?.value ?? "");
    return hour === targetHour;
  } catch {
    return now.getUTCHours() === targetHour;
  }
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
async function sendRemindersForUserUnlocked(
  userId: string,
  pushToken: string,
  timezone: string,
  scheduledAt: Date,
): Promise<number> {
  const tz = normalizeNotificationTimezone(timezone);
  const isNineAm = isAtLocalDeliveryStart(tz, 9, scheduledAt);
  const isFivePm = isAtLocalDeliveryStart(tz, 17, scheduledAt);

  if (!isNineAm && !isFivePm) return 0;

  // The scheduler runs every 15 minutes throughout the delivery hour. Treat the
  // first accepted/uncertain reminder batch as consuming that user's whole local
  // window, rather than merely deduplicating individual contacts. This still
  // allows every same-day birthday in the first 9am batch to be sent together.
  const windowLockResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM notification_log
     WHERE user_id = $1
       AND notif_type IN (
         'birthday', 'birthday_claim',
         'custom', 'custom_claim',
         'milestone', 'milestone_claim',
         'reminder', 'reminder_claim'
       )
       AND sent_at >= (
         date_trunc('hour', $3::timestamptz AT TIME ZONE $2)
         AT TIME ZONE $2
       )
       AND sent_at < (
         (date_trunc('hour', $3::timestamptz AT TIME ZONE $2) + INTERVAL '1 hour')
         AT TIME ZONE $2
       )`,
    [userId, tz, scheduledAt.toISOString()],
  );
  const alreadyConsumedThisWindow =
    parseInt(windowLockResult.rows[0]?.count ?? "0", 10) > 0;
  if (alreadyConsumedThisWindow) {
    const deliveryHour = isNineAm ? 9 : 17;
    console.log(
      `[push]   user ${userId.slice(0, 8)}: reminder window already consumed ` +
      `for local ${deliveryHour}:xx; skipping later tick`,
    );
    return 0;
  }

  const userContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId));

  // ── Build message pools per window ────────────────────────────────────────
  //
  // 9am (cap*): day-of birthday (all, uncapped) OR 1× custom > birthday
  // milestone > check-in. 5pm (cap 1): check-in overdue.
  //
  // * Multiple contacts can share a birthday — all fire at 9am. If any birthday
  //   fires, custom and check-in are skipped that morning to avoid flooding.
  //
  const nineAmBirthdayMsgs: PushMessage[] = [];
  const nineAmCustomMsgs: PushMessage[] = [];
  const nineAmMilestoneMsgs: PushMessage[] = [];
  const nineAmReminderMsgs: PushMessage[] = [];
  const fivePmReminderMsgs: PushMessage[] = [];

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
          if (isNineAm) nineAmMilestoneMsgs.push(msg);
          break;
      }
    }
  }

  // Match the app's visible quick-pick hierarchy instead of relying on database
  // insertion order. Birthday/custom messages have their own time-sensitive
  // priority rules; this sorter applies only to check-in quick-picks.
  const contactsById = new Map(
    (userContacts as ContactRow[]).map((contact) => [contact.id, contact]),
  );
  const reminderPriority = (msg: PushMessage): number => {
    const contact = msg.contactId ? contactsById.get(msg.contactId) : undefined;
    if (!contact) return 0;
    const circle = contact.circleLevel as 1 | 2 | 3;
    const days = getContactDaysSince(contact.lastContacted, tz);
    if (circle === 1) {
      return 100 + (days === null ? 80 : Math.min(80, 30 + Math.floor((days - CHECKIN_THRESHOLDS[1]) * 3)));
    }
    if (circle === 2) {
      return 60 + (days === null ? 60 : Math.min(60, 20 + Math.floor((days - CHECKIN_THRESHOLDS[2]) * 1.2)));
    }
    return 30 + (days === null ? 0 : Math.min(30, Math.floor((days - CHECKIN_THRESHOLDS[3]) * 0.4)));
  };
  const sortRemindersByVisiblePriority = (messages: PushMessage[]) =>
    messages.sort((a, b) =>
      reminderPriority(b) - reminderPriority(a) ||
      (a.title.localeCompare(b.title)) ||
      (a.contactId ?? "").localeCompare(b.contactId ?? ""),
    );
  sortRemindersByVisiblePriority(nineAmReminderMsgs);
  sortRemindersByVisiblePriority(fivePmReminderMsgs);

  // ── Swipe-away cooldown filter ────────────────────────────────────────────
  // When the user swipes a contact away in the suggestions feed, a 'suggestion'
  // row is inserted in notification_log. Reminder and milestone pushes must
  // honour the same per-circle cooldown so a dismissed contact doesn't
  // immediately resurface as a push notification.
  // Cooldown mirrors CIRCLE_COOLDOWN_DAYS in lib/suggestion-scheduler.ts:
  //   C1 = 7 days,  C2 = 5 days,  C3 = 15 days
  // Birthday (day-of) and custom reminders are NOT filtered — they are
  // time-sensitive events that should fire regardless of dismissal state.
  try {
    const cooldownResult = await pool.query<{ contact_id: string }>(
      `SELECT DISTINCT nl.contact_id
       FROM notification_log nl
       JOIN contacts c ON c.id = nl.contact_id AND c.user_id = $1
       WHERE nl.user_id = $1
         AND nl.notif_type IN ('suggestion_dismissed', 'suggestion', 'elevation')
         AND (
           (c.circle_level = 1 AND nl.sent_at > NOW() - INTERVAL '7 days')  OR
           (c.circle_level = 2 AND nl.sent_at > NOW() - INTERVAL '5 days')  OR
           (c.circle_level = 3 AND nl.sent_at > NOW() - INTERVAL '15 days')
         )`,
      [userId],
    );
    if (cooldownResult.rows.length > 0) {
      const cooldownIds = new Set(cooldownResult.rows.map((r) => r.contact_id));
      const applyCooldown = (msgs: PushMessage[]): PushMessage[] =>
        msgs.filter((m) => {
          if (!m.contactId || !cooldownIds.has(m.contactId)) return true;
          console.log(
            `[push]   skip [swipe-cooldown] "${m.title.slice(0, 50)}" — ` +
            `contact ${m.contactId.slice(0, 8)} dismissed recently`,
          );
          return false;
        });
      // Replace pool contents in-place so the dedup step sees filtered lists.
      // Only reminder/milestone types are filtered; birthday and custom are not.
      nineAmReminderMsgs.splice(0, Infinity, ...applyCooldown(nineAmReminderMsgs));
      fivePmReminderMsgs.splice(0, Infinity, ...applyCooldown(fivePmReminderMsgs));
      nineAmMilestoneMsgs.splice(0, Infinity, ...applyCooldown(nineAmMilestoneMsgs));
    }
  } catch (cooldownErr) {
    // Non-fatal: if the query fails, proceed without cooldown filtering rather
    // than silently dropping a legitimate push notification.
    console.warn(`[push]   swipe-cooldown check failed (non-fatal):`, cooldownErr);
  }

  // ── 24h dedup: each type has its own namespace ─────────────────────────────
  const recentBirthdayIds  = await getRecentlySentContactIds(userId, ["birthday", "birthday_claim"]);
  const recentCustomIds    = await getRecentlySentContactIds(userId, ["custom", "custom_claim"]);
  const recentReminderIds  = await getRecentlySentContactIds(userId, ["reminder", "reminder_claim", "elevation"]);
  const recentMilestoneIds = await getRecentlySentContactIds(userId, ["milestone", "milestone_claim"]);

  // ── 9am selection ─────────────────────────────────────────────────────────
  const nineAmMsgs: PushMessage[] = [];
  if (isNineAm) {
    const filteredBirthdays = dedupMessages(nineAmBirthdayMsgs, recentBirthdayIds);
    if (filteredBirthdays.length > 0) {
      nineAmMsgs.push(...filteredBirthdays);
    } else {
      const fallback = [
        ...dedupMessages(nineAmCustomMsgs, recentCustomIds),
        ...dedupMessages(nineAmMilestoneMsgs, recentMilestoneIds),
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
    fivePmMsg = filteredReminder[0] ?? null;
  }

  const toSend = [...nineAmMsgs, ...(fivePmMsg ? [fivePmMsg] : [])];

  if (toSend.length === 0) {
    const totalBuilt = nineAmBirthdayMsgs.length + nineAmCustomMsgs.length +
      nineAmMilestoneMsgs.length + nineAmReminderMsgs.length + fivePmReminderMsgs.length;
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
  let sent = 0;

  for (const msg of toSend) {
    if (!msg.contactId) continue;
    const claimType = `${msg.notifType}_claim`;
    // Claim before handing work to APNs/Expo. A restart after provider acceptance
    // remains blocked for the current dedup window instead of delivering a
    // duplicate. Each successful message is promoted immediately so a later
    // expired token cannot erase evidence of an earlier birthday delivery.
    const claimResult = await pool.query<{ id: string }>(
      `INSERT INTO notification_log (user_id, contact_id, notif_type)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, msg.contactId, claimType],
    );
    const claimId = claimResult.rows[0]?.id;
    if (!claimId) {
      throw new Error(`[push] Unable to create ${claimType} delivery claim`);
    }

    const result = await sendPush(
      pushToken,
      msg.title,
      msg.body,
      { contactId: msg.contactId },
    );
    if (result === "expired") {
      await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
      await clearExpiredPushToken(userId, pushToken);
      return sent;
    }
    if (result === "accepted") {
      await pool.query(
        `UPDATE notification_log
         SET notif_type = $2, sent_at = NOW()
         WHERE id = $1`,
        [claimId, msg.notifType],
      );
      sent++;
      console.log(`[push]     sent [${msg.notifType}] "${msg.title.slice(0, 50)}" → contact ${msg.contactId.slice(0, 8)}`);
    } else if (result === "rejected") {
      await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
    } else {
      console.warn(
        `[push]     delivery outcome uncertain [${msg.notifType}] for contact ` +
        `${msg.contactId.slice(0, 8)}; retaining claim to prevent a duplicate`,
      );
    }
  }

  return sent;
}

/**
 * Serializes reminder selection and its durable pre-send claims per user. This
 * protects the scheduled tick and token re-registration catch-up from sending
 * the same quick-pick before a 24-hour record exists.
 */
export async function sendRemindersForUser(
  userId: string,
  pushToken: string,
  timezone: string,
  scheduledAt = new Date(),
): Promise<number> {
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const result = await lockClient.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
      [`bridges:reminder:${userId}`],
    );
    lockAcquired = result.rows[0]?.acquired === true;
    if (!lockAcquired) {
      console.log(`[push]   user ${userId.slice(0, 8)}: reminder delivery already in progress`);
      return 0;
    }
    return await sendRemindersForUserUnlocked(userId, pushToken, timezone, scheduledAt);
  } finally {
    if (lockAcquired) {
      await lockClient
        .query(`SELECT pg_advisory_unlock(hashtext($1))`, [`bridges:reminder:${userId}`])
        .catch((err) => console.warn("[push] Failed to release reminder advisory lock:", err));
    }
    lockClient.release();
  }
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
    const scheduledAt = new Date();
    for (const user of usersWithTokens) {
      if (!user.pushToken) continue;
      try {
        sent += await sendRemindersForUser(
          user.id,
          user.pushToken,
          user.notificationTimezone ?? "UTC",
          scheduledAt,
        );
      } catch (userErr) {
        console.error(
          `[push] Reminder dispatch failed for user ${user.id.slice(0, 8)}; continuing with remaining users:`,
          userErr,
        );
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
// The server ranks the same top-three priority pool used by the suggestion UI.
// Reminder conflicts are removed only when choosing a push from that pool; they
// must not shrink or reorder the cohort returned to the app.

type SuggestionEventRow = {
  contact_id: string | null;
  notif_type: string;
  sent_at: string | Date;
};

export type PrioritySuggestionContact = ContactRow & {
  score: number;
  elevationPhase?: "none" | "deferred" | "due";
};

function hasHomeReminder(contact: ContactRow, timezone: string, now: Date): boolean {
  const circle = contact.circleLevel as 1 | 2 | 3;
  if (![1, 2, 3].includes(circle)) return false;

  const daysSinceContact = getContactDaysSince(contact.lastContacted, timezone);
  const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
  if (isCheckinQuickPickEligible(circle, daysSinceContact, daysSinceCreated, contact.emptyLastContactPromptDueAt, now)) return true;

  const reminderWindow = { 1: 30, 2: 7, 3: 0 }[circle];
  const birthdayDays = getDaysUntilBirthdayInTz(contact.birthday, timezone);
  if (birthdayDays !== null && birthdayDays >= 0 && birthdayDays <= reminderWindow) {
    return true;
  }

  const customReminders = Array.isArray(contact.customReminders)
    ? (contact.customReminders as CustomReminder[])
    : [];
  return customReminders.some((reminder) => {
    const days = getDaysUntilBirthdayInTz(reminder.date, timezone);
    return days !== null && days >= 0 && days <= reminderWindow;
  });
}

/**
 * Selects contacts for the daily suggestion push without changing Home's
 * published top-three ranking. We avoid a contact that has a visible quick-pick
 * when possible, but never drop the daily suggestion simply because all three
 * priority contacts also need attention.
 */
export function selectSuggestionPushCandidates(
  priorityCohort: PrioritySuggestionContact[],
  timezone: string,
  now = new Date(),
): PrioritySuggestionContact[] {
  // Defense in depth: a caller must never turn the pre-delay "Longer" answer
  // into an ordinary suggestion via the all-reminders fallback.
  const eligibleCohort = priorityCohort.filter(
    (contact) => contact.circleLevel !== 3 || contact.elevationPhase !== "deferred",
  );
  const reminderFree = eligibleCohort.filter(
    (contact) => !hasHomeReminder(contact, timezone, now),
  );
  return reminderFree.length > 0 ? reminderFree : eligibleCohort;
}

export async function getPrioritySuggestionCohort(
  userId: string,
  _timezone = "UTC",
  now = new Date(),
): Promise<PrioritySuggestionContact[]> {
  const [userContacts, eventResult, snapshotResult] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.userId, userId)),
    pool.query<SuggestionEventRow>(
      `SELECT contact_id, notif_type, sent_at
       FROM notification_log
       WHERE user_id = $1
         AND notif_type IN ('suggestion_dismissed', 'elevation')
         AND sent_at > NOW() - INTERVAL '15 days'
       ORDER BY sent_at DESC`,
      [userId],
    ),
    pool.query<{ contact_id: string; notif_type: string }>(
      `SELECT contact_id, notif_type
       FROM notification_log
       WHERE user_id = $1
         AND notif_type IN (
           'suggestion_priority_1',
           'suggestion_priority_2',
           'suggestion_priority_3'
         )
       ORDER BY notif_type ASC`,
      [userId],
    ),
  ]);

  const latestDismissal = new Map<string, Date>();
  const latestElevation = new Map<string, Date>();
  for (const event of eventResult.rows) {
    if (!event.contact_id) continue;
    const target =
      event.notif_type === "suggestion_dismissed" ? latestDismissal : latestElevation;
    if (!target.has(event.contact_id)) target.set(event.contact_id, new Date(event.sent_at));
  }

  const rankedContacts = (userContacts as ContactRow[])
    .filter((contact) => {
      const circle = contact.circleLevel as 1 | 2 | 3;
      if (![1, 2, 3].includes(circle)) return false;

      const dismissedAt = latestDismissal.get(contact.id);
      if (dismissedAt) {
        const elapsedDays = (now.getTime() - dismissedAt.getTime()) / 86_400_000;
        if (elapsedDays < CIRCLE_COOLDOWN_DAYS[circle]) return false;
      }
      const elevatedAt = latestElevation.get(contact.id);
      const elevationAgeHours = elevatedAt
        ? (now.getTime() - elevatedAt.getTime()) / 3_600_000
        : null;
      return circle !== 3 || elevationPhaseForAge(circle, elevationAgeHours) !== "deferred";
    })
    .map((contact) => {
      const circle = contact.circleLevel as 1 | 2 | 3;
      const elevatedAt = latestElevation.get(contact.id);
      const elevationAgeHours = elevatedAt
        ? (now.getTime() - elevatedAt.getTime()) / 3_600_000
        : null;
      const elevationBonus = elevationBonusForAge(circle, elevationAgeHours);
      const elevationPhase = elevationPhaseForAge(circle, elevationAgeHours);

      return {
        ...contact,
        elevationPhase,
        score: scorePrioritySuggestion(
          circle,
          null,
          getContactDaysSince(contact.lastContacted, _timezone, now),
          elevationBonus,
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const rankedById = new Map(rankedContacts.map((contact) => [contact.id, contact]));
  const publishedContacts: PrioritySuggestionContact[] = [];
  const publishedIds = new Set<string>();
  for (const row of snapshotResult.rows) {
    const contact = rankedById.get(row.contact_id);
    if (contact && !publishedIds.has(contact.id)) {
      publishedContacts.push(contact);
      publishedIds.add(contact.id);
    }
  }

  return [
    ...publishedContacts,
    ...rankedContacts.filter((contact) => !publishedIds.has(contact.id)),
  ].slice(0, PRIORITY_COHORT_SIZE);
}

// ─── Profile completion weekly push (Sunday 9am local) ───────────────────────

export async function sendProfileCompletionPushes() {
  try {
    const scheduledAt = new Date();
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
      if (!isAtLocalDeliveryStart(tz, 9, scheduledAt)) continue;
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

      const result = await sendPush(
        user.pushToken,
        "Complete your Bridges profile",
        "Some of your Core contacts are missing birthdays — add them to unlock reminders.",
      );
      if (result === "expired") {
        await clearExpiredPushToken(user.id, user.pushToken);
        continue;
      }
      if (result === "accepted") {
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

export async function sendSuggestionNudges(userId?: string) {
  const nowUtc = new Date().toISOString();
  console.log(`[push] sendSuggestionNudges running at ${nowUtc}`);
  try {
    const scheduledAt = new Date();
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
         AND COALESCE(suggestion_notif_frequency, 'daily') != 'off'
         ${userId ? "AND id = $1" : ""}`,
      userId ? [userId] : [],
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
      if (!isAtLocalDeliveryStart(tz, preferredHour, scheduledAt)) {
        console.log(`[push]   → skip: outside the ${preferredHour}:00 delivery start`);
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

      // Serialize selection and delivery per user across all server processes.
      // A dedicated connection is required because PostgreSQL advisory locks are
      // scoped to the session that acquired them.
      const lockClient = await pool.connect();
      let userLockAcquired = false;
      try {
        const advisoryResult = await lockClient.query<{ acquired: boolean }>(
          `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
          [`bridges:suggestion:${user.id}`],
        );
        userLockAcquired = advisoryResult.rows[0]?.acquired === true;
        if (!userLockAcquired) {
          console.log(`[push]   → skip: another process is handling this user's suggestion window`);
          continue;
        }

      // ── Per-user window lock ───────────────────────────────────────────────
      // The scheduler ticks every 15 minutes. Without this guard, all 4 ticks
      // in a 60-minute preferred-hour window (e.g. 17:00–17:59) would each pick
      // a *different* contact and send up to 4 suggestion pushes to the same user.
      // This query checks whether any suggestion has already been delivered in the
      // current calendar hour (in the user's local timezone). If yes, skip — the
      // next eligible window is the same preferred hour tomorrow (or in N days for
      // 3x_week/weekly frequencies).
      try {
        const windowLockResult = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM notification_log
           WHERE user_id = $1
               AND notif_type IN ('suggestion_claim', 'suggestion_push', 'suggestion')
             AND sent_at >= (date_trunc('hour', NOW() AT TIME ZONE $2) AT TIME ZONE $2)`,
          [user.id, tz],
        );
        const alreadySentThisWindow = parseInt(windowLockResult.rows[0]?.count ?? "0", 10) > 0;
        if (alreadySentThisWindow) {
          console.log(`[push]   → skip: suggestion already sent in this ${preferredHour}:xx window`);
          continue;
        }
      } catch (lockErr) {
        // Non-fatal: if the check fails, fall through and let the per-contact dedup
        // act as a softer guard rather than silently dropping the notification.
        console.warn(`[push]   window lock check failed (non-fatal):`, lockErr);
      }

      const priorityCohort = await getPrioritySuggestionCohort(user.id, tz);
      if (priorityCohort.length === 0) {
        console.log(`[push]   → skip: no eligible contacts in priority cohort`);
        continue;
      }
      const pushCandidates = selectSuggestionPushCandidates(priorityCohort, tz);
      const usingReminderFallback = pushCandidates.length === priorityCohort.length &&
        pushCandidates.every((contact, index) => contact.id === priorityCohort[index]?.id) &&
        priorityCohort.every((contact) => hasHomeReminder(contact, tz, new Date()));

      const lastSuccessfulResult = await pool.query<{ contact_id: string }>(
        `SELECT contact_id
         FROM notification_log
         WHERE user_id = $1
           AND notif_type = 'suggestion_push'
         ORDER BY sent_at DESC
         LIMIT 2`,
        [user.id],
      );
      const bestContact = selectSuggestionForDelivery(
        pushCandidates,
        lastSuccessfulResult.rows.map((row) => row.contact_id),
      );
      if (!bestContact) continue;

      console.log(
        `[push]   → cohort: ${priorityCohort.map((contact) => contact.name).join(", ")}; ` +
        `push-eligible: ${pushCandidates.map((contact) => contact.name).join(", ")}; ` +
        `sending "${bestContact.name}" score=${bestContact.score}` +
        (usingReminderFallback ? " (all priority contacts are quick-picks; daily suggestion retained)" : ""),
      );

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

      // Claim the window before the external APNs/Expo call. If this process dies
      // after Apple accepts the push but before success is logged, the claim keeps
      // a restart from sending an uncertain duplicate in the same hour.
      const claimResult = await pool.query<{ id: string }>(
        `INSERT INTO notification_log (user_id, contact_id, notif_type)
         VALUES ($1, $2, 'suggestion_claim')
         RETURNING id`,
        [user.id, bestContact.id],
      );
      const claimId = claimResult.rows[0].id;

      const result = await sendPush(
        user.push_token,
        template.title(bestContact.name),
        template.body(bestContact.name),
        { contactId: bestContact.id },
      );
      if (result === "expired") {
        await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
        await clearExpiredPushToken(user.id, user.push_token);
        console.log(`[push]   → token expired; cleared from DB`);
      } else if (result === "accepted") {
        await pool.query(
          `UPDATE notification_log
           SET notif_type = 'suggestion_push', sent_at = NOW()
           WHERE id = $1`,
          [claimId],
        );
        sent++;
        console.log(`[push]   → delivered OK`);
      } else if (result === "rejected") {
        await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
        console.log(`[push]   → delivery failed (Expo push service error)`);
      } else {
        console.warn(`[push]   → delivery outcome uncertain; retaining window claim`);
      }
      } finally {
        if (userLockAcquired) {
          await lockClient
            .query(`SELECT pg_advisory_unlock(hashtext($1))`, [`bridges:suggestion:${user.id}`])
            .catch((err) => console.warn("[push] Failed to release suggestion advisory lock:", err));
        }
        lockClient.release();
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

  async function runTick() {
    if (schedulerRunning) {
      console.log("[push] Scheduler tick skipped — previous run still in progress");
      return;
    }
    schedulerRunning = true;
    try {
      await Promise.all([
        sendDailyReminders().catch((err) => console.error("[push] Reminder dispatch failed:", err)),
        sendSuggestionNudges().catch((err) => console.error("[push] Suggestion dispatch failed:", err)),
        sendProfileCompletionPushes().catch((err) => console.error("[push] Profile dispatch failed:", err)),
      ]);
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
  }, millisecondsUntilNextQuarterHour());

  console.log("[push] Notification scheduler started (delivers at 9am/5pm per user timezone)");
}

/** Returns 0 when called exactly on a quarter-hour boundary. */
export function millisecondsUntilNextQuarterHour(now = Date.now()): number {
  const MS_PER_15MIN = 15 * 60 * 1000;
  const remainder = now % MS_PER_15MIN;
  return remainder === 0 ? 0 : MS_PER_15MIN - remainder;
}
