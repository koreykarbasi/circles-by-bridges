import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { pool } from "./db";
import { getPrompts, syncFromSheet } from "./prompts-sync";
import { sendHangoutFinalizedNotifications, sendSuggestionNudges, sendDailyReminders } from "./push-notifications";
import { sendPasswordResetEmail, sendHangoutCalendarInvite } from "./email";
import type { InsertContact } from "@shared/schema";
import * as chrono from "chrono-node";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Module-level singleton so the JWKS response is cached across requests.
// Apple's JWKS rotates rarely; 10-minute cache avoids a round-trip on every sign-in.
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
  { cacheMaxAge: 10 * 60 * 1000 }
);
const APPLE_BUNDLE_ID = "com.bridges.app";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

function bad(res: Response, message: string) {
  return res.status(400).json({ message });
}

const VALID_CIRCLE_LEVELS = [1, 2, 3] as const;
const VALID_HANGOUT_STATUSES = ["draft", "active", "finalized"] as const;
// 5 MB image → ~6.7 MB base64 string; cap at 7 MB of string length
const MAX_PHOTO_CHARS = 7 * 1024 * 1024;

// ── Outbound-integration abuse guards ──────────────────────────────────────
// Prompts sync: only allow callers that present the ADMIN_SYNC_SECRET token.
// The cooldown is a secondary guard; the secret is the primary gate.
let lastManualSyncAt = 0;
const MANUAL_SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Email invites: per-hangout 24 h lock is persisted in the DB
// (hangout_plans.invites_sent_at column, added at startup by migration).
// Per-user daily cap: a user may send invite batches for at most this many
// hangouts in any 24-hour window.
const MAX_EMAIL_INVITE_BATCHES_PER_USER_PER_DAY = 3;
const EMAIL_INVITE_COOLDOWN_HOURS = 24;

// Maximum recipients per batch (caps work even without per-user quota).
const MAX_EMAIL_INVITES_PER_HANGOUT = 20;

// Minimum account age before email invites are permitted.
// Newly created accounts (created_at IS NOT NULL and < this threshold) are
// blocked from triggering outbound mail, breaking the low-cost spam relay chain.
// Accounts created before this column was added have created_at = NULL and are
// always treated as established (no gate applied).
const MIN_ACCOUNT_AGE_FOR_INVITES_MS = 48 * 60 * 60 * 1000; // 48 hours

// Simple RFC-5321-compatible email pattern used for server-side validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ───────────────────────────────────────────────────────────────────────────

const CONTACT_WRITABLE_FIELDS = new Set([
  "name", "circleLevel", "interests", "labels", "birthday",
  "lastContacted", "lastHangout", "notes", "phone", "email", "photoUri",
  "customReminders",
]);

type SafeContactUpdate = Partial<Omit<InsertContact, "userId" | "avatarColor">>;

function pickContactFields(body: Record<string, unknown>): SafeContactUpdate {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (CONTACT_WRITABLE_FIELDS.has(k)) {
      result[k] = v;
    }
  }
  return result as SafeContactUpdate;
}

function generateShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Generates an unguessable per-invitee voting token map, keyed by
// lowercase-trimmed invitee name. Only the holder of a given invitee's
// personalized link (containing their token) can cast a ballot under that
// invitee's identity — the shared vote-page link alone does not prove who
// the visitor is.
function generateVoterTokens(inviteeNames: string[]): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const name of inviteeNames) {
    const key = name.toLowerCase().trim();
    if (!key || tokens[key]) continue;
    tokens[key] = crypto.randomBytes(24).toString("hex");
  }
  return tokens;
}

// Ensures every invitee on a plan has a token, minting and persisting any
// that are missing. This backfills legacy plans created before per-invitee
// tokens existed (or plans whose invitee list changed some other way) so
// real invitees are never locked out of voting as themselves.
async function ensureVoterTokens(plan: {
  id: string;
  inviteeNames: string[] | null;
  voterTokens: unknown;
}): Promise<Record<string, string>> {
  const inviteeNames = plan.inviteeNames || [];
  const existing = (plan.voterTokens as Record<string, string>) || {};
  const merged: Record<string, string> = { ...existing };
  let changed = false;
  for (const name of inviteeNames) {
    const key = name.toLowerCase().trim();
    if (!key) continue;
    if (!merged[key]) {
      merged[key] = crypto.randomBytes(24).toString("hex");
      changed = true;
    }
  }
  if (changed) {
    await storage.updateHangoutPlan(plan.id, { voterTokens: merged });
  }
  return merged;
}

// Compute Borda count scores for options grouped by questionType.
// Rank 1 = highest score. Rank 0/null = rejected (score 0).
// Score per vote = (maxRank + 1 - rank), where maxRank is the number of options
// within that option's questionType group (ballots are validated server-side to
// respect that bound — see validateBallot below).
function computeBordaScores(options: any[], votes: any[]) {
  const groupSizeByType = new Map<string, number>();
  for (const opt of options) {
    groupSizeByType.set(opt.questionType, (groupSizeByType.get(opt.questionType) ?? 0) + 1);
  }
  return options.map((opt) => {
    const optVotes = votes.filter((v) => v.optionId === opt.id);
    const maxRank = groupSizeByType.get(opt.questionType) ?? 1;
    const bordaScore = optVotes.reduce((sum: number, v: any) => {
      const r = v.rank;
      if (!r || r <= 0 || r > maxRank) return sum;
      return sum + (maxRank + 1 - r);
    }, 0);
    const voteCount = optVotes.filter((v: any) => v.rank && v.rank > 0 && v.rank <= maxRank).length;
    return { ...opt, bordaScore, voteCount, votes: optVotes };
  });
}

// Validates that a submitted ballot respects the invariants the drag-and-drop
// voting UI assumes: exactly one vote per option in the survey, unique ranks
// within each questionType group, and a contiguous 1..N ranking (N = number of
// options in that group). Rejected options (rank null/0) are exempt from the
// contiguity requirement. Returns an error message, or null if the ballot is valid.
function validateBallot(votes: { optionId: string; rank: number | null }[], planOptions: any[]): string | null {
  const optionById = new Map(planOptions.map((o) => [o.id, o]));

  // One vote per option in the entire survey — no duplicate/missing option entries.
  const seenOptionIds = new Set<string>();
  for (const v of votes) {
    if (seenOptionIds.has(v.optionId)) {
      return "Duplicate vote submitted for the same option";
    }
    seenOptionIds.add(v.optionId);
  }
  if (seenOptionIds.size !== planOptions.length) {
    return "Ballot must include exactly one vote for every survey option";
  }

  const rankedByType = new Map<string, number[]>();
  for (const v of votes) {
    const opt = optionById.get(v.optionId);
    if (!opt) continue;
    const r = v.rank;
    if (r === null || r === undefined || r <= 0) continue;
    const arr = rankedByType.get(opt.questionType) ?? [];
    arr.push(r);
    rankedByType.set(opt.questionType, arr);
  }

  const groupSizeByType = new Map<string, number>();
  for (const opt of planOptions) {
    groupSizeByType.set(opt.questionType, (groupSizeByType.get(opt.questionType) ?? 0) + 1);
  }

  for (const [type, ranks] of rankedByType.entries()) {
    const groupSize = groupSizeByType.get(type) ?? 0;
    const unique = new Set(ranks);
    if (unique.size !== ranks.length) {
      return "Ranks must be unique within each option group";
    }
    if (ranks.some((r) => r > groupSize)) {
      return "Rank cannot exceed the number of options in its group";
    }
    // Ranked options must form a contiguous sequence starting at 1 (1..k).
    const sorted = [...ranks].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        return "Ranks must be contiguous starting from 1";
      }
    }
  }

  return null;
}

function computeBestRecommendation(optionsWithScores: any[], votes: any[], includePlusOne: boolean) {
  const byType = (type: string) =>
    optionsWithScores.filter((o) => o.questionType === type);

  const best = (arr: any[]) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => b.bordaScore - a.bordaScore);
    return sorted[0].bordaScore > 0 ? { label: sorted[0].label, score: sorted[0].bordaScore } : null;
  };

  const totalVoters = new Set(votes.map((v: any) => v.voterName)).size;
  // Sum plusOneCount once per unique voter (not per vote row) to prevent a
  // single ballot from inflating the guest total by the number of options.
  let plusOneTotal: number | undefined;
  if (includePlusOne) {
    const seenVoters = new Map<string, number>();
    for (const v of votes) {
      const key = (v.voterName ?? "").toLowerCase().trim();
      if (!seenVoters.has(key) && v.plusOneCount != null) {
        seenVoters.set(key, v.plusOneCount);
      }
    }
    plusOneTotal = [...seenVoters.values()].reduce((sum, n) => sum + n, 0);
  }

  return {
    bestActivity: best(byType("activity")),
    bestTime: best(byType("time")),
    bestLocation: best(byType("location")),
    totalVoters,
    plusOneTotal,
  };
}

function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Sanitize a value for use in an ICS text property.
 * RFC 5545 requires backslash-escaping of commas, semicolons, and backslashes
 * in TEXT values. CR and LF characters are stripped outright to prevent
 * line-injection attacks (an attacker could otherwise inject arbitrary
 * calendar properties such as URL:, ALARM:, or DESCRIPTION:).
 */
function sanitizeIcsValue(value: string): string {
  // Strip CR/LF to block property-injection via line folding
  const stripped = value.replace(/[\r\n]/g, " ");
  // Escape special TEXT characters per RFC 5545 §3.3.11
  return stripped
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function generateIcs(title: string, timeLabel: string, locationLabel: string | null): string {
  const now = new Date();
  // DTSTAMP must be UTC per RFC 5545
  const dtStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `bridges-${Date.now()}@bridges.app`;

  // Try to parse a natural-language date from the time label, fallback to 1 week from now.
  // Use floating datetime (no Z suffix) so calendar apps honour the device's local timezone.
  let dtStart = "";
  let dtEnd = "";
  try {
    const parsed = chrono.parseDate(timeLabel, new Date(), { forwardDate: true });
    if (parsed && !isNaN(parsed.getTime())) {
      dtStart = formatLocalDateTime(parsed);
      const end = new Date(parsed.getTime() + 2 * 60 * 60 * 1000);
      dtEnd = formatLocalDateTime(end);
    }
  } catch (_) {}

  if (!dtStart) {
    const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    dtStart = formatLocalDateTime(future);
    const end = new Date(future.getTime() + 2 * 60 * 60 * 1000);
    dtEnd = formatLocalDateTime(end);
  }

  const safeTitle = sanitizeIcsValue(title);
  const safeLocation = locationLabel ? sanitizeIcsValue(locationLabel) : null;
  const location = safeLocation ? `LOCATION:${safeLocation}` : "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bridges App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${safeTitle}`,
    location,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" },
  skipSuccessfulRequests: false,
});

const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts, please try again later" },
});

const voteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many voting attempts, please try again later" },
});

// IP-level cap on email-invite sends across all accounts from the same origin.
// Even if an attacker creates multiple fresh accounts, this limiter bounds the
// total number of outbound email batches they can trigger per IP per day.
const emailInviteRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many email invite requests from this network. Please try again tomorrow." },
});

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", 1);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable must be set in production. " +
      "The server will not start without an operator-supplied session secret."
    );
  }

  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool: pool as any,
        createTableIfMissing: true,
      }),
      secret: sessionSecret || "bridges-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
      },
    }),
  );

  // Common disposable/throwaway email domains
  const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com","guerrillamail.com","guerrillamail.net","guerrillamail.org",
    "guerrillamail.biz","guerrillamail.de","guerrillamail.info","guerrillamailblock.com",
    "10minutemail.com","10minutemail.net","10minutemail.org","10minutemail.co.uk",
    "tempmail.com","temp-mail.org","temp-mail.io","tmpmail.net","tmpmail.org",
    "throwam.com","throwaway.email","dispostable.com","mailnull.com","spamgourmet.com",
    "spamgourmet.net","spamgourmet.org","trashmail.com","trashmail.at","trashmail.io",
    "trashmail.me","trashmail.net","trashmail.org","trashmail.xyz","trashmail.de",
    "yopmail.com","yopmail.fr","cool.fr.nf","jetable.fr.nf","nospam.ze.tc",
    "nomail.xl.cx","mega.zik.dj","speed.1s.fr","courriel.fr.nf","moncourrier.fr.nf",
    "monemail.fr.nf","monmail.fr.nf","sharklasers.com","guerrillamailblock.com",
    "grr.la","guerrillamail.info","spam4.me","fakeinbox.com","mailnesia.com",
    "mailnull.com","maildrop.cc","discard.email","spamspot.com","spamevader.com",
    "inboxbear.com","throwam.com","throwam.net","mytrashmail.com","throwam.org",
    "mailsiphon.com","owlpic.com","spamhereplease.com","spamhereplease.net",
    "getnada.com","crazymailing.com","mohmal.com","getairmail.com","filzmail.com",
    "dispostable.com","mt2015.com","mt2014.com","anonmails.de","antichef.com",
    "antichef.net","antispam.de","binkmail.com","bobmail.info","casualdx.com",
    "cubiclink.com","dacoolest.com","dandikmail.com","discard.email","disposableaddress.com",
    "disposableemailaddresses.com","dogit.com","dumpmail.de","e4ward.com",
    "emaildrop.io","emailias.com","emailsensei.com","emailtemporanea.com",
    "emailto.de","emailwarden.com","fakemailgenerator.com","fakemail.net",
    "filzmail.com","fizmail.com","forgetmail.com","fux0ringduh.com","getonemail.com",
    "girlsundertheinfluence.com","hatespam.org","highbros.org","ieatspam.eu",
    "ieatspam.info","imails.info","inoutmail.de","inoutmail.eu","inoutmail.info",
    "inoutmail.net","internet-e-mail.de","internet-mail.de","internetemails.net",
    "jnxjn.com","jourrapide.com","kasmail.com","klassmaster.com","klzlk.com",
    "kurzepost.de","letthemeatspam.com","lhsdv.com","libox.fr","mailbidon.com",
    "mailblade.net","mailblocks.com","mailbucket.org","mailcat.biz","mailcatch.com",
    "mailchop.com","mailde.net","maildrop.cc","mailexpire.com","mailfall.com",
    "mailfreeonline.com","mailguard.me","mailin8r.com","mailinater.com",
    "mailme.lv","mailme24.com","mailmetrash.com","mailmoat.com","mailnew.com",
    "mailnull.com","mailorg.org","mailpick.biz","mailquack.com","mailseal.de",
    "mailshell.com","mailsiphon.com","mailslite.com","mailsucker.net","mailtemp.info",
    "mailtome.de","mailtome.net","mailtothis.com","mailzilla.com","mailzilla.org",
    "mbx.cc","mega.zik.dj","meinspamschutz.de","memoware.com","messagebeamer.de",
    "ministry-of-silly-walks.de","mintemail.com","misterpinball.de","mm.st",
    "moncourrier.fr.nf","monemail.fr.nf","monmail.fr.nf","msa.minsmail.com",
    "mx0.wwwnew.eu","my10minutemail.com","mypartyclip.de","myphantomemail.com",
    "mysamp.de","myspaceinc.com","myspaceinc.net","myspaceinc.org","myspacepimpage.com",
    "mytempemail.com","mytrashmail.com","neomailbox.com","netmails.com","netmails.net",
    "netzidiot.de","neverbox.com","no-spam.ws","noblepioneer.com","noclickemail.com",
    "nogmailspam.info","noisemails.com","nomail.pw","nomail2me.com","nomorespam.iv.pl",
    "nonspam.eu","nonspammer.de","noref.in","nospam.ze.tc","nospam4.us",
    "nospamfor.us","nospammail.net","nospamthanks.info","notmailinator.com",
    "nowmymail.com","nurfuerspam.de","nus.edu.sg","objectmail.com","odaymail.com",
    "oi.com.br","onewaymail.com","online.ms","oopi.org","opentrash.com",
    "ordinaryamerican.net","owlpic.com","pecinan.com","pecinan.net","pecinan.org",
    "pepbot.com","perzo.com","pimpedupmyspace.com","plexolan.de","pookmail.com",
    "proxymail.eu","prtnx.com","prtz.eu","pubmail.io","punkass.com",
    "putthisinyourspamdatabase.com","qq.com","quickinbox.com","rcpt.at",
    "recode.me","recursor.net","rklips.com","rmqkr.net","rppkn.com","rtrtr.com",
    "s0ny.net","safe-mail.net","safetymail.info","safetypost.de","samsclass.info",
    "sandelf.de","schafmail.de","schrott-mail.de","secretemail.de","secure-mail.biz",
    "skeefmail.com","sl.pt","slopsbox.com","smellfear.com","snkmail.com",
    "sofortmail.de","sofort-mail.de","soGetItNow.com","spam.la","spam.mn",
    "spam.su","spamavert.com","spambob.com","spambob.net","spambob.org",
    "spambox.info","spambox.irishspringrealty.com","spambox.us","spamcon.org",
    "spamcorptastic.com","spamcowboy.com","spamcowboy.net","spamcowboy.org",
    "spamday.com","spamex.com","spamfree.eu","spamfree24.de","spamfree24.eu",
    "spamfree24.info","spamfree24.net","spamfree24.org","spamgoes.in",
    "spamgourmet.com","spamgourmet.net","spamgourmet.org","spamgrave.com",
    "spamhereplease.com","spamhole.com","spamify.com","spaminator.de",
    "spamkill.info","spaml.com","spaml.de","spammotel.com","spamoff.de",
    "spamslicer.com","spamspot.com","spamstack.net","spamthis.co.uk","spamthisplease.com",
    "spamtrail.com","super-auswahl.de","supermailer.jp","suremail.info",
    "teewars.org","tefl.ro","tempalias.com","tempe-mail.com","tempemail.biz",
    "tempemail.com","tempemail.net","tempemail.org","tempinbox.co.uk","tempinbox.com",
    "tempomail.fr","temporamail.com","temporaryemail.net","temporaryemail.us",
    "temporaryforwarding.com","temporaryinbox.com","temporarymail.org","tempsky.com",
    "tempthe.net","tempymail.com","thanksnospam.info","thisisnotmyrealemail.com",
    "thinktankmovement.com","throwam.com","throwam.net","tilien.com","tmailinator.com",
    "tokem.co","toomail.biz","tradermail.info","trash-amil.com","trash-mail.at",
    "trash-mail.cf","trash-mail.ga","trash-mail.gq","trash-mail.ml","trash-mail.tk",
    "trash2009.com","trash2010.com","trash2011.com","trashdevil.com","trashdevil.de",
    "trashemail.de","trashimail.de","trashmail.app","trashmail.at","trashmail.com",
    "trashmail.io","trashmail.me","trashmail.net","trashmail.org","trashmail.xyz",
    "trashmailer.com","trashymail.com","trbvm.com","turual.com","twinmail.de",
    "tyldd.com","uggsrock.com","uk2.net","umail.net","upliftnow.com",
    "uploadnolimit.com","uroid.com","us.af","venompen.com","veryrealemail.com",
    "viditag.com","viewcastmedia.com","viewcastmedia.net","viewcastmedia.org",
    "vomoto.com","vpn.st","vsimcard.com","vubby.com","wasteland.rfc822.org",
    "webemail.me","webm4il.info","weg-werf-email.de","wegwerf-emails.de",
    "wegwerfadresse.de","wegwerfemail.com","wegwerfemail.de","wegwerfmail.de",
    "wegwerfmail.info","wegwerfmail.net","wegwerfmail.org","wh4f.org","whyspam.me",
    "willhackforfood.biz","willselfdestruct.com","wilemail.com","winemaven.info",
    "wronghead.com","www.e4ward.com","www.mailinator.com","xagloo.com",
    "xemaps.com","xents.com","xmaily.com","xoxy.net","xyzfree.net","yapped.net",
    "yeah.net","yogamaven.com","yopmail.com","yopmail.fr","yourdomain.com",
    "ypmail.webarnak.fr.eu.org","yuurok.com","z1p.biz","za.com","zehnminuten.de",
    "zehnminutenmail.de","zoemail.net","zoemail.org","zomg.info","zxcv.com","zxcvbnm.com",
  ]);

  app.post("/api/auth/register", registerRateLimiter, async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      // Block disposable/throwaway email domains
      const emailDomain = email.toLowerCase().trim().split("@")[1] ?? "";
      if (DISPOSABLE_DOMAINS.has(emailDomain)) {
        return res.status(400).json({ message: "Please use a real email address to create an account." });
      }
      // Silent-success pattern: always return the same 201 response regardless
      // of whether this email was already registered, so the endpoint cannot be
      // used as an oracle to enumerate existing accounts.
      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!existing) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await storage.createUser({
          email: email.toLowerCase().trim(),
          password: hashedPassword,
        });
        if (name) {
          await storage.updateUser(user.id, { username: name.trim() });
        }
      } else {
        // Run a bcrypt hash to consume equivalent time and prevent timing oracle.
        await bcrypt.hash(password, 10);
      }
      res.status(201).json({ message: "Account created. Please sign in to continue." });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
        // Run a dummy bcrypt compare against a valid cost-10 hash to consume
        // equivalent time and prevent timing-based email enumeration.
        // The hash value is a pre-generated constant and does not correspond to
        // any real password (same hardening as registration and forgot-password).
        await bcrypt.compare(password, "$2b$10$12bD9BpoJMQ2L5QKoupAKeiiqS9qZeN8JBWJhTgRrW8U88QY0n/AO");
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });


  app.post("/api/auth/apple", authRateLimiter, async (req, res) => {
    try {
      const { identityToken, fullName } = req.body;
      if (!identityToken || typeof identityToken !== "string") {
        return res.status(400).json({ message: "Identity token required" });
      }

      // Verify the Apple identity token against Apple's public JWKS.
      // clockTolerance allows up to 30s of clock skew between Replit and Apple.
      let payload: { sub?: string; email?: string };
      try {
        const { payload: verified } = await jwtVerify(identityToken, APPLE_JWKS, {
          issuer: "https://appleid.apple.com",
          audience: APPLE_BUNDLE_ID,
          clockTolerance: 30,
        });
        payload = verified as { sub?: string; email?: string };
        console.log("[apple-auth] Token verified successfully");
      } catch (verifyErr: unknown) {
        const errCode = (verifyErr as { code?: string }).code ?? "unknown";
        const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error(`[apple-auth] Token verification failed (${errCode}):`, errMsg);
        const userMsg =
          errCode === "ERR_JWT_EXPIRED"
            ? "Apple sign-in token has expired. Please try again."
            : errCode === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED"
            ? "Apple sign-in signature invalid. Please try again."
            : errCode === "ERR_JWT_CLAIM_VALIDATION_FAILED"
            ? "Apple sign-in token is not valid for this app."
            : "Apple sign-in failed. Please try again.";
        return res.status(401).json({ message: userMsg });
      }

      const { sub: appleSub, email: jwtEmail } = payload;
      if (!appleSub) {
        return res.status(400).json({ message: "Invalid Apple token: missing subject" });
      }

      // Canonical synthetic email derived from the stable Apple sub.
      // This is used both for new account creation and as a safe secondary lookup
      // for accounts that were created before the explicit appleSub column existed.
      // It is immune to email recycling because it is deterministically derived
      // from the stable Apple sub, not from the mutable JWT email claim.
      const syntheticEmail = `apple_${appleSub.replace(/[^a-z0-9]/gi, "")}@bridges.apple`;

      // Primary lookup: by stable Apple sub stored in the database.
      let user = await storage.getUserByAppleSub(appleSub);

      if (!user) {
        // Secondary lookup: synthetic-email accounts created before the explicit
        // appleSub column existed. This is safe — syntheticEmail is a deterministic
        // function of appleSub, so only a holder of the same Apple sub can produce
        // the same syntheticEmail. Email recycling cannot reach these accounts.
        user = await storage.getUserByEmail(syntheticEmail);
        if (user) {
          // Promote to sub-based lookup so future logins hit the primary path.
          await storage.updateUser(user.id, { appleSub });
          const updated = await storage.getUser(user.id);
          if (updated) user = updated;
          console.log("[apple-auth] Bound appleSub to existing synthetic-email account:", user.id);
        }
      }

      // NOTE: There is intentionally NO fallback to the raw JWT email claim.
      // The JWT email is a mutable, provider-managed value that can be reassigned
      // to a different person (e.g. Google Workspace domain recycling). Treating it
      // as proof of account ownership would allow a holder of a recycled email to
      // claim a previous user's account. Accounts not found by sub or syntheticEmail
      // are treated as new users.

      if (!user) {
        // New Apple user — create account using synthetic email for stability.
        console.log("[apple-auth] Creating new account for sub:", appleSub);
        const hashedPassword = await bcrypt.hash(
          Math.random().toString(36) + Date.now(),
          10
        );
        user = await storage.createUser({ email: syntheticEmail, password: hashedPassword });
        await storage.updateUser(user.id, { hasPassword: false, appleSub });
        if (fullName?.givenName) {
          const name = [fullName.givenName, fullName.familyName]
            .filter(Boolean)
            .join(" ")
            .trim();
          if (name) await storage.updateUser(user.id, { username: name });
        }
        const updated = await storage.getUser(user.id);
        if (updated) user = updated;
        console.log("[apple-auth] Account created:", user.id);
      } else if (user.hasPassword !== false) {
        // An account with this email already exists with a password. Refuse the
        // social login to prevent account takeover.
        console.warn("[apple-auth] Email conflict — account has password set, refusing social login");
        return res.status(409).json({ message: "An account with this email already exists. Please sign in with your email and password." });
      } else {
        console.log("[apple-auth] Returning user found:", user.id);
      }

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("[apple-auth] Session save error:", err);
          return res.status(500).json({ message: "Sign in failed" });
        }
        res.json({ id: user!.id, email: user!.email, name: user!.username, profilePhotoUri: user!.profilePhotoUri, suggestionNotifFrequency: user!.suggestionNotifFrequency, suggestionNotifTime: user!.suggestionNotifTime, hasPassword: user!.hasPassword !== false });
      });
    } catch (err) {
      console.error("[apple-auth] Unexpected error:", err);
      res.status(500).json({ message: "Apple sign in failed" });
    }
  });

  app.post("/api/auth/google", authRateLimiter, async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken || typeof idToken !== "string") {
        return res.status(400).json({ message: "ID token required" });
      }

      // Verify the ID token with Google's tokeninfo endpoint.
      // This validates the token's signature and expiry server-side, and returns
      // the `aud` claim so we can confirm the token was issued for Bridges' own
      // Google OAuth client IDs — not for some other application.
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      if (!tokenInfoRes.ok) {
        return res.status(401).json({ message: "Invalid Google token" });
      }
      const data = await tokenInfoRes.json() as {
        aud?: string; sub?: string; email?: string; name?: string;
        email_verified?: string; error?: string;
      };

      if (data.error) {
        return res.status(401).json({ message: "Invalid Google token" });
      }

      // Confirm the token's audience is one of Bridges' own OAuth client IDs.
      // Tokens minted for any other Google OAuth application are rejected.
      const allowedClientIds = [
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      ].filter((id): id is string => typeof id === "string" && id.length > 0);

      if (allowedClientIds.length === 0) {
        console.error("Google auth: no Google client IDs configured — cannot verify token audience");
        return res.status(500).json({ message: "Google sign in is not configured" });
      }

      if (!data.aud || !allowedClientIds.includes(data.aud)) {
        return res.status(401).json({ message: "Invalid Google token audience" });
      }

      const { sub: googleSub, email, name } = data;
      if (!googleSub) {
        return res.status(400).json({ message: "Google token missing subject (sub)" });
      }
      if (!email) {
        return res.status(400).json({ message: "Email not available from Google" });
      }
      const emailNorm = email.toLowerCase().trim();

      // Primary (and only) lookup: by stable Google sub stored in the database.
      // Email is intentionally NOT used for account lookup. The JWT email claim is
      // a mutable, provider-managed value that can be reassigned to a different
      // person (e.g. Google Workspace domain recycling, personal Gmail address
      // takeover). Treating it as proof of account ownership would allow a holder
      // of a recycled email to claim a previous user's account. Accounts not found
      // by googleSub are treated as new users and a fresh account is created.
      let user = await storage.getUserByGoogleSub(googleSub);

      if (!user) {
        // Before creating a new account, check whether the email is already taken.
        // This handles two cases:
        //   a) Password account: another user registered this email with a password.
        //      Refuse to prevent social-login overlay on a password account.
        //   b) Legacy social account (hasPassword=false, googleSub=null): this
        //      account was created by Google login before the googleSub column
        //      existed. We cannot safely bind it by email (that is the vulnerability
        //      this patch closes), so we surface a clear error directing the user to
        //      contact support for account recovery, rather than letting the request
        //      fall through to a unique-constraint 500.
        const existingByEmail = await storage.getUserByEmail(emailNorm);
        if (existingByEmail) {
          if (existingByEmail.hasPassword !== false) {
            return res.status(409).json({ message: "An account with this email already exists. Please sign in with your email and password." });
          }
          // Legacy social account without a bound googleSub.
          console.warn("[google-auth] Legacy social account found for email but no googleSub bound — cannot safely authenticate:", existingByEmail.id);
          return res.status(409).json({ message: "Your account was created before secure identity binding was introduced. Please contact support to recover access." });
        }
        const hashedPassword = await bcrypt.hash(
          Math.random().toString(36) + Date.now(),
          10
        );
        user = await storage.createUser({ email: emailNorm, password: hashedPassword });
        await storage.updateUser(user.id, { hasPassword: false, googleSub });
        if (name) await storage.updateUser(user.id, { username: name.trim() });
        const updated = await storage.getUser(user.id);
        if (updated) user = updated;
        console.log("[google-auth] Account created:", user.id);
      } else {
        console.log("[google-auth] Returning user found:", user.id);
      }
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error (google):", err);
          return res.status(500).json({ message: "Sign in failed" });
        }
        res.json({ id: user!.id, email: user!.email, name: user!.username, profilePhotoUri: user!.profilePhotoUri, suggestionNotifFrequency: user!.suggestionNotifFrequency, suggestionNotifTime: user!.suggestionNotifTime, hasPassword: user!.hasPassword !== false });
      });
    } catch (err) {
      console.error("Google auth error:", err);
      res.status(500).json({ message: "Google sign in failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const userId = req.session.userId;
      // Clear push token on logout so the device can no longer receive this
      // user's notifications after they sign out (prevents token staying
      // attached to old accounts on shared/resold devices).
      if (userId) {
        await storage.updateUser(userId, { pushToken: null });
      }
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ message: "Logout failed" });
        }
        res.json({ success: true });
      });
    } catch (err) {
      console.error("Logout error:", err);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.delete("/api/auth/account", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await storage.deleteUser(userId);
      // Session rows are already wiped inside deleteUser; destroy the in-memory session too.
      req.session.destroy(() => {
        res.json({ success: true });
      });
    } catch (err) {
      console.error("Delete account error:", err);
      res.status(500).json({ message: "Failed to delete account. Please try again." });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
  });

  app.post("/api/auth/forgot-password", authRateLimiter, async (req, res) => {
    const UNIFORM_RESPONSE = { message: "If that email is registered, you'll receive a reset link shortly." };
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(200).json(UNIFORM_RESPONSE);
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Always perform a bcrypt hash so response timing is uniform regardless of
      // whether the address belongs to a real account, a social-only account, or
      // no account at all. The actual token creation and email delivery happen
      // asynchronously after the response has already been sent.
      const [user] = await Promise.all([
        storage.getUserByEmail(normalizedEmail),
        bcrypt.hash(normalizedEmail, 4),
      ]);

      res.status(200).json(UNIFORM_RESPONSE);

      // Fire-and-forget: do the real work after responding so the outbound email
      // API call cannot be observed as a timing difference by the requester.
      if (user && user.hasPassword !== false) {
        (async () => {
          try {
            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);
            const baseUrl = process.env.APP_BASE_URL ||
              (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN.replace(/:\d+$/, "")}` : null) ||
              "https://buildmybridges.com";
            const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
            await sendPasswordResetEmail(user.email, resetUrl);
          } catch (emailErr) {
            console.error("[forgot-password] Async token/email error:", emailErr);
          }
        })();
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      if (!res.headersSent) {
        res.status(200).json(UNIFORM_RESPONSE);
      }
    }
  });

  app.post("/api/auth/reset-password", authRateLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid or missing token" });
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const tokenRecord = await storage.getPasswordResetTokenByHash(tokenHash);

      if (!tokenRecord) {
        return res.status(400).json({ message: "This reset link is invalid or has already been used." });
      }
      if (tokenRecord.usedAt) {
        return res.status(400).json({ message: "This reset link has already been used. Please request a new one." });
      }
      if (new Date() > tokenRecord.expiresAt) {
        return res.status(400).json({ message: "This reset link has expired. Please request a new one." });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(tokenRecord.userId, { password: hashedPassword, hasPassword: true });
      await storage.markPasswordResetTokenUsed(tokenRecord.id);

      await pool.query(`DELETE FROM session WHERE sess->>'userId' = $1`, [tokenRecord.userId]);

      res.json({ message: "Password updated successfully." });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.put("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || typeof currentPassword !== "string") {
        return bad(res, "Current password is required");
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
        return bad(res, "New password must be at least 6 characters");
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.hasPassword === false) {
        return res.status(400).json({ message: "Password change is not available for social login accounts" });
      }

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });

      // Invalidate all other active sessions so that a stolen or shared session
      // cookie cannot be used after a password change (mirrors the reset flow).
      // We regenerate the current session first so the user stays logged in.
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) return reject(err);
          req.session.userId = user.id;
          req.session.save((saveErr) => {
            if (saveErr) return reject(saveErr);
            resolve();
          });
        });
      });
      // After regenerating, delete every session for this user except the new one.
      await pool.query(
        `DELETE FROM session WHERE sess->>'userId' = $1 AND sid != $2`,
        [String(user.id), req.session.id]
      );

      res.json({ message: "Password updated successfully." });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post("/api/notifications/local-log", requireAuth, async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId || typeof contactId !== "string") {
        return bad(res, "contactId is required");
      }
      await pool.query(
        `INSERT INTO notification_log (user_id, contact_id, notif_type) VALUES ($1, $2, $3)`,
        [req.session.userId!, contactId.trim(), "elevation"],
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Error logging local notification:", err);
      res.status(500).json({ message: "Failed to log notification" });
    }
  });

  // Records a client-side swipe-dismiss so the server's push-notification picker
  // respects the same cooldown window and doesn't re-surface the contact immediately.
  app.post("/api/suggestions/dismiss", requireAuth, async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId || typeof contactId !== "string") {
        return bad(res, "contactId is required");
      }
      await pool.query(
        `INSERT INTO notification_log (user_id, contact_id, notif_type) VALUES ($1, $2, 'suggestion')`,
        [req.session.userId!, contactId.trim()],
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Error logging suggestion dismiss:", err);
      res.status(500).json({ message: "Failed to log dismiss" });
    }
  });

  app.put("/api/notifications/preferences", requireAuth, async (req, res) => {
    try {
      const { frequency, time } = req.body;
      const VALID_FREQUENCIES = ["daily", "3x_week", "weekly", "off"];
      const VALID_TIMES = ["morning", "afternoon"];
      if (!frequency || typeof frequency !== "string" || !VALID_FREQUENCIES.includes(frequency)) {
        return bad(res, "frequency must be one of: daily, 3x_week, weekly, off");
      }
      const update: { suggestionNotifFrequency: string; suggestionNotifTime?: string | null } = {
        suggestionNotifFrequency: frequency,
      };
      if (frequency !== "off") {
        update.suggestionNotifTime = time && VALID_TIMES.includes(time) ? time : "morning";
      } else {
        update.suggestionNotifTime = null;
      }
      const user = await storage.updateUser(req.session.userId!, update);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
    } catch (err) {
      console.error("Error saving notification preferences:", err);
      res.status(500).json({ message: "Failed to save notification preferences" });
    }
  });

  app.put("/api/notifications/token", requireAuth, async (req, res) => {
    try {
      const { token, timezone } = req.body;
      if (!token || typeof token !== "string" || !token.trim()) {
        return bad(res, "Push token is required");
      }
      const trimmedToken = token.trim();
      // Evict this device token from any other user accounts before binding it
      // to the current session. This prevents a device token from staying
      // attached to a previous owner's account after the device is passed on
      // or reused, which would leak that user's private notifications.
      await storage.clearPushTokenFromOtherUsers(req.session.userId!, trimmedToken);
      const update: { pushToken: string; notificationTimezone?: string } = {
        pushToken: trimmedToken,
      };
      if (timezone && typeof timezone === "string") {
        const trimmedTz = timezone.trim();
        let validTimezones: string[] = [];
        try {
          validTimezones = Intl.supportedValuesOf("timeZone");
        } catch {
          // Node < 18 doesn't support supportedValuesOf; skip validation
        }
        if (validTimezones.length > 0 && !validTimezones.includes(trimmedTz)) {
          return bad(res, `Unrecognised timezone: "${trimmedTz}". Please send an IANA timezone name such as "America/New_York".`);
        }
        update.notificationTimezone = trimmedTz;
      }
      await storage.updateUser(req.session.userId!, update);
      res.json({ ok: true });
    } catch (err) {
      console.error("Error saving push token:", err);
      res.status(500).json({ message: "Failed to save push token" });
    }
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { profilePhotoUri, name } = req.body;
      if (profilePhotoUri !== undefined && typeof profilePhotoUri === "string" && profilePhotoUri.length > MAX_PHOTO_CHARS) {
        return bad(res, "Photo data exceeds maximum allowed size");
      }
      const updateData: any = {};
      if (profilePhotoUri !== undefined) updateData.profilePhotoUri = profilePhotoUri;
      if (name !== undefined) updateData.username = name;
      const user = await storage.updateUser(req.session.userId!, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getContactsByUserId(req.session.userId!);
      res.json(contacts);
    } catch (err) {
      console.error("Error fetching contacts:", err);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.put("/api/contacts/reorder", requireAuth, async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return bad(res, "contactIds must be a non-empty array");
      }
      if (!contactIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
        return bad(res, "All contactIds must be non-empty strings");
      }
      const userContacts = await storage.getContactsByUserId(req.session.userId!);
      const userContactIds = new Set(userContacts.map((c) => c.id));
      const invalid = contactIds.filter((id) => !userContactIds.has(id));
      if (invalid.length > 0) {
        return res.status(403).json({ message: "One or more contacts do not belong to this user" });
      }
      await storage.reorderContacts(req.session.userId!, contactIds);
      res.status(204).end();
    } catch (err) {
      console.error("Error reordering contacts:", err);
      res.status(500).json({ message: "Failed to reorder contacts" });
    }
  });

  app.get("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const contact = await storage.getContact(id);
      if (!contact || contact.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (err) {
      console.error("Error fetching contact:", err);
      res.status(500).json({ message: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", requireAuth, async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const { name, circleLevel } = body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return bad(res, "Name is required");
      }
      const level = Number(circleLevel);
      if (!VALID_CIRCLE_LEVELS.includes(level as 1 | 2 | 3)) {
        return bad(res, "circleLevel must be 1, 2, or 3");
      }
      const safe = pickContactFields(body);
      const avatarColor =
        typeof body.avatarColor === "string" && body.avatarColor
          ? body.avatarColor
          : "#9B7DFF";
      const contact = await storage.createContact({
        ...safe,
        name: name.trim(),
        circleLevel: level,
        userId: req.session.userId!,
        avatarColor,
        lastContacted: (() => {
          if (safe.lastContacted) return safe.lastContacted;
          const now = new Date();
          const daysBack =
            level === 1 ? Math.floor(Math.random() * 15) :
            level === 2 ? Math.floor(Math.random() * 31) :
            30 + Math.floor(Math.random() * 31);
          now.setDate(now.getDate() - daysBack);
          return now.toISOString();
        })(),
        lastHangout: (() => {
          if (safe.lastHangout) return safe.lastHangout;
          const now = new Date();
          const daysBack =
            level === 1 ? Math.floor(Math.random() * 19) :
            level === 2 ? Math.floor(Math.random() * 51) :
            Math.floor(Math.random() * 81);
          now.setDate(now.getDate() - daysBack);
          return now.toISOString();
        })(),
      });
      res.status(201).json(contact);
    } catch (err) {
      console.error("Error creating contact:", err);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.put("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const body = req.body as Record<string, unknown>;
      if (!body.name || typeof body.name !== "string" || !(body.name as string).trim()) {
        return bad(res, "Name is required");
      }
      if (body.photoUri !== undefined && typeof body.photoUri === "string" && body.photoUri.length > MAX_PHOTO_CHARS) {
        return bad(res, "Photo data exceeds maximum allowed size");
      }
      const normalizedLevel = Number(body.circleLevel);
      if (!VALID_CIRCLE_LEVELS.includes(normalizedLevel as 1 | 2 | 3)) {
        return bad(res, "circleLevel must be 1, 2, or 3");
      }
      const safe = pickContactFields(body);
      safe.name = (body.name as string).trim();
      safe.circleLevel = normalizedLevel;
      const contact = await storage.updateContact(id, safe);
      res.json(contact);
    } catch (err) {
      console.error("Error updating contact:", err);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.put("/api/contacts/:id/phone", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const body = req.body as Record<string, unknown>;
      const phone = body.phone;
      if (!phone || typeof phone !== "string" || !phone.trim()) {
        return bad(res, "Phone number is required");
      }
      const updates: Record<string, unknown> = { phone: phone.trim() };
      const incomingBirthday = typeof body.birthday === "string" ? body.birthday.trim() || null : null;
      if (incomingBirthday && !existing.birthday) {
        updates.birthday = incomingBirthday;
      }
      if (typeof body.photoUri === "string" && body.photoUri && !existing.photoUri) {
        if (body.photoUri.length <= MAX_PHOTO_CHARS) {
          updates.photoUri = body.photoUri;
        }
      }
      const contact = await storage.updateContact(id, updates as Partial<InsertContact>);
      res.json(contact);
    } catch (err) {
      console.error("Error saving phone number:", err);
      res.status(500).json({ message: "Failed to save phone number" });
    }
  });

  app.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      await storage.deleteContact(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting contact:", err);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  app.post("/api/contacts/:id/mark-contacted", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      let lastContacted = new Date().toISOString();
      const { contactedAt, label } = req.body ?? {};
      if (contactedAt && typeof contactedAt === "string") {
        const parsed = new Date(contactedAt);
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
          lastContacted = parsed.toISOString();
        }
      }
      const updates: Record<string, string | null> = { lastContacted };
      if (typeof label === "string" && label.length > 0) {
        updates.lastContactedLabel = label;
      } else {
        updates.lastContactedLabel = null;
      }
      const contact = await storage.updateContact(id, updates);
      res.json(contact);
    } catch (err) {
      console.error("Error marking contact:", err);
      res.status(500).json({ message: "Failed to mark contact" });
    }
  });

  app.post("/api/contacts/:id/mark-hangout", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      let lastHangout = new Date().toISOString();
      const { hangoutAt, label } = req.body ?? {};
      if (hangoutAt && typeof hangoutAt === "string") {
        const parsed = new Date(hangoutAt);
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
          lastHangout = parsed.toISOString();
        }
      }
      const updates: Record<string, string | null> = { lastHangout };
      if (typeof label === "string" && label.length > 0) {
        updates.lastHangoutLabel = label;
      } else {
        updates.lastHangoutLabel = null;
      }
      const contact = await storage.updateContact(id, updates);
      res.json(contact);
    } catch (err) {
      console.error("Error marking hangout:", err);
      res.status(500).json({ message: "Failed to mark hangout" });
    }
  });

  // ---- Hangout Plans ----

  app.get("/api/hangouts", requireAuth, async (req, res) => {
    try {
      const plans = await storage.getHangoutPlansByUserId(req.session.userId!);
      const plansWithOptions = await Promise.all(
        plans.map(async (plan) => {
          const options = await storage.getOptionsByPlanId(plan.id);
          const votes = await storage.getVotesByPlanId(plan.id);
          const scored = computeBordaScores(options, votes);
          return {
            ...plan,
            options: scored,
            bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne),
          };
        }),
      );
      res.json(plansWithOptions);
    } catch (err) {
      console.error("Error fetching hangouts:", err);
      res.status(500).json({ message: "Failed to fetch hangouts" });
    }
  });

  app.get("/api/hangouts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const plan = await storage.getHangoutPlan(id);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const votes = await storage.getVotesByPlanId(plan.id);
      const scored = computeBordaScores(options, votes);
      // Personalized per-invitee voting links — only the organizer (authenticated
      // owner of this plan) can see these. Sharing the personalized link (rather
      // than name-guessing on the generic link) is how a specific invitee's
      // identity is proven when they vote.
      const voterTokens = await ensureVoterTokens(plan);
      const voterLinks = (plan.inviteeNames || []).map((name) => {
        const key = name.toLowerCase().trim();
        return { name, token: voterTokens[key] };
      });
      res.json({
        ...plan,
        options: scored,
        bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne),
        voterLinks,
      });
    } catch (err) {
      console.error("Error fetching hangout:", err);
      res.status(500).json({ message: "Failed to fetch hangout" });
    }
  });

  app.post("/api/hangouts", requireAuth, async (req, res) => {
    try {
      const { title, description, inviteeNames, options, surveyMode, fixedActivity, deadline, includePlusOne } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) {
        return bad(res, "Title is required");
      }
      if (!Array.isArray(inviteeNames) || inviteeNames.length === 0) {
        return bad(res, "At least one invitee is required");
      }
      if (!Array.isArray(options) || !options.some((o) => o.questionType === "time")) {
        return bad(res, "At least one time option is required");
      }
      if (surveyMode === "standard" && !options.some((o) => o.questionType === "activity")) {
        return bad(res, "At least one activity option is required for multiple-options mode");
      }
      if (surveyMode === "fixed-activity" && (!fixedActivity || !fixedActivity.trim())) {
        return bad(res, "A fixed activity name is required");
      }

      let shareCode = generateShareCode();
      let existing = await storage.getHangoutPlanByShareCode(shareCode);
      while (existing) {
        shareCode = generateShareCode();
        existing = await storage.getHangoutPlanByShareCode(shareCode);
      }

      const plan = await storage.createHangoutPlan({
        userId: req.session.userId!,
        title,
        description: description || null,
        status: "active",
        shareCode,
        inviteeNames: inviteeNames || [],
        voterTokens: generateVoterTokens(inviteeNames || []),
        surveyMode: surveyMode || "standard",
        fixedActivity: fixedActivity || null,
        deadline: deadline || null,
        includePlusOne: includePlusOne || false,
      });

      const createdOptions = [];
      if (options && Array.isArray(options)) {
        for (const opt of options) {
          const option = await storage.createHangoutOption({
            planId: plan.id,
            label: opt.label,
            dateTime: opt.dateTime || null,
            activity: opt.activity || null,
            location: opt.location || null,
            questionType: opt.questionType || "option",
          });
          createdOptions.push({ ...option, bordaScore: 0, voteCount: 0, votes: [] });
        }
      }

      res.status(201).json({ ...plan, options: createdOptions });
    } catch (err) {
      console.error("Error creating hangout:", err);
      res.status(500).json({ message: "Failed to create hangout" });
    }
  });

  app.put("/api/hangouts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = await storage.getHangoutPlan(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const { title, description, status, finalizedOptionId, finalizedTimeOptionId, inviteeNames } = req.body;
      if (title !== undefined && (typeof title !== "string" || !title.trim())) {
        return bad(res, "Title must be a non-empty string");
      }
      if (status !== undefined && !VALID_HANGOUT_STATUSES.includes(status)) {
        return bad(res, `Status must be one of: ${VALID_HANGOUT_STATUSES.join(", ")}`);
      }
      if (inviteeNames !== undefined && !Array.isArray(inviteeNames)) {
        return bad(res, "inviteeNames must be an array");
      }
      const updateData: any = {};
      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;
      if (finalizedOptionId !== undefined) updateData.finalizedOptionId = finalizedOptionId;
      if (finalizedTimeOptionId !== undefined) updateData.finalizedTimeOptionId = finalizedTimeOptionId;
      if (inviteeNames !== undefined) {
        updateData.inviteeNames = inviteeNames;
        // Preserve existing tokens for unchanged invitees and mint new tokens
        // for newly added ones, so previously shared personalized links keep
        // working after an edit.
        const existingTokens = (existing.voterTokens as Record<string, string>) || {};
        const merged: Record<string, string> = {};
        for (const name of inviteeNames as string[]) {
          const key = name.toLowerCase().trim();
          if (!key) continue;
          merged[key] = existingTokens[key] || crypto.randomBytes(24).toString("hex");
        }
        updateData.voterTokens = merged;
      }

      // Server-side guard: status=finalized requires required picks to be present
      if (updateData.status === "finalized") {
        const existingOptions = await storage.getOptionsByPlanId(id);
        const hasActivityOptions = existingOptions.some((o) => o.questionType === "activity");
        const effectiveActivityId = updateData.finalizedOptionId ?? existing.finalizedOptionId;
        const effectiveTimeId = updateData.finalizedTimeOptionId ?? existing.finalizedTimeOptionId;
        if (!effectiveTimeId) {
          return bad(res, "Cannot finalize: a time slot must be locked in first");
        }
        if (hasActivityOptions && !effectiveActivityId) {
          return bad(res, "Cannot finalize: an activity must be locked in first");
        }
      }

      const plan = await storage.updateHangoutPlan(id, updateData);
      const options = await storage.getOptionsByPlanId(plan!.id);
      const votes = await storage.getVotesByPlanId(plan!.id);
      const scored = computeBordaScores(options, votes);
      res.json({
        ...plan,
        options: scored,
        bestRecommendation: computeBestRecommendation(scored, votes, plan!.includePlusOne),
      });

      // Fire-and-forget: notify voters when the organizer finalizes the plan
      if (updateData.status === "finalized" && existing.status !== "finalized") {
        sendHangoutFinalizedNotifications(id, req.session.userId!).catch((err) =>
          console.error("[push] Hangout finalized notification error:", err),
        );
      }
    } catch (err) {
      console.error("Error updating hangout:", err);
      res.status(500).json({ message: "Failed to update hangout" });
    }
  });

  app.delete("/api/hangouts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const existing = await storage.getHangoutPlan(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      await storage.deleteHangoutPlan(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting hangout:", err);
      res.status(500).json({ message: "Failed to delete hangout" });
    }
  });

  app.post("/api/hangouts/:id/options", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const plan = await storage.getHangoutPlan(id);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const { label, dateTime, activity, location, questionType } = req.body;
      if (!label) {
        return res.status(400).json({ message: "Label is required" });
      }
      const option = await storage.createHangoutOption({
        planId: plan.id,
        label,
        dateTime: dateTime || null,
        activity: activity || null,
        location: location || null,
        questionType: questionType || "option",
      });
      res.status(201).json({ ...option, bordaScore: 0, voteCount: 0, votes: [] });
    } catch (err) {
      console.error("Error adding option:", err);
      res.status(500).json({ message: "Failed to add option" });
    }
  });

  // Calendar invite download - no auth required (uses plan id)
  app.get("/api/hangouts/:id/calendar", async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const plan = await storage.getHangoutPlan(id);
      if (!plan || plan.status !== "finalized") {
        return res.status(404).json({ message: "No finalized hangout found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const calVotes = await storage.getVotesByPlanId(plan.id);
      // Use finalizedTimeOptionId for time (new two-pick flow), fallback to best-scored time option
      // bordaScore helper: higher score = more preferred (rank 1 = n pts, rank n = 1 pt, rank 0/rejected = 0)
      const calBorda = (optId: string, total: number) => {
        const votes = calVotes.filter((v) => v.optionId === optId && v.rank && v.rank > 0);
        return votes.reduce((s, v) => s + Math.max(0, total - (v.rank || 0) + 1), 0);
      };
      const timeOptions = options.filter((o) => o.questionType === "time");
      const timeOption = options.find((o) => o.id === plan.finalizedTimeOptionId)
        || [...timeOptions]
          .sort((a, b) => calBorda(b.id, timeOptions.length) - calBorda(a.id, timeOptions.length))[0];
      const locationOptionsForCal = options.filter((o) => o.questionType === "location");
      const locationOption = [...locationOptionsForCal]
        .sort((a, b) => calBorda(b.id, locationOptionsForCal.length) - calBorda(a.id, locationOptionsForCal.length))[0] || null;

      const timeLabel = timeOption?.label || "TBD";
      const locationLabel = locationOption?.label || null;

      const icsContent = generateIcs(plan.title, timeLabel, locationLabel);
      const filename = plan.title.replace(/[^a-z0-9]/gi, "-").toLowerCase() + ".ics";

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(icsContent);
    } catch (err) {
      console.error("Error generating calendar:", err);
      res.status(500).json({ message: "Failed to generate calendar invite" });
    }
  });

  // Send calendar invite emails to invitees who have emails on file
  app.post("/api/hangouts/:id/email-invites", requireAuth, emailInviteRateLimiter, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;

      // Account age gate: block email delivery from accounts that were created
      // less than MIN_ACCOUNT_AGE_FOR_INVITES_MS ago.
      // Fail closed: if the user record cannot be found (e.g. session with a
      // deleted account), deny the request rather than allowing it through.
      // Existing accounts backfilled with a historical created_at always pass.
      const senderUser = await storage.getUser(userId);
      if (!senderUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (senderUser.createdAt) {
        const ageMs = Date.now() - new Date(senderUser.createdAt).getTime();
        if (ageMs < MIN_ACCOUNT_AGE_FOR_INVITES_MS) {
          const hoursRemaining = Math.ceil(
            (MIN_ACCOUNT_AGE_FOR_INVITES_MS - ageMs) / (1000 * 60 * 60),
          );
          return res.status(403).json({
            message: `Email invites are available after your account is 48 hours old. Please try again in ${hoursRemaining} hour${hoursRemaining === 1 ? "" : "s"}.`,
          });
        }
      }

      const plan = await storage.getHangoutPlan(id);
      if (!plan || plan.userId !== userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      if (plan.status !== "finalized") {
        return res.status(400).json({ message: "Hangout is not finalized yet" });
      }

      // Resolve time/location labels (same logic as calendar download)
      const options = await storage.getOptionsByPlanId(plan.id);
      const calVotes = await storage.getVotesByPlanId(plan.id);
      const calBorda = (optId: string, total: number) => {
        const votes = calVotes.filter((v) => v.optionId === optId && v.rank && v.rank > 0);
        return votes.reduce((s, v) => s + Math.max(0, total - (v.rank || 0) + 1), 0);
      };
      const timeOptions = options.filter((o) => o.questionType === "time");
      const timeOption = options.find((o) => o.id === plan.finalizedTimeOptionId)
        || [...timeOptions].sort((a, b) => calBorda(b.id, timeOptions.length) - calBorda(a.id, timeOptions.length))[0];
      const locationOptionsForEmail = options.filter((o) => o.questionType === "location");
      const locationOption = [...locationOptionsForEmail]
        .sort((a, b) => calBorda(b.id, locationOptionsForEmail.length) - calBorda(a.id, locationOptionsForEmail.length))[0] || null;

      const timeLabel = timeOption?.label || "TBD";
      const locationLabel = locationOption?.label || null;
      const icsContent = generateIcs(plan.title, timeLabel, locationLabel);

      // ── Serialized quota enforcement via advisory lock + transaction ────────
      // pg_advisory_xact_lock(namespace, hashtext(userId)) acquires a
      // transaction-level exclusive lock keyed per user. All concurrent
      // invite-send requests from the same user (across any hangout) will
      // queue here, fully serializing the check+stamp sequence and preventing
      // race-condition bypass of the per-user daily cap.
      const client = await pool.connect();
      let sent: string[] = [];
      let missing: string[] = [];
      let cappedInviteeNames: string[] = [];
      try {
        await client.query("BEGIN");

        // Lock: namespace 0x4272 ("Br" for Bridges) + hashtext of userId.
        // hashtext() returns int4, matching the two-int overload signature.
        await client.query(
          "SELECT pg_advisory_xact_lock(17266, hashtext($1))",
          [userId],
        );

        // Per-user daily batch cap — safe to read here because no other
        // request for this user can be past the lock concurrently.
        const batchCountRow = await client.query<{ count: string }>(
          `SELECT COUNT(*) AS count
           FROM hangout_plans
           WHERE user_id = $1
             AND invites_sent_at > NOW() - INTERVAL '${EMAIL_INVITE_COOLDOWN_HOURS} hours'`,
          [userId],
        );
        const batchesToday = parseInt(batchCountRow.rows[0]?.count ?? "0", 10);
        if (batchesToday >= MAX_EMAIL_INVITE_BATCHES_PER_USER_PER_DAY) {
          await client.query("ROLLBACK");
          return res.status(429).json({
            message: "You have reached the daily limit for sending hangout invites. Please try again tomorrow.",
          });
        }

        // Per-hangout cooldown: atomically stamp invites_sent_at only if the
        // row is eligible (NULL or expired). Under the advisory lock this is
        // also safe from concurrent same-hangout requests.
        const stampResult = await client.query<{ id: string }>(
          `UPDATE hangout_plans
           SET invites_sent_at = NOW()
           WHERE id = $1
             AND user_id = $2
             AND (invites_sent_at IS NULL
                  OR invites_sent_at < NOW() - INTERVAL '${EMAIL_INVITE_COOLDOWN_HOURS} hours')
           RETURNING id`,
          [id, userId],
        );

        if (stampResult.rowCount === 0) {
          await client.query("ROLLBACK");
          // Read the current value to provide a useful Retry-After.
          const sentAtRow = await client.query<{ invites_sent_at: Date | null }>(
            "SELECT invites_sent_at FROM hangout_plans WHERE id = $1",
            [id],
          );
          const sentAt = sentAtRow.rows[0]?.invites_sent_at;
          const cooldownMs = EMAIL_INVITE_COOLDOWN_HOURS * 60 * 60 * 1000;
          const retryAfterSec = sentAt
            ? Math.ceil(Math.max(0, cooldownMs - (Date.now() - sentAt.getTime())) / 1000)
            : cooldownMs / 1000;
          res.setHeader("Retry-After", String(retryAfterSec));
          return res.status(429).json({
            message: "Invites for this hangout were already sent. Please wait 24 hours before resending.",
            retryAfterSeconds: retryAfterSec,
          });
        }

        await client.query("COMMIT");
      } catch (lockErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw lockErr;
      } finally {
        client.release();
      }

      // ── Cap invitee list ───────────────────────────────────────────────────
      cappedInviteeNames = plan.inviteeNames.slice(0, MAX_EMAIL_INVITES_PER_HANGOUT);

      // Look up invitees in the user's contacts (case-insensitive name match)
      const contacts = await storage.getContactsByUserId(userId);
      const contactsByName = new Map(contacts.map((c) => [c.name.toLowerCase().trim(), c]));

      // Deduplicate recipients by email address so the same inbox cannot
      // receive multiple copies within one batch (e.g. contact name aliases).
      const seenEmails = new Set<string>();

      for (const inviteeName of cappedInviteeNames) {
        const contact = contactsByName.get(inviteeName.toLowerCase().trim());
        // Validate email format and deduplicate before attempting delivery
        const email = contact?.email?.toLowerCase().trim() ?? "";
        if (contact && EMAIL_RE.test(email) && !seenEmails.has(email)) {
          seenEmails.add(email);
          try {
            await sendHangoutCalendarInvite(
              contact.email!,
              contact.name,
              plan.title,
              timeLabel,
              locationLabel,
              icsContent,
            );
            sent.push(inviteeName);
          } catch (err) {
            console.error(`Failed to send invite to ${inviteeName}:`, err);
            missing.push(inviteeName);
          }
        } else {
          missing.push(inviteeName);
        }
      }

      res.json({ sent, missing });
    } catch (err) {
      console.error("Error sending email invites:", err);
      res.status(500).json({ message: "Failed to send email invites" });
    }
  });

  // Public voting endpoint - no auth required
  app.get("/api/vote/:shareCode", async (req, res) => {
    try {
      const plan = await storage.getHangoutPlanByShareCode(req.params.shareCode);
      if (!plan) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const creator = await storage.getUser(plan.userId!);

      // Tally data (scores, vote counts, attendance) is only safe to reveal
      // once voting is closed — either the plan is finalized or the deadline
      // has passed. While voting is open, returning these fields server-side
      // would let anyone with the share code poll live results without voting.
      const isFinalized = plan.status === "finalized";
      const isDeadlinePassed =
        !!plan.deadline && new Date(plan.deadline) < new Date();
      const tallyVisible = isFinalized || isDeadlinePassed;

      let publicOptions: object[];
      let bestRecommendation: object | null = null;

      if (tallyVisible) {
        const votes = await storage.getVotesByPlanId(plan.id);
        const scored = computeBordaScores(options, votes);
        publicOptions = scored.map((opt) => ({
          id: opt.id,
          label: opt.label,
          questionType: opt.questionType,
          dateTime: opt.dateTime,
          bordaScore: opt.bordaScore,
          voteCount: opt.voteCount,
        }));
        bestRecommendation = computeBestRecommendation(
          scored,
          votes,
          plan.includePlusOne
        );
      } else {
        // Voting is still open — return only the ballot structure, no tallies.
        publicOptions = options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          questionType: opt.questionType,
          dateTime: opt.dateTime,
        }));
      }

      // If a personalized voting token is present in the query string, resolve
      // it to the invitee's name so the client can prefill/lock the voter
      // identity. Never expose the token map itself or other invitees' names.
      const voterTokens = await ensureVoterTokens(plan);
      const rawToken = req.query.token;
      let resolvedVoterName: string | null = null;
      if (typeof rawToken === "string" && rawToken) {
        const match = Object.entries(voterTokens).find(([, t]) => t === rawToken);
        if (match) {
          const key = match[0];
          resolvedVoterName = (plan.inviteeNames || []).find(
            (n) => n.toLowerCase().trim() === key
          ) || null;
        }
      }

      res.json({
        title: plan.title,
        description: plan.description,
        status: plan.status,
        creatorName: creator?.username || "Someone",
        finalizedOptionId: plan.finalizedOptionId,
        surveyMode: plan.surveyMode,
        fixedActivity: plan.fixedActivity,
        deadline: plan.deadline,
        includePlusOne: plan.includePlusOne,
        options: publicOptions,
        bestRecommendation,
        resolvedVoterName,
        requiresToken: (plan.inviteeNames || []).length > 0,
      });
    } catch (err) {
      console.error("Error fetching vote page:", err);
      res.status(500).json({ message: "Failed to fetch hangout" });
    }
  });

  app.post("/api/vote/:shareCode", voteRateLimiter, async (req, res) => {
    try {
      const plan = await storage.getHangoutPlanByShareCode(req.params.shareCode);
      if (!plan) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      if (plan.status === "finalized") {
        return res.status(400).json({ message: "This hangout has already been finalized" });
      }

      const { votes } = req.body;
      const rawVoterName: unknown = req.body.voterName;
      // Validate optional guest-count fields to prevent spoofing via inflated values.
      // bringsGuests must be a boolean; plusOneCount must be a whole number 1–10.
      const rawBringsGuests: unknown = req.body.bringsGuests;
      const rawPlusOneCount: unknown = req.body.plusOneCount;
      let bringsGuests: boolean | null = null;
      let plusOneCount: number | null = null;
      if (rawBringsGuests !== undefined && rawBringsGuests !== null) {
        if (typeof rawBringsGuests !== "boolean") {
          return bad(res, "bringsGuests must be a boolean");
        }
        bringsGuests = rawBringsGuests;
      }
      if (rawPlusOneCount !== undefined && rawPlusOneCount !== null) {
        if (
          typeof rawPlusOneCount !== "number" ||
          !Number.isInteger(rawPlusOneCount) ||
          rawPlusOneCount < 1 ||
          rawPlusOneCount > 10
        ) {
          return bad(res, "plusOneCount must be an integer between 1 and 10");
        }
        plusOneCount = rawPlusOneCount;
      }
      if (!rawVoterName || typeof rawVoterName !== "string" || !rawVoterName.trim()) {
        return bad(res, "Voter name is required");
      }
      const voterName = rawVoterName.trim();
      const rawVoterToken: unknown = req.body.voterToken;
      if (!votes || !Array.isArray(votes) || votes.length === 0) {
        return bad(res, "Votes must be a non-empty array");
      }
      for (const v of votes) {
        if (typeof v !== "object" || v === null) {
          return bad(res, "Each vote must be an object");
        }
        if (!v.optionId || typeof v.optionId !== "string") {
          return bad(res, "Each vote must include a valid optionId");
        }
        if (v.rank !== null && v.rank !== undefined && (typeof v.rank !== "number" || !Number.isInteger(v.rank) || v.rank < 0)) {
          return bad(res, "Vote rank must be a non-negative integer or null");
        }
      }

      // Check deadline
      if (plan.deadline) {
        const deadlineDate = new Date(plan.deadline);
        if (!isNaN(deadlineDate.getTime()) && new Date() > deadlineDate) {
          return res.status(400).json({ message: "Voting has closed for this survey" });
        }
      }

      // ── Voter identity resolution ───────────────────────────────────────────
      // The shareCode alone only proves the caller has the (generic) vote link;
      // it does not prove *who* the caller is. To vote under a specific
      // invitee's name, the caller must present that invitee's unguessable
      // per-invitee token (see generateVoterTokens / GET /api/hangouts/:id
      // voterLinks). This closes impersonation: a link holder without a valid
      // token cannot submit a ballot attributed to a real invitee, and cannot
      // overwrite a real invitee's existing ballot.
      const inviteeNames = plan.inviteeNames ?? [];
      const voterTokens = await ensureVoterTokens(plan);
      const requestedKey = voterName.toLowerCase().trim();
      const isKnownInviteeName = inviteeNames.some(
        (n) => n.toLowerCase().trim() === requestedKey
      );

      let canonicalVoterName: string;
      let isGuest = false;

      if (isKnownInviteeName) {
        const expectedToken = voterTokens[requestedKey];
        const providedToken = typeof rawVoterToken === "string" ? rawVoterToken : "";
        if (!expectedToken || !providedToken || providedToken !== expectedToken) {
          return res.status(403).json({
            message: "This name belongs to an invitee. Use your personalized voting link to vote as this person.",
          });
        }
        // Use the canonical casing from the invite list so a single invitee can
        // never appear as multiple "voters" via case variants (Alice/alice/ALICE).
        canonicalVoterName = inviteeNames.find(
          (n) => n.toLowerCase().trim() === requestedKey
        )!;
      } else if (inviteeNames.length === 0) {
        // No invitee list was recorded for this plan (legacy/edge case) —
        // fall back to open name entry, capped below.
        canonicalVoterName = voterName;
      } else {
        // A name that isn't a tracked invitee (e.g. a plus-one/guest sharing
        // the generic link) — allowed, but cannot collide with an invitee's
        // identity, and is capped separately from the invitee slots.
        canonicalVoterName = voterName;
        isGuest = true;
      }

      // Validate all submitted optionIds belong to this plan (before entering
      // the serialized transaction to keep the lock duration as short as possible).
      const planOptions = await storage.getOptionsByPlanId(plan.id);
      const validOptionIds = new Set(planOptions.map((o) => o.id));
      for (const v of votes) {
        if (!validOptionIds.has(v.optionId)) {
          return bad(res, "One or more submitted options do not belong to this survey");
        }
      }

      // Enforce ballot structure invariants (one vote per option, unique &
      // contiguous ranks per option group) so a direct API caller cannot submit
      // structurally invalid ballots that distort the Borda scoring.
      const ballotError = validateBallot(votes, planOptions);
      if (ballotError) {
        return bad(res, ballotError);
      }

      const GUEST_VOTER_BUFFER = 3;
      const newVotes = votes.map((v: any) => ({
        optionId: v.optionId,
        planId: plan.id,
        voterName: canonicalVoterName,
        rank: v.rank ?? null,
        bringsGuests: bringsGuests ?? null,
        plusOneCount: plusOneCount ?? null,
      }));

      // The guest-count check and the insert are performed inside a single
      // database transaction that holds a row-level lock on the hangout plan
      // row (SELECT FOR UPDATE). This serializes concurrent submissions for the
      // same plan so the cap cannot be bypassed by racing requests that all
      // read the same pre-write state and each conclude the cap has not been
      // reached yet.
      const result = await storage.replaceVotesForVoterCapped(
        plan.id,
        canonicalVoterName,
        newVotes,
        // Pass guest enforcement context so the storage layer can re-check the
        // count inside the locked transaction. Pass null for verified invitees
        // (they are not subject to the guest cap).
        isGuest || inviteeNames.length === 0
          ? { isGuest, inviteeNames, guestCap: GUEST_VOTER_BUFFER }
          : null,
      );

      if (result.capped) {
        return res.status(400).json({
          message: isGuest
            ? "This survey has reached its guest voting limit"
            : "This survey has reached its voting limit",
        });
      }

      res.status(201).json(result.votes);
    } catch (err) {
      console.error("Error casting votes:", err);
      res.status(500).json({ message: "Failed to cast votes" });
    }
  });

  app.get("/api/prompts", requireAuth, async (_req, res) => {
    try {
      const prompts = getPrompts();
      res.json(prompts);
    } catch (err) {
      console.error("Error fetching prompts:", err);
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });

  app.post("/api/prompts/sync", async (req, res) => {
    // Require a server-held secret token — general authenticated users are not
    // permitted to trigger privileged Google Sheets work on demand.
    const adminSecret = process.env.ADMIN_SYNC_SECRET;
    if (!adminSecret) {
      return res.status(403).json({ message: "Manual prompt sync is not enabled" });
    }
    const provided = req.headers["x-admin-token"];
    if (!provided || provided !== adminSecret) {
      return res.status(403).json({ message: "Forbidden" });
    }
    // Secondary throttle: at most once per hour even with a valid token.
    const now = Date.now();
    const elapsed = now - lastManualSyncAt;
    if (elapsed < MANUAL_SYNC_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((MANUAL_SYNC_COOLDOWN_MS - elapsed) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message: "Sync was triggered recently. Please wait before syncing again.",
        retryAfterSeconds: retryAfterSec,
      });
    }
    lastManualSyncAt = now;
    try {
      const result = await syncFromSheet();
      res.json(result);
    } catch (err) {
      // Reset so a transient failure doesn't lock out the operator for an hour.
      lastManualSyncAt = 0;
      console.error("Error syncing prompts:", err);
      res.status(500).json({ message: "Failed to sync prompts" });
    }
  });

  // Dev-only: manually trigger suggestion nudges or daily reminders without waiting for 9am
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/dev/test-nudges", requireAuth, async (_req, res) => {
      console.log("[push] Manual test-nudges triggered by dev endpoint");
      await sendSuggestionNudges();
      res.json({ ok: true, message: "sendSuggestionNudges() fired — check server logs" });
    });

    app.post("/api/dev/test-reminders", requireAuth, async (_req, res) => {
      console.log("[push] Manual test-reminders triggered by dev endpoint");
      await sendDailyReminders();
      res.json({ ok: true, message: "sendDailyReminders() fired — check server logs" });
    });
  }

  const httpServer = createServer(app);
  return httpServer;
}
