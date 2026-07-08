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

// Compute Borda count scores for options grouped by questionType.
// Rank 1 = highest score. Rank 0/null = rejected (score 0).
// Score per vote = (maxRank + 1 - rank). With max 5 options: rank 1 = 5pts, rank 2 = 4pts, etc.
function computeBordaScores(options: any[], votes: any[]) {
  const MAX_RANK = 5;
  return options.map((opt) => {
    const optVotes = votes.filter((v) => v.optionId === opt.id);
    const bordaScore = optVotes.reduce((sum: number, v: any) => {
      const r = v.rank;
      if (!r || r <= 0) return sum;
      return sum + (MAX_RANK + 1 - r);
    }, 0);
    const voteCount = optVotes.filter((v: any) => v.rank && v.rank > 0).length;
    return { ...opt, bordaScore, voteCount, votes: optVotes };
  });
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
  const plusOneTotal = includePlusOne
    ? votes.reduce((sum: number, v: any) => sum + (v.plusOneCount || 0), 0)
    : undefined;

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

  const location = locationLabel ? `LOCATION:${locationLabel}\r\n` : "";

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
    `SUMMARY:${title}`,
    location.trim(),
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
      // This validates the signature, issuer, audience, and expiry.
      let payload: { sub?: string; email?: string };
      try {
        const { createRemoteJWKSet, jwtVerify } = await import("jose");
        const APPLE_JWKS = createRemoteJWKSet(
          new URL("https://appleid.apple.com/auth/keys")
        );
        const BUNDLE_ID = "com.bridges.app";
        const { payload: verified } = await jwtVerify(identityToken, APPLE_JWKS, {
          issuer: "https://appleid.apple.com",
          audience: BUNDLE_ID,
        });
        payload = verified as { sub?: string; email?: string };
      } catch (verifyErr) {
        console.error("Apple token verification failed:", verifyErr);
        return res.status(401).json({ message: "Apple identity token is invalid or expired" });
      }

      const { sub: appleSub, email } = payload;
      if (!appleSub) {
        return res.status(400).json({ message: "Invalid Apple token" });
      }
      const userEmail = email
        ? email.toLowerCase().trim()
        : `apple_${appleSub.replace(/[^a-z0-9]/gi, "")}@bridges.apple`;
      let user = await storage.getUserByEmail(userEmail);
      if (!user) {
        const hashedPassword = await bcrypt.hash(
          Math.random().toString(36) + Date.now(),
          10
        );
        user = await storage.createUser({ email: userEmail, password: hashedPassword });
        await storage.updateUser(user.id, { hasPassword: false });
        if (fullName?.givenName) {
          const name = [fullName.givenName, fullName.familyName]
            .filter(Boolean)
            .join(" ")
            .trim();
          if (name) await storage.updateUser(user.id, { username: name });
        }
        const updated = await storage.getUser(user.id);
        if (updated) user = updated;
      } else if (user.hasPassword !== false) {
        // An account with this email already exists with a password. Refuse the
        // social login to prevent pre-account takeover: an attacker who registered
        // this email first should not gain access when the real owner signs in via Apple.
        return res.status(409).json({ message: "An account with this email already exists. Please sign in with your email and password." });
      }
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error (apple):", err);
          return res.status(500).json({ message: "Sign in failed" });
        }
        res.json({ id: user!.id, email: user!.email, name: user!.username, profilePhotoUri: user!.profilePhotoUri, suggestionNotifFrequency: user!.suggestionNotifFrequency, suggestionNotifTime: user!.suggestionNotifTime, hasPassword: user!.hasPassword !== false });
      });
    } catch (err) {
      console.error("Apple auth error:", err);
      res.status(500).json({ message: "Apple sign in failed" });
    }
  });

  app.post("/api/auth/google", authRateLimiter, async (req, res) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken || typeof accessToken !== "string") {
        return res.status(400).json({ message: "Access token required" });
      }
      const googleRes = await fetch(
        `https://www.googleapis.com/oauth2/v3/userinfo`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!googleRes.ok) {
        return res.status(401).json({ message: "Invalid Google token" });
      }
      const data = await googleRes.json() as { sub?: string; email?: string; name?: string };
      const { email, name } = data;
      if (!email) {
        return res.status(400).json({ message: "Email not available from Google" });
      }
      let user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
        const hashedPassword = await bcrypt.hash(
          Math.random().toString(36) + Date.now(),
          10
        );
        user = await storage.createUser({ email: email.toLowerCase().trim(), password: hashedPassword });
        await storage.updateUser(user.id, { hasPassword: false });
        if (name) await storage.updateUser(user.id, { username: name.trim() });
        const updated = await storage.getUser(user.id);
        if (updated) user = updated;
      } else if (user.hasPassword !== false) {
        // An account with this email already exists with a password. Refuse the
        // social login to prevent pre-account takeover: an attacker who registered
        // this email first should not gain access when the real owner signs in via Google.
        return res.status(409).json({ message: "An account with this email already exists. Please sign in with your email and password." });
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

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ success: true });
    });
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
      const update: { pushToken: string; notificationTimezone?: string } = {
        pushToken: token.trim(),
      };
      if (timezone && typeof timezone === "string") {
        update.notificationTimezone = timezone.trim();
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
      res.json({
        ...plan,
        options: scored,
        bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne),
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
      if (inviteeNames !== undefined) updateData.inviteeNames = inviteeNames;

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
  app.post("/api/hangouts/:id/email-invites", requireAuth, async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;
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

      // Look up invitees in the user's contacts (case-insensitive name match)
      const contacts = await storage.getContactsByUserId(userId);
      const contactsByName = new Map(contacts.map((c) => [c.name.toLowerCase().trim(), c]));

      const sent: string[] = [];
      const missing: string[] = [];

      for (const inviteeName of plan.inviteeNames) {
        const contact = contactsByName.get(inviteeName.toLowerCase().trim());
        if (contact?.email) {
          try {
            await sendHangoutCalendarInvite(
              contact.email,
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
      const votes = await storage.getVotesByPlanId(plan.id);
      const scored = computeBordaScores(options, votes);
      const creator = await storage.getUser(plan.userId!);

      // Explicit allowlist of fields safe to expose on the public voting page
      const publicOptions = scored.map((opt) => ({
        id: opt.id,
        label: opt.label,
        questionType: opt.questionType,
        dateTime: opt.dateTime,
        bordaScore: opt.bordaScore,
        voteCount: opt.voteCount,
      }));

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
        bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne),
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

      const { votes, bringsGuests, plusOneCount } = req.body;
      const rawVoterName: unknown = req.body.voterName;
      if (!rawVoterName || typeof rawVoterName !== "string" || !rawVoterName.trim()) {
        return bad(res, "Voter name is required");
      }
      const voterName = rawVoterName.trim();
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

      const existingVotes = await storage.getVotesByPlanId(plan.id);
      const totalVoters = new Set(existingVotes.map((v) => v.voterName)).size;
      const voterAlreadySubmitted = existingVotes.some(
        (v) => v.voterName.toLowerCase().trim() === voterName.toLowerCase().trim()
      );
      const voterCap = (plan.inviteeNames?.length ?? 0) + 3;
      if (!voterAlreadySubmitted && totalVoters >= voterCap) {
        return res.status(400).json({ message: "This survey has reached its voting limit" });
      }

      // Validate all submitted optionIds belong to this plan
      const planOptions = await storage.getOptionsByPlanId(plan.id);
      const validOptionIds = new Set(planOptions.map((o) => o.id));
      for (const v of votes) {
        if (!validOptionIds.has(v.optionId)) {
          return bad(res, "One or more submitted options do not belong to this survey");
        }
      }

      // Atomically replace any existing submission from this voter to prevent ballot stuffing
      const newVotes = votes.map((v: any) => ({
        optionId: v.optionId,
        planId: plan.id,
        voterName,
        rank: v.rank ?? null,
        bringsGuests: bringsGuests ?? null,
        plusOneCount: plusOneCount ?? null,
      }));
      const createdVotes = await storage.replaceVotesForVoter(plan.id, voterName, newVotes);
      res.status(201).json(createdVotes);
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

  app.post("/api/prompts/sync", requireAuth, async (_req, res) => {
    try {
      const result = await syncFromSheet();
      res.json(result);
    } catch (err) {
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
