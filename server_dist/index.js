var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  contacts: () => contacts,
  hangoutOptions: () => hangoutOptions,
  hangoutPlans: () => hangoutPlans,
  hangoutVotes: () => hangoutVotes,
  insertContactSchema: () => insertContactSchema,
  insertHangoutOptionSchema: () => insertHangoutOptionSchema,
  insertHangoutPlanSchema: () => insertHangoutPlanSchema,
  insertHangoutVoteSchema: () => insertHangoutVoteSchema,
  insertUserSchema: () => insertUserSchema,
  notificationLog: () => notificationLog,
  passwordResetTokens: () => passwordResetTokens,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users, contacts, hangoutPlans, hangoutOptions, hangoutVotes, notificationLog, passwordResetTokens, insertUserSchema, insertContactSchema, insertHangoutPlanSchema, insertHangoutOptionSchema, insertHangoutVoteSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      email: text("email").notNull().unique(),
      password: text("password").notNull(),
      profilePhotoUri: text("profile_photo_uri"),
      username: text("username"),
      pushToken: text("push_token"),
      notificationTimezone: text("notification_timezone"),
      suggestionNotifFrequency: text("suggestion_notif_frequency"),
      suggestionNotifTime: text("suggestion_notif_time"),
      hasPassword: boolean("has_password").notNull().default(true),
      lastProfilePushAt: timestamp("last_profile_push_at"),
      googleSub: text("google_sub").unique(),
      appleSub: text("apple_sub").unique(),
      createdAt: timestamp("created_at").defaultNow()
    });
    contacts = pgTable("contacts", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").references(() => users.id),
      name: text("name").notNull(),
      circleLevel: integer("circle_level").notNull(),
      interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
      birthday: text("birthday"),
      lastContacted: text("last_contacted"),
      emptyLastContactPromptDueAt: timestamp("empty_last_contact_prompt_due_at"),
      lastHangout: text("last_hangout"),
      labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
      notes: text("notes"),
      phone: text("phone"),
      email: text("email"),
      avatarColor: text("avatar_color").notNull(),
      photoUri: text("photo_uri"),
      lastContactedLabel: text("last_contacted_label"),
      lastHangoutLabel: text("last_hangout_label"),
      customReminders: jsonb("custom_reminders").default([]),
      sortOrder: integer("sort_order"),
      createdAt: timestamp("created_at").defaultNow()
    });
    hangoutPlans = pgTable("hangout_plans", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").references(() => users.id),
      title: text("title").notNull(),
      description: text("description"),
      status: text("status").notNull().default("draft"),
      shareCode: text("share_code").notNull().unique(),
      finalizedOptionId: varchar("finalized_option_id"),
      finalizedTimeOptionId: varchar("finalized_time_option_id"),
      inviteeNames: text("invitee_names").array().notNull().default(sql`'{}'::text[]`),
      // Map of lowercase-trimmed invitee name -> unguessable per-invitee voting
      // token. Generated at creation time. A personalized voting link
      // (/vote/:shareCode?token=...) is the only way to cast a ballot under a
      // given invitee's name — this prevents impersonation/spoofing on the
      // public voting link, which by itself only proves possession of the
      // shareCode, not identity.
      voterTokens: jsonb("voter_tokens").notNull().default({}),
      surveyMode: text("survey_mode").notNull().default("standard"),
      fixedActivity: text("fixed_activity"),
      deadline: text("deadline"),
      includePlusOne: boolean("include_plus_one").notNull().default(false),
      createdAt: timestamp("created_at").defaultNow(),
      updatedAt: timestamp("updated_at").defaultNow()
    });
    hangoutOptions = pgTable("hangout_options", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      planId: varchar("plan_id").references(() => hangoutPlans.id),
      label: text("label").notNull(),
      dateTime: text("date_time"),
      activity: text("activity"),
      location: text("location"),
      questionType: text("question_type").notNull().default("option")
    });
    hangoutVotes = pgTable("hangout_votes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      optionId: varchar("option_id").references(() => hangoutOptions.id),
      planId: varchar("plan_id").references(() => hangoutPlans.id),
      voterName: text("voter_name").notNull(),
      rank: integer("rank"),
      bringsGuests: boolean("brings_guests"),
      plusOneCount: integer("plus_one_count"),
      createdAt: timestamp("created_at").defaultNow()
    }, (table) => ({
      planVoterOptionUnique: uniqueIndex("hangout_votes_plan_voter_option_unique").on(table.planId, table.voterName, table.optionId)
    }));
    notificationLog = pgTable("notification_log", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull(),
      contactId: varchar("contact_id").notNull(),
      sentAt: timestamp("sent_at").defaultNow().notNull()
    });
    passwordResetTokens = pgTable("password_reset_tokens", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      tokenHash: text("token_hash").notNull(),
      expiresAt: timestamp("expires_at").notNull(),
      usedAt: timestamp("used_at"),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    insertUserSchema = createInsertSchema(users).pick({
      email: true,
      password: true
    });
    insertContactSchema = createInsertSchema(contacts).omit({
      id: true,
      createdAt: true
    });
    insertHangoutPlanSchema = createInsertSchema(hangoutPlans).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertHangoutOptionSchema = createInsertSchema(hangoutOptions).omit({
      id: true
    });
    insertHangoutVoteSchema = createInsertSchema(hangoutVotes).omit({
      id: true,
      createdAt: true
    });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  pool: () => pool
});
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
var connectionString, isExternalDb, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    connectionString = process.env.SUPABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL must be set");
    }
    isExternalDb = connectionString.includes("supabase.com") || connectionString.includes("neon.tech") || connectionString.includes("sslmode=require");
    pool = new Pool({
      connectionString,
      ...isExternalDb ? { ssl: { rejectUnauthorized: false } } : {},
      // Supabase's session pool is capped at 15 clients. Autoscale may briefly
      // run several server instances during cold starts, so the pg default of
      // 10 clients per instance can exhaust the shared pool and make ordinary
      // API requests and notification jobs fail.
      max: isExternalDb ? 3 : 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 1e4
    });
    db = drizzle(pool, { schema: schema_exports });
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";

// server/storage.ts
init_db();
init_schema();
import { eq, and, asc, sql as drizzleSql } from "drizzle-orm";
var DatabaseStorage = class {
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  async getUserByGoogleSub(sub) {
    const [user] = await db.select().from(users).where(eq(users.googleSub, sub));
    return user;
  }
  async getUserByAppleSub(sub) {
    const [user] = await db.select().from(users).where(eq(users.appleSub, sub));
    return user;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async updateUser(id, data) {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }
  async clearPushTokenFromOtherUsers(currentUserId, token) {
    await db.update(users).set({ pushToken: null }).where(
      and(
        eq(users.pushToken, token),
        // Use drizzleSql to express "id != currentUserId"
        drizzleSql`${users.id} != ${currentUserId}`
      )
    );
  }
  async getContactsByUserId(userId) {
    return db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(
      asc(drizzleSql`CASE WHEN ${contacts.sortOrder} IS NULL THEN 1 ELSE 0 END`),
      asc(contacts.sortOrder),
      asc(contacts.createdAt)
    );
  }
  async getContact(id) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }
  async createContact(data) {
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact;
  }
  async updateContact(id, data) {
    const [contact] = await db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
    return contact;
  }
  async deleteContact(id) {
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return result.length > 0;
  }
  async reorderContacts(userId, contactIds) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < contactIds.length; i++) {
        await tx.update(contacts).set({ sortOrder: i }).where(and(eq(contacts.id, contactIds[i]), eq(contacts.userId, userId)));
      }
    });
  }
  async getHangoutPlansByUserId(userId) {
    return db.select().from(hangoutPlans).where(eq(hangoutPlans.userId, userId));
  }
  async getHangoutPlan(id) {
    const [plan] = await db.select().from(hangoutPlans).where(eq(hangoutPlans.id, id));
    return plan;
  }
  async getHangoutPlanByShareCode(shareCode) {
    const [plan] = await db.select().from(hangoutPlans).where(eq(hangoutPlans.shareCode, shareCode));
    return plan;
  }
  async createHangoutPlan(data) {
    const [plan] = await db.insert(hangoutPlans).values(data).returning();
    return plan;
  }
  async updateHangoutPlan(id, data) {
    const [plan] = await db.update(hangoutPlans).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(hangoutPlans.id, id)).returning();
    return plan;
  }
  async deleteHangoutPlan(id) {
    await db.delete(hangoutVotes).where(eq(hangoutVotes.planId, id));
    const options = await this.getOptionsByPlanId(id);
    for (const opt of options) {
      await db.delete(hangoutVotes).where(eq(hangoutVotes.optionId, opt.id));
    }
    await db.delete(hangoutOptions).where(eq(hangoutOptions.planId, id));
    const result = await db.delete(hangoutPlans).where(eq(hangoutPlans.id, id)).returning();
    return result.length > 0;
  }
  async getOptionsByPlanId(planId) {
    return db.select().from(hangoutOptions).where(eq(hangoutOptions.planId, planId));
  }
  async createHangoutOption(data) {
    const [option] = await db.insert(hangoutOptions).values(data).returning();
    return option;
  }
  async deleteHangoutOption(id) {
    await db.delete(hangoutVotes).where(eq(hangoutVotes.optionId, id));
    const result = await db.delete(hangoutOptions).where(eq(hangoutOptions.id, id)).returning();
    return result.length > 0;
  }
  async getVotesByPlanId(planId) {
    return db.select().from(hangoutVotes).where(eq(hangoutVotes.planId, planId));
  }
  async getVotesByOptionId(optionId) {
    return db.select().from(hangoutVotes).where(eq(hangoutVotes.optionId, optionId));
  }
  async createHangoutVote(data) {
    const [vote] = await db.insert(hangoutVotes).values(data).returning();
    return vote;
  }
  async deleteVotesByPlanId(planId) {
    const result = await db.delete(hangoutVotes).where(eq(hangoutVotes.planId, planId)).returning();
    return result.length >= 0;
  }
  async deleteVotesByPlanIdAndVoterName(planId, voterName) {
    await db.delete(hangoutVotes).where(
      and(eq(hangoutVotes.planId, planId), eq(hangoutVotes.voterName, voterName))
    );
  }
  async replaceVotesForVoter(planId, voterName, newVotes) {
    return db.transaction(async (tx) => {
      await tx.delete(hangoutVotes).where(
        and(
          eq(hangoutVotes.planId, planId),
          drizzleSql`lower(${hangoutVotes.voterName}) = lower(${voterName})`
        )
      );
      if (newVotes.length === 0) return [];
      return tx.insert(hangoutVotes).values(newVotes).returning();
    });
  }
  async replaceVotesForVoterCapped(planId, voterName, newVotes, guestOpts) {
    return db.transaction(async (tx) => {
      await tx.execute(drizzleSql`SELECT id FROM hangout_plans WHERE id = ${planId} FOR UPDATE`);
      if (guestOpts) {
        const { isGuest, inviteeNames, guestCap } = guestOpts;
        const canonicalVoterKey = voterName.toLowerCase().trim();
        const existingVotes = await tx.select().from(hangoutVotes).where(eq(hangoutVotes.planId, planId));
        const voterAlreadySubmitted = existingVotes.some(
          (v) => v.voterName.toLowerCase().trim() === canonicalVoterKey
        );
        if (isGuest) {
          if (!voterAlreadySubmitted) {
            const existingGuestKeys = new Set(
              existingVotes.map((v) => v.voterName.toLowerCase().trim()).filter((n) => !inviteeNames.some((inv) => inv.toLowerCase().trim() === n))
            );
            if (existingGuestKeys.size >= guestCap) {
              return { capped: true };
            }
          }
        } else if (inviteeNames.length === 0) {
          if (!voterAlreadySubmitted) {
            const totalVoters = new Set(existingVotes.map((v) => v.voterName.toLowerCase().trim())).size;
            if (totalVoters >= guestCap) {
              return { capped: true };
            }
          }
        }
      }
      await tx.delete(hangoutVotes).where(
        and(
          eq(hangoutVotes.planId, planId),
          drizzleSql`lower(${hangoutVotes.voterName}) = lower(${voterName})`
        )
      );
      if (newVotes.length === 0) return { capped: false, votes: [] };
      const votes = await tx.insert(hangoutVotes).values(newVotes).returning();
      return { capped: false, votes };
    });
  }
  async createPasswordResetToken(userId, tokenHash, expiresAt) {
    const [token] = await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt }).returning();
    return token;
  }
  async getPasswordResetTokenByHash(tokenHash) {
    const [token] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    return token;
  }
  async markPasswordResetTokenUsed(id) {
    await db.update(passwordResetTokens).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq(passwordResetTokens.id, id));
  }
  async deleteExpiredPasswordResetTokens() {
    await db.delete(passwordResetTokens).where(
      and(
        eq(passwordResetTokens.usedAt, null)
      )
    );
  }
  async deleteUser(id) {
    const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [id]);
      await client.query("DELETE FROM notification_log WHERE user_id = $1", [id]);
      await client.query(
        "DELETE FROM hangout_votes WHERE plan_id IN (SELECT id FROM hangout_plans WHERE user_id = $1)",
        [id]
      );
      await client.query(
        "DELETE FROM hangout_options WHERE plan_id IN (SELECT id FROM hangout_plans WHERE user_id = $1)",
        [id]
      );
      await client.query("DELETE FROM hangout_plans WHERE user_id = $1", [id]);
      await client.query("DELETE FROM contacts WHERE user_id = $1", [id]);
      await client.query("DELETE FROM session WHERE sess->>'userId' = $1", [id]);
      const result = await client.query("DELETE FROM users WHERE id = $1", [id]);
      await client.query("COMMIT");
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
init_db();
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

// server/googleSheets.ts
import { google } from "googleapis";
var connectionSettings;
async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }
  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-sheet",
    {
      headers: {
        "Accept": "application/json",
        "X-Replit-Token": xReplitToken
      }
    }
  ).then((res) => res.json()).then((data) => data.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error("Google Sheet not connected");
  }
  return accessToken;
}
async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  return google.sheets({ version: "v4", auth: oauth2Client });
}

// server/prompts-sync.ts
import * as fs from "fs";
import * as path from "path";
var CACHE_FILE = path.resolve(process.cwd(), "data", "prompts-cache.json");
var SPREADSHEET_ID_FILE = path.resolve(process.cwd(), "data", "spreadsheet-id.txt");
var SYNC_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var TAB_NAMES = [
  "Circle 1 Call",
  "Circle 1 Text",
  "Circle 1 Hangout",
  "Circle 2 Call",
  "Circle 2 Text",
  "Circle 2 Hangout",
  "Circle 3 Call",
  "Circle 3 Text",
  "Circle 3 Hangout",
  "Universal",
  "Birthday",
  "Overdue",
  "Label Prompts",
  "Interest Prompts"
];
function ensureDataDir() {
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}
function getStoredSpreadsheetId() {
  try {
    if (fs.existsSync(SPREADSHEET_ID_FILE)) {
      return fs.readFileSync(SPREADSHEET_ID_FILE, "utf-8").trim();
    }
  } catch {
  }
  return null;
}
function storeSpreadsheetId(id) {
  ensureDataDir();
  fs.writeFileSync(SPREADSHEET_ID_FILE, id, "utf-8");
}
function getCachedPrompts() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
  }
  return null;
}
function saveCachedPrompts(prompts) {
  ensureDataDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(prompts, null, 2), "utf-8");
}
var HARDCODED_PROMPTS = {
  circle1Call: [
    "Leave [Name] a voice note telling them why they matter to you.",
    "Call [Name] just to hear their voice - no agenda needed.",
    "Ask [Name] what's been weighing on them lately via a phone call.",
    "Call [Name] and ask what they need most right now and really listen.",
    "Leave [Name] a voice message sharing a vulnerable thought.",
    "Tell [Name] out loud what they mean to you - not a text, a real call.",
    "Call [Name] and ask how they're really doing - not the surface answer.",
    "Leave [Name] a voice note about a moment this week where you wished they were there.",
    "Call [Name] and share something you've been sitting with lately.",
    "Call [Name] with no reason at all - just the desire to hear their voice.",
    "Tell [Name] on a call that you see how hard they've been working lately.",
    "Ask [Name] what's been bringing them peace lately - then really listen.",
    "Call [Name] to remind them they're not doing life alone."
  ],
  circle1Text: [
    "Tell [Name] something you deeply appreciate about who they are.",
    "Tell [Name] one way they've helped you grow.",
    "Send [Name] a reminder of one of your favorite shared memories.",
    "What's something you admire about how [Name] handles challenges?",
    "When's the last time you made [Name] laugh? Do it again.",
    "Send them a 'just because' message: no reason, just love.",
    "What's something [Name] does that makes you feel safe? Tell them.",
    "Share a vulnerable thought with [Name] - they can handle it.",
    "Tell [Name] about a moment recently where you thought of them.",
    "Ask [Name] what's been on their heart lately.",
    "Tell [Name]: I don't say this enough, but I'm really glad you're in my life.",
    "Ask [Name] what they need most right now - and really mean it.",
    "Tell [Name] one thing you hope never changes about them.",
    "Tell [Name] that you admire how they show up for others.",
    "Ask [Name] what they've been learning about themselves lately.",
    "Send [Name] a note: you don't have to have it all figured out - I'm here.",
    "Ask [Name] what part of life feels most uncertain for them right now."
  ],
  circle1Hangout: [
    "Plan a spontaneous date or hangout with [Name] this week.",
    "Surprise [Name] with a home-cooked meal or dessert drop-off.",
    "Plan a no-phones evening with [Name] - just quality time.",
    "Invite [Name] to do something completely new together."
  ],
  circle2Call: [
    "Call [Name] to catch up - even 10 minutes makes a difference.",
    "Leave [Name] a voice note checking in on how life's been.",
    "Phone [Name] and ask for advice on something you're working through.",
    "Call [Name] and tell them you've been thinking about them - no agenda.",
    "Leave [Name] a voice note just to check in - warmth goes a long way.",
    "Phone [Name] out of the blue - the unexpected call often means the most.",
    "Ask [Name] how they're doing beyond the surface - show you actually want to know.",
    "Call [Name] and ask what's been weighing on them lately.",
    "Leave [Name] a voice message saying you've been thinking about them.",
    "Give [Name] a call and share something specific you admire about them.",
    "Ask [Name] what they're looking forward to - a call goes deeper than a text."
  ],
  circle2Text: [
    "Tell [Name] something you admire about how they live their life.",
    "Remind [Name] of a time they made your day better.",
    "Send a message: 'I've been thinking about you lately - how've you been?'",
    "Tell [Name] you're proud of them for something (big or small).",
    "Ask [Name] what's bringing them joy right now.",
    "Send [Name] a photo that reminds you of a good time together.",
    "Ask [Name] for advice on something - it shows you value their opinion.",
    "Share something new you've learned with [Name].",
    "Ask [Name] what's been making them happy lately.",
    "Tell [Name] you're thinking of them and hope things are going well.",
    "Ask [Name] something genuine: what are they figuring out right now?",
    "Send [Name] a word of encouragement about something they're working through.",
    "Tell [Name] specifically what you value about their friendship.",
    "Tell [Name] that you've been rooting for them quietly.",
    "Ask [Name] how they're really doing - not the polished version.",
    "Send [Name] a genuine compliment about something you've noticed.",
    "Ask [Name] what's something they wish they had more time for."
  ],
  circle2Hangout: [
    "Plan a micro-hangout: a walk, coffee, or phone call with [Name].",
    "Suggest trying something new together with [Name].",
    "Invite [Name] to join you for a weekend activity.",
    "Plan a double date or group outing that includes [Name].",
    "Share a new spot you've discovered and invite [Name] to check it out."
  ],
  circle3Call: [
    "Give [Name] a quick call to reconnect - keep it light and easy.",
    "Call [Name] to congratulate them on a recent milestone.",
    "Leave [Name] a voice note - it's low pressure and surprisingly meaningful.",
    "Call [Name] just to say you were thinking about them - keep it short and genuine.",
    "Give [Name] a quick call to check in - no agenda, just connection.",
    "Send [Name] a voice note with no agenda - just warmth.",
    "Call [Name] to say you saw something that made you think of them.",
    "Give [Name] a brief call to check in - keep it light and easy.",
    "Leave [Name] a voice note with a genuine compliment.",
    "Call [Name] to share something small you thought they'd enjoy."
  ],
  circle3Text: [
    "Tell [Name] something you admire from afar - a quality or habit.",
    "React to their recent story or post with something thoughtful.",
    "Send [Name] a relevant article, song, or meme that reminded you of them.",
    "Check in: 'Hey, it's been a minute - want to catch up sometime soon?'",
    "Ask what's new in their world and actually listen.",
    "Congratulate [Name] on a recent milestone or life event.",
    "Forward [Name] an opportunity you think they'd be interested in.",
    "Send [Name] a message just to let them know you're thinking of them.",
    "Tell [Name] something genuine you noticed or admire about who they are.",
    "Check in with [Name] - no agenda, just a moment of presence.",
    "Send [Name] something small that made you think of them this week.",
    "Drop [Name] a short message - they don't need a reason to hear from you.",
    "Tell [Name] something you noticed about them that you haven't said yet.",
    "Ask [Name] what's been new in their world lately.",
    "Send [Name] a kind word - small gestures build real connection.",
    "Reach out to [Name] just to say hi - it's always the right time."
  ],
  circle3Hangout: [
    "Invite [Name] to a group hangout or event coming up.",
    "Suggest grabbing coffee with [Name] to catch up properly.",
    "Invite [Name] along to something you're already doing this weekend."
  ],
  universal: [
    "What's a compliment you haven't said out loud to [Name] yet?",
    "Which friend would love to hear a random thank-you from you today?",
    "Who's overdue for a celebration? Send some encouragement."
  ],
  birthday: [
    "[Name]'s birthday is coming up! Plan something special.",
    "Start thinking about what would make [Name]'s birthday memorable.",
    "Set a reminder to wish [Name] happy birthday - make it personal, not generic.",
    "[Name]'s birthday is soon. A heartfelt voice note goes a long way."
  ],
  overdue: [
    "It's been a while since you reached out to [Name]. A quick message can reignite the connection.",
    "Don't let too much time pass - send [Name] a quick 'thinking of you' today.",
    "[Name] might be wondering where you've been. Break the silence with something genuine.",
    "Reconnecting with [Name] doesn't have to be complicated. Just say hi."
  ],
  labelPrompts: {
    "childhood friend": [
      "Reminisce about a memory from growing up with [Name].",
      "Ask [Name] if they've been back to your old neighborhood.",
      "Send [Name] a throwback photo from when you were kids.",
      "Ask [Name] if they still keep in touch with anyone else from back then."
    ],
    "college friend": [
      "Remind [Name] of a ridiculous thing you did in college.",
      "Ask [Name] how their career has evolved since graduation.",
      "Send [Name] a memory from your college days together.",
      "Ask [Name] if they're going to any upcoming alumni events."
    ],
    "work friend": [
      "Check in with [Name] about how their job is going.",
      "Suggest a lunch or coffee break with [Name].",
      "Ask [Name] if they've had any exciting projects lately.",
      "Share a professional article or opportunity with [Name]."
    ],
    "neighbor": [
      "Invite [Name] over for a casual backyard hangout.",
      "Ask [Name] if they need anything from the store.",
      "Suggest a neighborhood walk with [Name].",
      "Check in on [Name] - being a good neighbor goes a long way."
    ],
    "family friend": [
      "Ask [Name] how their family is doing.",
      "Invite [Name]'s family over for dinner.",
      "Share a family update with [Name] and ask about theirs.",
      "Plan a family-friendly outing with [Name]."
    ],
    "gym buddy": [
      "Ask [Name] about their latest workout routine.",
      "Challenge [Name] to a fitness goal together.",
      "Suggest trying a new class or gym together.",
      "Check in on [Name]'s fitness progress."
    ],
    "travel buddy": [
      "Start planning your next trip with [Name].",
      "Share a travel article or destination idea with [Name].",
      "Reminisce about your favorite trip together with [Name].",
      "Ask [Name] where they want to go next."
    ],
    "family": [
      "Call [Name] just to hear their voice - no agenda, just connection.",
      "Tell [Name] something specific you're grateful for about who they are.",
      "Ask [Name] how they're really doing - not just the surface version.",
      "Share a family memory with [Name] and ask what they remember about it.",
      "Tell [Name] something you've always admired about them but never said out loud.",
      "Ask [Name] what they need most from you right now.",
      "Check in on [Name] - family deserves the same intention as any close friend.",
      "Tell [Name] that you love them and that you mean it."
    ],
    "mentor": [
      "Thank [Name] for something specific they've taught you.",
      "Ask [Name] for guidance on a challenge you're facing.",
      "Update [Name] on your progress - they'd love to hear it.",
      "Share a win with [Name] and credit their influence."
    ],
    "adult friend": [
      "Ask [Name] if they've discovered any good local spots lately.",
      "Send [Name] something that reminded you of a conversation you had.",
      "Invite [Name] for a low-key coffee, walk, or quick catch-up.",
      "Ask [Name] what they've been enjoying outside of work lately.",
      "Recommend a show, podcast, restaurant, or event that fits [Name]'s taste.",
      "Follow up with [Name] about something they mentioned last time you spoke.",
      "Suggest an easy group hangout and invite [Name] along.",
      "Share a small win or funny moment from your week with [Name]."
    ],
    "international friend": [
      "Ask [Name] when they started feeling at home in their new city.",
      "Ask [Name] if there's something they miss about home that surprised them.",
      "Tell [Name] that whenever they feel lonely, you're always here to talk.",
      "Ask [Name] what's a random thing from home they didn't expect to miss.",
      "Ask [Name] what's surprised them most about living where they do.",
      "Tell [Name] about something small that made you think of them this week.",
      "Send [Name] a message - I was just thinking about you and wanted to say hi.",
      "Jump on a FaceTime with [Name] - a real conversation is long overdue.",
      "Schedule a video call with [Name] to properly catch up.",
      "FaceTime [Name] for a few minutes - video makes the distance feel smaller.",
      "FaceTime [Name] out of the blue - they'll love to see your face.",
      "Ask [Name] if they're free for a video call this week.",
      "Next time you're in the same city as [Name], make a plan - put a date on the calendar.",
      "Start thinking about a trip to visit [Name] - even floating the idea will mean a lot."
    ]
  },
  interestPrompts: {
    fitness: [
      "Ask how their training is going",
      "Invite them to work out together this week",
      "Share a new exercise or routine you discovered"
    ],
    cooking: [
      "Ask them to share their latest recipe",
      "Suggest a cooking date or potluck",
      "Send them a recipe you think they'd love"
    ],
    music: [
      "Share a song that reminded you of them",
      "Ask what they've been listening to lately",
      "Suggest going to a concert or show together"
    ],
    travel: [
      "Ask about their next trip plans",
      "Share a travel destination you think they'd love",
      "Reminisce about a trip you took together"
    ],
    gaming: [
      "Ask what they've been playing lately",
      "Suggest a game night together",
      "Share a game you think they'd enjoy"
    ],
    reading: [
      "Ask what book they're reading now",
      "Share a book recommendation",
      "Start a mini book club with them"
    ],
    art: [
      "Ask to see what they've been creating lately",
      "Share an exhibit or gallery you think they'd enjoy",
      "Tell them you admire their creative work"
    ],
    sports: [
      "Ask if they caught the latest game",
      "Invite them to watch a game together",
      "Check in on their team's season"
    ],
    tech: [
      "Share an interesting tech article or tool",
      "Ask what projects they're working on",
      "Discuss a new tech trend with them"
    ],
    outdoors: [
      "Suggest a hike or outdoor adventure",
      "Share a beautiful spot you discovered",
      "Plan a camping or nature trip together"
    ]
  },
  lastSynced: null
};
var currentPrompts = { ...HARDCODED_PROMPTS };
var syncTimer = null;
function getPrompts() {
  return currentPrompts;
}
function mergePrompts(base, sheet) {
  const merged = { ...base };
  const simpleKeys = [
    "circle1Call",
    "circle1Text",
    "circle1Hangout",
    "circle2Call",
    "circle2Text",
    "circle2Hangout",
    "circle3Call",
    "circle3Text",
    "circle3Hangout",
    "universal",
    "birthday",
    "overdue"
  ];
  for (const key of simpleKeys) {
    const sheetList = sheet[key];
    const baseList = base[key];
    if (sheetList && Array.isArray(sheetList)) {
      const seen = new Set(baseList);
      const newItems = [];
      for (const p of sheetList) {
        if (!seen.has(p)) {
          seen.add(p);
          newItems.push(p);
        }
      }
      if (newItems.length > 0) {
        merged[key] = [...baseList, ...newItems];
      }
    }
  }
  if (sheet.labelPrompts) {
    merged.labelPrompts = { ...base.labelPrompts };
    for (const [label, prompts] of Object.entries(sheet.labelPrompts)) {
      const seen = new Set(merged.labelPrompts[label] || []);
      const newItems = [];
      for (const p of prompts) {
        if (!seen.has(p)) {
          seen.add(p);
          newItems.push(p);
        }
      }
      if (newItems.length > 0) {
        merged.labelPrompts[label] = [...merged.labelPrompts[label] || [], ...newItems];
      }
    }
  }
  if (sheet.interestPrompts) {
    merged.interestPrompts = { ...base.interestPrompts };
    for (const [interest, prompts] of Object.entries(sheet.interestPrompts)) {
      const seen = new Set(merged.interestPrompts[interest] || []);
      const newItems = [];
      for (const p of prompts) {
        if (!seen.has(p)) {
          seen.add(p);
          newItems.push(p);
        }
      }
      if (newItems.length > 0) {
        merged.interestPrompts[interest] = [...merged.interestPrompts[interest] || [], ...newItems];
      }
    }
  }
  merged.lastSynced = (/* @__PURE__ */ new Date()).toISOString();
  return merged;
}
async function readSheetTab(sheets, spreadsheetId, tabName) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:B`
    });
    return { rows: response.data.values || [], success: true };
  } catch (e) {
    console.log(`[prompts-sync] Could not read tab "${tabName}": ${e.message}`);
    return { rows: [], success: false };
  }
}
function parseSimpleTab(rows) {
  return rows.slice(1).map((row) => row[0]?.trim()).filter(Boolean);
}
function parseKeyedTab(rows) {
  const result = {};
  for (const row of rows.slice(1)) {
    const key = row[0]?.trim().toLowerCase();
    const prompt = row[1]?.trim();
    if (key && prompt) {
      if (!result[key]) result[key] = [];
      result[key].push(prompt);
    }
  }
  return result;
}
async function readAllFromSheet(spreadsheetId) {
  const sheets = await getUncachableGoogleSheetClient();
  const data = {};
  const failedTabs = [];
  const tabMapping = [
    ["Circle 1 Call", "circle1Call"],
    ["Circle 1 Text", "circle1Text"],
    ["Circle 1 Hangout", "circle1Hangout"],
    ["Circle 2 Call", "circle2Call"],
    ["Circle 2 Text", "circle2Text"],
    ["Circle 2 Hangout", "circle2Hangout"],
    ["Circle 3 Call", "circle3Call"],
    ["Circle 3 Text", "circle3Text"],
    ["Circle 3 Hangout", "circle3Hangout"],
    ["Universal", "universal"],
    ["Birthday", "birthday"],
    ["Overdue", "overdue"]
  ];
  for (const [tabName, key] of tabMapping) {
    const { rows, success } = await readSheetTab(sheets, spreadsheetId, tabName);
    if (success) {
      data[key] = parseSimpleTab(rows);
    } else {
      failedTabs.push(tabName);
    }
  }
  const labelResult = await readSheetTab(sheets, spreadsheetId, "Label Prompts");
  if (labelResult.success) {
    data.labelPrompts = parseKeyedTab(labelResult.rows);
  } else {
    failedTabs.push("Label Prompts");
  }
  const interestResult = await readSheetTab(sheets, spreadsheetId, "Interest Prompts");
  if (interestResult.success) {
    data.interestPrompts = parseKeyedTab(interestResult.rows);
  } else {
    failedTabs.push("Interest Prompts");
  }
  return { data, failedTabs, totalTabs: 14 };
}
async function createSpreadsheetWithPrompts() {
  const sheets = await getUncachableGoogleSheetClient();
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: "Bridges Prompts"
      },
      sheets: TAB_NAMES.map((name, idx) => ({
        properties: {
          title: name,
          index: idx
        }
      }))
    }
  });
  const spreadsheetId = spreadsheet.data.spreadsheetId;
  console.log(`[prompts-sync] Created spreadsheet: ${spreadsheetId}`);
  const base = HARDCODED_PROMPTS;
  const simpleTabData = [
    ["Circle 1 Call", base.circle1Call],
    ["Circle 1 Text", base.circle1Text],
    ["Circle 1 Hangout", base.circle1Hangout],
    ["Circle 2 Call", base.circle2Call],
    ["Circle 2 Text", base.circle2Text],
    ["Circle 2 Hangout", base.circle2Hangout],
    ["Circle 3 Call", base.circle3Call],
    ["Circle 3 Text", base.circle3Text],
    ["Circle 3 Hangout", base.circle3Hangout],
    ["Universal", base.universal],
    ["Birthday", base.birthday],
    ["Overdue", base.overdue]
  ];
  const batchData = [];
  for (const [tabName, prompts] of simpleTabData) {
    batchData.push({
      range: `'${tabName}'!A1`,
      values: [["Prompt"], ...prompts.map((p) => [p])]
    });
  }
  const labelRows = [["Label", "Prompt"]];
  for (const [label, prompts] of Object.entries(base.labelPrompts)) {
    for (const prompt of prompts) {
      labelRows.push([label, prompt]);
    }
  }
  batchData.push({
    range: `'Label Prompts'!A1`,
    values: labelRows
  });
  const interestRows = [["Interest", "Prompt"]];
  for (const [interest, prompts] of Object.entries(base.interestPrompts)) {
    for (const prompt of prompts) {
      interestRows.push([interest, prompt]);
    }
  }
  batchData.push({
    range: `'Interest Prompts'!A1`,
    values: interestRows
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: batchData
    }
  });
  console.log(`[prompts-sync] Populated spreadsheet with ${simpleTabData.reduce((n, [, p]) => n + p.length, 0)} simple prompts + label/interest prompts`);
  storeSpreadsheetId(spreadsheetId);
  return spreadsheetId;
}
async function syncFromSheet() {
  try {
    let spreadsheetId = getStoredSpreadsheetId();
    if (!spreadsheetId) {
      console.log("[prompts-sync] No spreadsheet found, creating one...");
      spreadsheetId = await createSpreadsheetWithPrompts();
      currentPrompts = { ...HARDCODED_PROMPTS, lastSynced: (/* @__PURE__ */ new Date()).toISOString() };
      saveCachedPrompts(currentPrompts);
      return { success: true, newCount: 0 };
    }
    console.log(`[prompts-sync] Syncing from spreadsheet ${spreadsheetId}...`);
    const { data: sheetData, failedTabs, totalTabs } = await readAllFromSheet(spreadsheetId);
    if (failedTabs.length > totalTabs / 2) {
      console.error(`[prompts-sync] Too many tab failures (${failedTabs.length}/${totalTabs}). Keeping current data.`);
      return { success: false, newCount: 0, error: `${failedTabs.length} tabs failed to read` };
    }
    if (failedTabs.length > 0) {
      console.log(`[prompts-sync] Partial sync: ${failedTabs.length} tabs failed (${failedTabs.join(", ")}). Only merging successful tabs.`);
    }
    const previousTotal = countTotalPrompts(currentPrompts);
    currentPrompts = mergePrompts(currentPrompts, sheetData);
    const newTotal = countTotalPrompts(currentPrompts);
    const newCount = newTotal - previousTotal;
    saveCachedPrompts(currentPrompts);
    console.log(`[prompts-sync] Sync complete. ${newCount} new prompts found. Total: ${newTotal}`);
    return { success: true, newCount };
  } catch (e) {
    console.error(`[prompts-sync] Sync failed: ${e.message}`);
    return { success: false, newCount: 0, error: e.message };
  }
}
function countTotalPrompts(prompts) {
  let total = 0;
  const simpleKeys = [
    "circle1Call",
    "circle1Text",
    "circle1Hangout",
    "circle2Call",
    "circle2Text",
    "circle2Hangout",
    "circle3Call",
    "circle3Text",
    "circle3Hangout",
    "universal",
    "birthday",
    "overdue"
  ];
  for (const key of simpleKeys) {
    total += prompts[key].length;
  }
  for (const prompts2 of Object.values(prompts.labelPrompts)) {
    total += prompts2.length;
  }
  for (const prompts2 of Object.values(prompts.interestPrompts)) {
    total += prompts2.length;
  }
  return total;
}
async function initPromptSync() {
  ensureDataDir();
  const cached = getCachedPrompts();
  if (cached) {
    currentPrompts = cached;
    console.log(`[prompts-sync] Loaded ${countTotalPrompts(cached)} cached prompts (last synced: ${cached.lastSynced})`);
  }
  try {
    await syncFromSheet();
  } catch (e) {
    console.log(`[prompts-sync] Initial sync failed (will use cached/hardcoded): ${e.message}`);
  }
  syncTimer = setInterval(async () => {
    console.log("[prompts-sync] Running scheduled sync...");
    await syncFromSheet();
  }, SYNC_INTERVAL_MS);
  console.log("[prompts-sync] Scheduled sync every 24 hours");
}

// server/push-notifications.ts
init_db();
init_schema();
import { isNotNull, eq as eq2 } from "drizzle-orm";

// server/birthday-utils.ts
function getDaysUntilBirthdayInTz(birthday, timezone) {
  if (!birthday) return null;
  let month;
  let day;
  const slashParts = birthday.split("/");
  if (slashParts.length >= 2) {
    month = parseInt(slashParts[0], 10) - 1;
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
  let localYear;
  let localMonth;
  let localDay;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(/* @__PURE__ */ new Date());
    localYear = parseInt(parts.find((p) => p.type === "year").value, 10);
    localMonth = parseInt(parts.find((p) => p.type === "month").value, 10) - 1;
    localDay = parseInt(parts.find((p) => p.type === "day").value, 10);
  } catch {
    const now = /* @__PURE__ */ new Date();
    localYear = now.getUTCFullYear();
    localMonth = now.getUTCMonth();
    localDay = now.getUTCDate();
  }
  const todayMidnight = new Date(localYear, localMonth, localDay);
  const thisYear = new Date(localYear, month, day);
  if (thisYear < todayMidnight) thisYear.setFullYear(thisYear.getFullYear() + 1);
  return Math.floor((thisYear.getTime() - todayMidnight.getTime()) / (1e3 * 60 * 60 * 24));
}

// server/push-notifications.ts
import { importPKCS8, SignJWT } from "jose";
import http2 from "http2";

// shared/suggestion-priority.ts
var PRIORITY_COHORT_SIZE = 3;
var CIRCLE_COOLDOWN_DAYS = {
  1: 7,
  2: 5,
  3: 15
};
var ELEVATION_SCORE_BONUS = {
  1: 3e3,
  2: 1500,
  3: 1001
};
var ELEVATION_DELAY_HOURS = {
  1: 24,
  2: 48,
  3: 72
};
var ELEVATION_LIFETIME_HOURS = {
  1: 6 * 24,
  2: 7 * 24,
  3: 8 * 24
};
function elevationBonusForAge(circleLevel, ageHours) {
  if (ageHours === null || ageHours < ELEVATION_DELAY_HOURS[circleLevel] || ageHours >= ELEVATION_LIFETIME_HOURS[circleLevel]) {
    return 0;
  }
  return ELEVATION_SCORE_BONUS[circleLevel];
}
function elevationPhaseForAge(circleLevel, ageHours) {
  if (ageHours === null || ageHours < 0 || ageHours >= ELEVATION_LIFETIME_HOURS[circleLevel]) {
    return "none";
  }
  return ageHours < ELEVATION_DELAY_HOURS[circleLevel] ? "deferred" : "due";
}
function scorePrioritySuggestion(circleLevel, daysSinceLastSuggested, daysSinceContact, elevationBonus = 0) {
  let score = circleLevel === 2 ? 1150 : circleLevel === 1 ? 1100 : 1e3;
  if (daysSinceLastSuggested === null) {
    score += 150;
  } else {
    score += Math.min(daysSinceLastSuggested * 12, 150);
  }
  const freshThreshold = { 1: 2, 2: 5, 3: 10 };
  if (daysSinceContact !== null && daysSinceContact < freshThreshold[circleLevel]) {
    score -= (freshThreshold[circleLevel] - daysSinceContact) * 50;
  }
  if (daysSinceContact !== null) {
    score += Math.min(daysSinceContact * 6, 450);
  } else {
    score += 40;
  }
  return score + elevationBonus;
}
function selectSuggestionForDelivery(priorityCohort, lastSuccessfulContactIds) {
  const recentlyDelivered = new Set(lastSuccessfulContactIds.slice(0, 2));
  return priorityCohort.find((contact) => !recentlyDelivered.has(contact.id)) ?? priorityCohort.find((contact) => contact.id !== lastSuccessfulContactIds[0]) ?? priorityCohort[0];
}

// shared/reminder-thresholds.ts
var CHECKIN_THRESHOLDS = {
  1: 14,
  2: 45,
  3: 160
};
var NEW_CONTACT_GRACE_DAYS = 7;
function isCheckinQuickPickEligible(circleLevel, daysSinceContact, daysSinceCreated, emptyPromptDueAt, now = /* @__PURE__ */ new Date()) {
  if (daysSinceContact !== null) {
    return daysSinceContact > CHECKIN_THRESHOLDS[circleLevel];
  }
  if (emptyPromptDueAt) {
    const due = new Date(emptyPromptDueAt);
    return !Number.isNaN(due.getTime()) && now.getTime() > due.getTime();
  }
  if (circleLevel === 3) return false;
  if (daysSinceCreated === null) return false;
  const isNewUncontactedContact = daysSinceCreated <= NEW_CONTACT_GRACE_DAYS;
  if (isNewUncontactedContact) return false;
  return true;
}

// shared/checkin-time.ts
function calendarParts(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  return [
    Number(parts.find((part) => part.type === "year")?.value),
    Number(parts.find((part) => part.type === "month")?.value),
    Number(parts.find((part) => part.type === "day")?.value)
  ];
}
function literalDateParts(value) {
  const dateOnly = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) return [Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])];
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!slash) return null;
  return [slash[3] ? Number(slash[3]) : (/* @__PURE__ */ new Date()).getFullYear(), Number(slash[1]), Number(slash[2])];
}
function getCheckinDaysSince(value, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", now = /* @__PURE__ */ new Date()) {
  if (!value) return null;
  try {
    const today = calendarParts(now, timezone);
    const literal = typeof value === "string" ? literalDateParts(value) : null;
    const contactDay = literal ?? calendarParts(value instanceof Date ? value : new Date(value), timezone);
    if ([...today, ...contactDay].some((part) => !Number.isFinite(part))) return null;
    return Math.floor(
      (Date.UTC(today[0], today[1] - 1, today[2]) - Date.UTC(contactDay[0], contactDay[1] - 1, contactDay[2])) / 864e5
    );
  } catch {
    return null;
  }
}

// server/push-notifications.ts
function getContactDaysSince(value, timezone, now = /* @__PURE__ */ new Date()) {
  return getCheckinDaysSince(value, timezone, now);
}
function buildBirthdayDayOfMessages(contact, timezone) {
  const messages = [];
  const daysUntil = getDaysUntilBirthdayInTz(contact.birthday, timezone);
  if (daysUntil !== 0) return messages;
  if (contact.circleLevel === 1 || contact.circleLevel === 2) {
    messages.push({
      title: `Happy birthday, ${contact.name}!`,
      body: `Today is ${contact.name}'s birthday \u2014 wish them a happy birthday!`,
      contactId: contact.id,
      notifType: "birthday"
    });
  } else if (contact.circleLevel === 3) {
    messages.push({
      title: `${contact.name}'s birthday`,
      body: `Today is ${contact.name}'s birthday.`,
      contactId: contact.id,
      notifType: "birthday"
    });
  }
  return messages;
}
function buildReminderMessages(contact, timezone) {
  const messages = [];
  const daysUntilBirthday = getDaysUntilBirthdayInTz(contact.birthday, timezone);
  if (contact.circleLevel === 1) {
    const daysSinceContact = getContactDaysSince(contact.lastContacted, timezone);
    const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
    if (isCheckinQuickPickEligible(1, daysSinceContact, daysSinceCreated, contact.emptyLastContactPromptDueAt)) {
      messages.push({
        title: `Check in with ${contact.name}`,
        body: `Open the app to confirm when you last spoke.`,
        contactId: contact.id,
        notifType: "reminder"
      });
    }
    if (daysUntilBirthday !== null && daysUntilBirthday > 0) {
      if (daysUntilBirthday === 1) {
        messages.push({
          title: `${contact.name}'s birthday is tomorrow`,
          body: `${contact.name}'s birthday is tomorrow \u2014 make sure you're ready to celebrate!`,
          contactId: contact.id,
          notifType: "milestone"
        });
      } else if (daysUntilBirthday === 7) {
        messages.push({
          title: `${contact.name}'s birthday is coming up`,
          body: `${contact.name}'s birthday is a week away \u2014 make sure you have everything sorted!`,
          contactId: contact.id,
          notifType: "milestone"
        });
      } else if (daysUntilBirthday === 14) {
        messages.push({
          title: `${contact.name}'s birthday in 2 weeks`,
          body: `${contact.name}'s birthday is 2 weeks away \u2014 is your gift and their birthday plans finalised?`,
          contactId: contact.id,
          notifType: "milestone"
        });
      } else if (daysUntilBirthday === 30) {
        messages.push({
          title: `${contact.name}'s birthday is a month away`,
          body: `${contact.name}'s birthday is coming up \u2014 would you like to plan a surprise party or plan their gift?`,
          contactId: contact.id,
          notifType: "milestone"
        });
      }
    }
    buildCustomReminderMessages(contact, [30, 14, 7, 0], timezone, messages);
  } else if (contact.circleLevel === 2) {
    const daysSinceContact = getContactDaysSince(contact.lastContacted, timezone);
    const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
    if (isCheckinQuickPickEligible(2, daysSinceContact, daysSinceCreated, contact.emptyLastContactPromptDueAt)) {
      messages.push({
        title: `Check in with ${contact.name}`,
        body: `Open the app to confirm when you last spoke.`,
        contactId: contact.id,
        notifType: "reminder"
      });
    }
    if (daysUntilBirthday !== null && daysUntilBirthday === 7) {
      messages.push({
        title: `${contact.name}'s birthday is coming up`,
        body: `${contact.name}'s birthday is coming up in a week.`,
        contactId: contact.id,
        notifType: "milestone"
      });
    }
    buildCustomReminderMessages(contact, [7, 0], timezone, messages);
  } else if (contact.circleLevel === 3) {
    const daysSinceContact3 = getContactDaysSince(contact.lastContacted, timezone);
    const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
    if (isCheckinQuickPickEligible(3, daysSinceContact3, daysSinceCreated, contact.emptyLastContactPromptDueAt)) {
      messages.push({
        title: `Check in with ${contact.name}`,
        body: `Open the app to confirm when you last spoke.`,
        contactId: contact.id,
        notifType: "reminder"
      });
    }
    buildCustomReminderMessages(contact, [0], timezone, messages);
  }
  return messages;
}
function buildCustomReminderMessages(contact, milestones, timezone, messages) {
  let reminders = [];
  try {
    const raw = contact.customReminders;
    if (Array.isArray(raw)) reminders = raw;
  } catch {
    return;
  }
  for (const cr of reminders) {
    if (!cr.label || !cr.date) continue;
    const daysUntil = getDaysUntilBirthdayInTz(cr.date, timezone);
    if (daysUntil === null) continue;
    if (!milestones.includes(daysUntil)) continue;
    if (daysUntil === 0) {
      messages.push({
        title: `${cr.label} \u2014 ${contact.name}`,
        body: `Today is ${contact.name}'s ${cr.label}.`,
        contactId: contact.id,
        notifType: "custom"
      });
    } else if (daysUntil === 7) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is coming up`,
        body: `${contact.name}'s ${cr.label} is a week away.`,
        contactId: contact.id,
        notifType: "custom"
      });
    } else if (daysUntil === 14) {
      messages.push({
        title: `${contact.name}'s ${cr.label} in 2 weeks`,
        body: `${contact.name}'s ${cr.label} is 2 weeks away.`,
        contactId: contact.id,
        notifType: "custom"
      });
    } else if (daysUntil === 30) {
      messages.push({
        title: `${contact.name}'s ${cr.label} is a month away`,
        body: `${contact.name}'s ${cr.label} is coming up in a month.`,
        contactId: contact.id,
        notifType: "custom"
      });
    }
  }
}
function dedupMessages(msgs, recentIds) {
  const seen = /* @__PURE__ */ new Set();
  return msgs.filter((m) => {
    if (!m.contactId) return true;
    if (recentIds.has(m.contactId)) return false;
    if (seen.has(m.contactId)) return false;
    seen.add(m.contactId);
    return true;
  });
}
async function getRecentlySentContactIds(userId, types) {
  try {
    const placeholders = types.map((_, i) => `$${i + 2}`).join(", ");
    const result = await pool.query(
      `SELECT DISTINCT contact_id FROM notification_log
       WHERE user_id = $1 AND sent_at > NOW() - INTERVAL '24 hours'
         AND notif_type IN (${placeholders})`,
      [userId, ...types]
    );
    return new Set(result.rows.map((r) => r.contact_id));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
async function pruneOldNotificationLog() {
  try {
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
         )`
    );
    await pool.query(
      `DELETE FROM notification_log
       WHERE sent_at < NOW() - INTERVAL '60 days'
         AND notif_type NOT IN (
           'suggestion_priority_1',
           'suggestion_priority_2',
           'suggestion_priority_3'
         )`
    );
  } catch {
  }
}
var EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
async function sendExpoPush(token, title, body, data) {
  try {
    const payload = { to: token, title, body, sound: "default", data: data ?? {} };
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`[push] HTTP 404 for token ${token.slice(0, 20)}\u2026 \u2014 token is expired`);
        return "expired";
      }
      console.error(`[push] HTTP ${res.status} sending to ${token.slice(0, 20)}\u2026`);
      return false;
    }
    try {
      const json = await res.json();
      const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
      if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
        console.warn(`[push] DeviceNotRegistered for token ${token.slice(0, 20)}\u2026 \u2014 token is expired`);
        return "expired";
      }
      if (ticket?.status === "error" && ticket?.details?.error === "InvalidCredentials") {
        console.error(
          `[push] *** CREDENTIAL FAILURE *** InvalidCredentials for token ${token.slice(0, 30)}\u2026
[push] This means the APNs credentials for the app bundle registered with Expo have expired or are missing.
[push] Full Expo response: ${JSON.stringify(ticket)}
[push] Token retained: this is an app-wide credential problem, not a device-specific token failure.
[push] FIX: Repair the Expo/APNs credential configuration and send again.`
        );
        return false;
      }
      if (ticket?.status === "error") {
        console.error(`[push] Expo push error for token ${token.slice(0, 20)}\u2026: ${JSON.stringify(ticket)}`);
        return false;
      }
    } catch {
    }
    return true;
  } catch (err) {
    console.error("[push] Failed to send notification:", err);
    return false;
  }
}
var _apnsJwt = null;
var _apnsJwtIssuedAt = 0;
var _apnsClient = null;
async function getApnsJwt() {
  const now = Math.floor(Date.now() / 1e3);
  if (_apnsJwt && now - _apnsJwtIssuedAt < 55 * 60) return _apnsJwt;
  const keyP8 = process.env.APNS_AUTH_KEY_P8;
  const keyId = process.env.APNS_KEY_ID ?? "A95GG3Y47Y";
  const teamId = process.env.APNS_TEAM_ID ?? "5BJJ2KP2X5";
  if (!keyP8) throw new Error("[push] APNS_AUTH_KEY_P8 secret is not set");
  const privateKey = await importPKCS8(keyP8, "ES256");
  _apnsJwt = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: keyId }).setIssuedAt().setIssuer(teamId).sign(privateKey);
  _apnsJwtIssuedAt = now;
  return _apnsJwt;
}
function getApnsClient() {
  if (!_apnsClient || _apnsClient.destroyed) {
    _apnsClient = http2.connect("https://api.push.apple.com");
    _apnsClient.on("error", (err) => {
      console.error("[push] APNs HTTP/2 connection error:", err);
      _apnsClient = null;
    });
  }
  return _apnsClient;
}
async function sendApnsPush(deviceToken, title, body) {
  try {
    const jwt = await getApnsJwt();
    const bundleId = process.env.APNS_BUNDLE_ID ?? "app.replit.bridges";
    const client = getApnsClient();
    const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" } });
    return new Promise((resolve3) => {
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        ":scheme": "https",
        ":authority": "api.push.apple.com",
        "authorization": `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload))
      });
      let status = 0;
      let responseBody = "";
      req.on("response", (h) => {
        status = h[":status"];
      });
      req.on("data", (chunk) => {
        responseBody += chunk;
      });
      req.on("end", () => {
        if (status === 200) {
          resolve3(true);
          return;
        }
        try {
          const json = JSON.parse(responseBody);
          if (json.reason === "Unregistered" || json.reason === "BadDeviceToken") {
            console.warn(`[push] APNs ${json.reason} for token ${deviceToken.slice(0, 10)}\u2026`);
            resolve3("expired");
          } else {
            console.error(`[push] APNs error ${status}: ${responseBody}`);
            resolve3(false);
          }
        } catch {
          console.error(`[push] APNs error ${status}: ${responseBody}`);
          resolve3(false);
        }
      });
      req.on("error", (err) => {
        console.error("[push] APNs request error:", err);
        _apnsClient = null;
        resolve3(false);
      });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.error("[push] sendApnsPush error:", err);
    return false;
  }
}
async function sendPush(token, title, body, data) {
  if (token.startsWith("apns:")) {
    return sendApnsPush(token.slice(5), title, body);
  }
  return sendExpoPush(token, title, body, data);
}
async function clearExpiredPushToken(userId, token) {
  try {
    await pool.query(
      `UPDATE users SET push_token = NULL WHERE id = $1 AND push_token = $2`,
      [userId, token]
    );
    console.warn(`[push] Cleared expired push token for user ${userId.slice(0, 8)}`);
  } catch (err) {
    console.error(`[push] Failed to clear expired token for user ${userId.slice(0, 8)}:`, err);
  }
}
function parseIntlHour(raw) {
  const h = parseInt(raw, 10);
  return h === 24 ? 0 : h;
}
function getLocalHour(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false
    });
    return parseIntlHour(formatter.format(/* @__PURE__ */ new Date()));
  } catch {
    console.warn(
      `[push] getLocalHour: unrecognised timezone "${timezone}", falling back to UTC. User will receive pushes at the wrong local hour until their timezone is corrected.`
    );
    return (/* @__PURE__ */ new Date()).getUTCHours();
  }
}
var DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function getLocalDayOfWeek(timezone) {
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short"
    }).format(/* @__PURE__ */ new Date());
    const idx = DAY_SHORT.indexOf(short);
    return idx >= 0 ? idx : (/* @__PURE__ */ new Date()).getDay();
  } catch {
    console.warn(
      `[push] getLocalDayOfWeek: unrecognised timezone "${timezone}", falling back to server local day. User will receive pushes on the wrong local day until their timezone is corrected.`
    );
    return (/* @__PURE__ */ new Date()).getDay();
  }
}
function isAtLocalDeliveryStart(timezone, targetHour, now = /* @__PURE__ */ new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const hour = parseIntlHour(parts.find((part) => part.type === "hour")?.value ?? "");
    return hour === targetHour;
  } catch {
    return now.getUTCHours() === targetHour;
  }
}
async function sendRemindersForUserUnlocked(userId, pushToken, timezone, scheduledAt) {
  const tz = timezone || "UTC";
  const isNineAm = isAtLocalDeliveryStart(tz, 9, scheduledAt);
  const isFivePm = isAtLocalDeliveryStart(tz, 17, scheduledAt);
  if (!isNineAm && !isFivePm) return 0;
  const userContacts = await db.select().from(contacts).where(eq2(contacts.userId, userId));
  const nineAmBirthdayMsgs = [];
  const nineAmCustomMsgs = [];
  const nineAmMilestoneMsgs = [];
  const nineAmReminderMsgs = [];
  const fivePmReminderMsgs = [];
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
  const contactsById = new Map(
    userContacts.map((contact) => [contact.id, contact])
  );
  const reminderPriority = (msg) => {
    const contact = msg.contactId ? contactsById.get(msg.contactId) : void 0;
    if (!contact) return 0;
    const circle = contact.circleLevel;
    const days = getContactDaysSince(contact.lastContacted, tz);
    if (circle === 1) {
      return 100 + (days === null ? 80 : Math.min(80, 30 + Math.floor((days - CHECKIN_THRESHOLDS[1]) * 3)));
    }
    if (circle === 2) {
      return 60 + (days === null ? 60 : Math.min(60, 20 + Math.floor((days - CHECKIN_THRESHOLDS[2]) * 1.2)));
    }
    return 30 + (days === null ? 0 : Math.min(30, Math.floor((days - CHECKIN_THRESHOLDS[3]) * 0.4)));
  };
  const sortRemindersByVisiblePriority = (messages) => messages.sort(
    (a, b) => reminderPriority(b) - reminderPriority(a) || a.title.localeCompare(b.title) || (a.contactId ?? "").localeCompare(b.contactId ?? "")
  );
  sortRemindersByVisiblePriority(nineAmReminderMsgs);
  sortRemindersByVisiblePriority(fivePmReminderMsgs);
  try {
    const cooldownResult = await pool.query(
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
      [userId]
    );
    if (cooldownResult.rows.length > 0) {
      const cooldownIds = new Set(cooldownResult.rows.map((r) => r.contact_id));
      const applyCooldown = (msgs) => msgs.filter((m) => {
        if (!m.contactId || !cooldownIds.has(m.contactId)) return true;
        console.log(
          `[push]   skip [swipe-cooldown] "${m.title.slice(0, 50)}" \u2014 contact ${m.contactId.slice(0, 8)} dismissed recently`
        );
        return false;
      });
      nineAmReminderMsgs.splice(0, Infinity, ...applyCooldown(nineAmReminderMsgs));
      fivePmReminderMsgs.splice(0, Infinity, ...applyCooldown(fivePmReminderMsgs));
      nineAmMilestoneMsgs.splice(0, Infinity, ...applyCooldown(nineAmMilestoneMsgs));
    }
  } catch (cooldownErr) {
    console.warn(`[push]   swipe-cooldown check failed (non-fatal):`, cooldownErr);
  }
  const recentBirthdayIds = await getRecentlySentContactIds(userId, ["birthday", "birthday_claim"]);
  const recentCustomIds = await getRecentlySentContactIds(userId, ["custom", "custom_claim"]);
  const recentReminderIds = await getRecentlySentContactIds(userId, ["reminder", "reminder_claim", "elevation"]);
  const recentMilestoneIds = await getRecentlySentContactIds(userId, ["milestone", "milestone_claim"]);
  const nineAmMsgs = [];
  if (isNineAm) {
    const filteredBirthdays = dedupMessages(nineAmBirthdayMsgs, recentBirthdayIds);
    if (filteredBirthdays.length > 0) {
      nineAmMsgs.push(...filteredBirthdays);
    } else {
      const fallback = [
        ...dedupMessages(nineAmCustomMsgs, recentCustomIds),
        ...dedupMessages(nineAmMilestoneMsgs, recentMilestoneIds),
        ...dedupMessages(nineAmReminderMsgs, recentReminderIds)
      ];
      if (fallback[0]) nineAmMsgs.push(fallback[0]);
    }
  }
  let fivePmMsg = null;
  if (isFivePm) {
    const crossTypeBlockIds = /* @__PURE__ */ new Set([...recentBirthdayIds, ...recentCustomIds]);
    const filteredReminder = dedupMessages(
      fivePmReminderMsgs,
      /* @__PURE__ */ new Set([...recentReminderIds, ...crossTypeBlockIds])
    );
    fivePmMsg = filteredReminder[0] ?? null;
  }
  const toSend = [...nineAmMsgs, ...fivePmMsg ? [fivePmMsg] : []];
  if (toSend.length === 0) {
    const totalBuilt = nineAmBirthdayMsgs.length + nineAmCustomMsgs.length + nineAmMilestoneMsgs.length + nineAmReminderMsgs.length + fivePmReminderMsgs.length;
    if (totalBuilt > 0) {
      console.log(`[push]   user ${userId.slice(0, 8)}: eligible messages exist but all in 24h dedup window`);
    }
    return 0;
  }
  console.log(
    `[push]   user ${userId.slice(0, 8)}: sending ${toSend.length} notification(s) [${toSend.map((m) => `${m.notifType}@${(m.contactId ?? "?").slice(0, 8)}`).join(", ")}]`
  );
  let sent = 0;
  for (const msg of toSend) {
    if (!msg.contactId) continue;
    const claimType = `${msg.notifType}_claim`;
    const claimResult = await pool.query(
      `INSERT INTO notification_log (user_id, contact_id, notif_type)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, msg.contactId, claimType]
    );
    const claimId = claimResult.rows[0]?.id;
    if (!claimId) {
      throw new Error(`[push] Unable to create ${claimType} delivery claim`);
    }
    const result = await sendPush(
      pushToken,
      msg.title,
      msg.body,
      { contactId: msg.contactId }
    );
    if (result === "expired") {
      await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
      await clearExpiredPushToken(userId, pushToken);
      return sent;
    }
    if (result) {
      await pool.query(
        `UPDATE notification_log
         SET notif_type = $2, sent_at = NOW()
         WHERE id = $1`,
        [claimId, msg.notifType]
      );
      sent++;
      console.log(`[push]     sent [${msg.notifType}] "${msg.title.slice(0, 50)}" \u2192 contact ${msg.contactId.slice(0, 8)}`);
    } else {
      await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
    }
  }
  return sent;
}
async function sendRemindersForUser(userId, pushToken, timezone, scheduledAt = /* @__PURE__ */ new Date()) {
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const result = await lockClient.query(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
      [`bridges:reminder:${userId}`]
    );
    lockAcquired = result.rows[0]?.acquired === true;
    if (!lockAcquired) {
      console.log(`[push]   user ${userId.slice(0, 8)}: reminder delivery already in progress`);
      return 0;
    }
    return await sendRemindersForUserUnlocked(userId, pushToken, timezone, scheduledAt);
  } finally {
    if (lockAcquired) {
      await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`bridges:reminder:${userId}`]).catch((err) => console.warn("[push] Failed to release reminder advisory lock:", err));
    }
    lockClient.release();
  }
}
async function sendDailyReminders() {
  console.log("[push] Checking per-user reminders (9am and 5pm windows; 1 push per window per user)\u2026");
  try {
    await pruneOldNotificationLog();
    const usersWithTokens = await db.select({
      id: users.id,
      pushToken: users.pushToken,
      notificationTimezone: users.notificationTimezone
    }).from(users).where(isNotNull(users.pushToken));
    let sent = 0;
    const scheduledAt = /* @__PURE__ */ new Date();
    for (const user of usersWithTokens) {
      if (!user.pushToken) continue;
      sent += await sendRemindersForUser(
        user.id,
        user.pushToken,
        user.notificationTimezone ?? "UTC",
        scheduledAt
      );
    }
    if (sent > 0) {
      console.log(`[push] sendDailyReminders: sent ${sent} notification(s) total`);
    }
  } catch (err) {
    console.error("[push] Error sending reminders:", err);
  }
}
async function sendHangoutFinalizedNotifications(planId, organizerUserId) {
  try {
    const [plan] = await db.select().from(hangoutPlans).where(eq2(hangoutPlans.id, planId));
    if (!plan) return;
    const options = await db.select().from(hangoutOptions).where(eq2(hangoutOptions.planId, planId));
    const timeOption = options.find(
      (o) => o.id === plan.finalizedTimeOptionId
    );
    const activityOption = options.find(
      (o) => o.id === plan.finalizedOptionId
    );
    const timePart = timeOption?.label ?? timeOption?.dateTime ?? null;
    const locationPart = activityOption?.location ?? timeOption?.location ?? activityOption?.activity ?? activityOption?.label ?? null;
    let bodyParts = [plan.title];
    if (timePart) bodyParts.push(timePart);
    const notificationBody = bodyParts.join(" \u2014 ") + (locationPart ? ` at ${locationPart}` : "");
    console.log(
      `[push] Hangout ${planId} finalized \u2014 invitee push notifications skipped (no safe voter\u2192account binding).`
    );
  } catch (err) {
    console.error("[push] Error sending hangout finalized notifications:", err);
  }
}
function hasHomeReminder(contact, timezone, now) {
  const circle = contact.circleLevel;
  if (![1, 2, 3].includes(circle)) return false;
  const daysSinceContact = getContactDaysSince(contact.lastContacted, timezone);
  const daysSinceCreated = getContactDaysSince(contact.createdAt, timezone);
  if (isCheckinQuickPickEligible(circle, daysSinceContact, daysSinceCreated, contact.emptyLastContactPromptDueAt, now)) return true;
  const reminderWindow = { 1: 30, 2: 7, 3: 0 }[circle];
  const birthdayDays = getDaysUntilBirthdayInTz(contact.birthday, timezone);
  if (birthdayDays !== null && birthdayDays >= 0 && birthdayDays <= reminderWindow) {
    return true;
  }
  const customReminders = Array.isArray(contact.customReminders) ? contact.customReminders : [];
  return customReminders.some((reminder) => {
    const days = getDaysUntilBirthdayInTz(reminder.date, timezone);
    return days !== null && days >= 0 && days <= reminderWindow;
  });
}
function selectSuggestionPushCandidates(priorityCohort, timezone, now = /* @__PURE__ */ new Date()) {
  const eligibleCohort = priorityCohort.filter(
    (contact) => contact.circleLevel !== 3 || contact.elevationPhase !== "deferred"
  );
  const reminderFree = eligibleCohort.filter(
    (contact) => !hasHomeReminder(contact, timezone, now)
  );
  return reminderFree.length > 0 ? reminderFree : eligibleCohort;
}
async function getPrioritySuggestionCohort(userId, _timezone = "UTC", now = /* @__PURE__ */ new Date()) {
  const [userContacts, eventResult, snapshotResult] = await Promise.all([
    db.select().from(contacts).where(eq2(contacts.userId, userId)),
    pool.query(
      `SELECT contact_id, notif_type, sent_at
       FROM notification_log
       WHERE user_id = $1
         AND notif_type IN ('suggestion_dismissed', 'elevation')
         AND sent_at > NOW() - INTERVAL '15 days'
       ORDER BY sent_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT contact_id, notif_type
       FROM notification_log
       WHERE user_id = $1
         AND notif_type IN (
           'suggestion_priority_1',
           'suggestion_priority_2',
           'suggestion_priority_3'
         )
       ORDER BY notif_type ASC`,
      [userId]
    )
  ]);
  const latestDismissal = /* @__PURE__ */ new Map();
  const latestElevation = /* @__PURE__ */ new Map();
  for (const event of eventResult.rows) {
    if (!event.contact_id) continue;
    const target = event.notif_type === "suggestion_dismissed" ? latestDismissal : latestElevation;
    if (!target.has(event.contact_id)) target.set(event.contact_id, new Date(event.sent_at));
  }
  const rankedContacts = userContacts.filter((contact) => {
    const circle = contact.circleLevel;
    if (![1, 2, 3].includes(circle)) return false;
    const dismissedAt = latestDismissal.get(contact.id);
    if (dismissedAt) {
      const elapsedDays = (now.getTime() - dismissedAt.getTime()) / 864e5;
      if (elapsedDays < CIRCLE_COOLDOWN_DAYS[circle]) return false;
    }
    const elevatedAt = latestElevation.get(contact.id);
    const elevationAgeHours = elevatedAt ? (now.getTime() - elevatedAt.getTime()) / 36e5 : null;
    return circle !== 3 || elevationPhaseForAge(circle, elevationAgeHours) !== "deferred";
  }).map((contact) => {
    const circle = contact.circleLevel;
    const elevatedAt = latestElevation.get(contact.id);
    const elevationAgeHours = elevatedAt ? (now.getTime() - elevatedAt.getTime()) / 36e5 : null;
    const elevationBonus = elevationBonusForAge(circle, elevationAgeHours);
    const elevationPhase = elevationPhaseForAge(circle, elevationAgeHours);
    return {
      ...contact,
      elevationPhase,
      score: scorePrioritySuggestion(
        circle,
        null,
        getContactDaysSince(contact.lastContacted, _timezone, now),
        elevationBonus
      )
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const rankedById = new Map(rankedContacts.map((contact) => [contact.id, contact]));
  const publishedContacts = [];
  const publishedIds = /* @__PURE__ */ new Set();
  for (const row of snapshotResult.rows) {
    const contact = rankedById.get(row.contact_id);
    if (contact && !publishedIds.has(contact.id)) {
      publishedContacts.push(contact);
      publishedIds.add(contact.id);
    }
  }
  return [
    ...publishedContacts,
    ...rankedContacts.filter((contact) => !publishedIds.has(contact.id))
  ].slice(0, PRIORITY_COHORT_SIZE);
}
async function sendProfileCompletionPushes() {
  try {
    const scheduledAt = /* @__PURE__ */ new Date();
    const usersWithTokens = await db.select({
      id: users.id,
      pushToken: users.pushToken,
      notificationTimezone: users.notificationTimezone,
      lastProfilePushAt: users.lastProfilePushAt
    }).from(users).where(isNotNull(users.pushToken));
    let sent = 0;
    for (const user of usersWithTokens) {
      if (!user.pushToken) continue;
      const tz = user.notificationTimezone ?? "UTC";
      if (!isAtLocalDeliveryStart(tz, 9, scheduledAt)) continue;
      if (getLocalDayOfWeek(tz) !== 0) continue;
      if (user.lastProfilePushAt) {
        const daysSinceLastPush = Math.floor(
          (Date.now() - new Date(user.lastProfilePushAt).getTime()) / (1e3 * 60 * 60 * 24)
        );
        if (daysSinceLastPush <= 6) continue;
      }
      const c1NoBirthday = await pool.query(
        `SELECT COUNT(*) AS count FROM contacts WHERE user_id = $1 AND circle_level = 1 AND (birthday IS NULL OR birthday = '')`,
        [user.id]
      );
      const missingCount = parseInt(c1NoBirthday.rows[0]?.count ?? "0", 10);
      if (missingCount === 0) continue;
      const result = await sendPush(
        user.pushToken,
        "Complete your Bridges profile",
        "Some of your Core contacts are missing birthdays \u2014 add them to unlock reminders."
      );
      if (result === "expired") {
        await clearExpiredPushToken(user.id, user.pushToken);
        continue;
      }
      if (result) {
        await pool.query(
          `UPDATE users SET last_profile_push_at = NOW() WHERE id = $1`,
          [user.id]
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
async function sendSuggestionNudges(userId) {
  const nowUtc = (/* @__PURE__ */ new Date()).toISOString();
  console.log(`[push] sendSuggestionNudges running at ${nowUtc}`);
  try {
    const scheduledAt = /* @__PURE__ */ new Date();
    const result = await pool.query(
      `SELECT id, push_token, notification_timezone,
              COALESCE(suggestion_notif_frequency, 'daily') AS suggestion_notif_frequency,
              suggestion_notif_time
       FROM users
       WHERE push_token IS NOT NULL
         AND COALESCE(suggestion_notif_frequency, 'daily') != 'off'
         ${userId ? "AND id = $1" : ""}`,
      userId ? [userId] : []
    );
    console.log(`[push] Suggestion nudge candidates: ${result.rows.length} user(s) with token + freq != off`);
    let sent = 0;
    for (const user of result.rows) {
      const tz = user.notification_timezone ?? "UTC";
      const localHour = getLocalHour(tz);
      const preferredHour = user.suggestion_notif_time === "afternoon" ? 17 : 9;
      console.log(`[push]   user ${user.id.slice(0, 8)} tz=${tz} localHour=${localHour} preferredHour=${preferredHour} freq=${user.suggestion_notif_frequency}`);
      if (localHour !== preferredHour) {
        console.log(`[push]   \u2192 skip: hour mismatch (${localHour} != ${preferredHour})`);
        continue;
      }
      if (!isAtLocalDeliveryStart(tz, preferredHour, scheduledAt)) {
        console.log(`[push]   \u2192 skip: outside the ${preferredHour}:00 delivery start`);
        continue;
      }
      const freq = user.suggestion_notif_frequency;
      const localDayOfWeek = getLocalDayOfWeek(tz);
      if (freq === "3x_week" && ![1, 3, 6].includes(localDayOfWeek)) {
        console.log(`[push]   \u2192 skip: 3x_week day mismatch (day ${localDayOfWeek})`);
        continue;
      }
      if (freq === "weekly" && localDayOfWeek !== 3) {
        console.log(`[push]   \u2192 skip: weekly day mismatch (day ${localDayOfWeek})`);
        continue;
      }
      const lockClient = await pool.connect();
      let userLockAcquired = false;
      try {
        const advisoryResult = await lockClient.query(
          `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
          [`bridges:suggestion:${user.id}`]
        );
        userLockAcquired = advisoryResult.rows[0]?.acquired === true;
        if (!userLockAcquired) {
          console.log(`[push]   \u2192 skip: another process is handling this user's suggestion window`);
          continue;
        }
        try {
          const windowLockResult = await pool.query(
            `SELECT COUNT(*) AS count FROM notification_log
           WHERE user_id = $1
               AND notif_type IN ('suggestion_claim', 'suggestion_push', 'suggestion')
             AND sent_at >= (date_trunc('hour', NOW() AT TIME ZONE $2) AT TIME ZONE $2)`,
            [user.id, tz]
          );
          const alreadySentThisWindow = parseInt(windowLockResult.rows[0]?.count ?? "0", 10) > 0;
          if (alreadySentThisWindow) {
            console.log(`[push]   \u2192 skip: suggestion already sent in this ${preferredHour}:xx window`);
            continue;
          }
        } catch (lockErr) {
          console.warn(`[push]   window lock check failed (non-fatal):`, lockErr);
        }
        const priorityCohort = await getPrioritySuggestionCohort(user.id, tz);
        if (priorityCohort.length === 0) {
          console.log(`[push]   \u2192 skip: no eligible contacts in priority cohort`);
          continue;
        }
        const pushCandidates = selectSuggestionPushCandidates(priorityCohort, tz);
        const usingReminderFallback = pushCandidates.length === priorityCohort.length && pushCandidates.every((contact, index) => contact.id === priorityCohort[index]?.id) && priorityCohort.every((contact) => hasHomeReminder(contact, tz, /* @__PURE__ */ new Date()));
        const lastSuccessfulResult = await pool.query(
          `SELECT contact_id
         FROM notification_log
         WHERE user_id = $1
           AND notif_type = 'suggestion_push'
         ORDER BY sent_at DESC
         LIMIT 2`,
          [user.id]
        );
        const bestContact = selectSuggestionForDelivery(
          pushCandidates,
          lastSuccessfulResult.rows.map((row) => row.contact_id)
        );
        if (!bestContact) continue;
        console.log(
          `[push]   \u2192 cohort: ${priorityCohort.map((contact) => contact.name).join(", ")}; push-eligible: ${pushCandidates.map((contact) => contact.name).join(", ")}; sending "${bestContact.name}" score=${bestContact.score}` + (usingReminderFallback ? " (all priority contacts are quick-picks; daily suggestion retained)" : "")
        );
        const nudgeTemplates = [
          { title: (n) => `Time to reach out to ${n}`, body: () => "Open the app to see what to say." },
          { title: (n) => `${n} is due for a check-in`, body: (n) => `It's been a while since you connected with ${n} \u2014 open Bridges for a suggestion.` },
          { title: () => "A friendly nudge", body: (n) => `Thinking of ${n}? Open Bridges for a quick way to reach out.` },
          { title: (n) => `Say hi to ${n}`, body: () => "Open Bridges for a suggestion on what to say." }
        ];
        const dayKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        let hash = 0;
        for (const ch of `${bestContact.id}${dayKey}`) hash = hash * 31 + ch.charCodeAt(0) >>> 0;
        const template = nudgeTemplates[hash % nudgeTemplates.length];
        const claimResult = await pool.query(
          `INSERT INTO notification_log (user_id, contact_id, notif_type)
         VALUES ($1, $2, 'suggestion_claim')
         RETURNING id`,
          [user.id, bestContact.id]
        );
        const claimId = claimResult.rows[0].id;
        const result2 = await sendPush(
          user.push_token,
          template.title(bestContact.name),
          template.body(bestContact.name),
          { contactId: bestContact.id }
        );
        if (result2 === "expired") {
          await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
          await clearExpiredPushToken(user.id, user.push_token);
          console.log(`[push]   \u2192 token expired; cleared from DB`);
        } else if (result2) {
          await pool.query(
            `UPDATE notification_log
           SET notif_type = 'suggestion_push', sent_at = NOW()
           WHERE id = $1`,
            [claimId]
          );
          sent++;
          console.log(`[push]   \u2192 delivered OK`);
        } else {
          await pool.query(`DELETE FROM notification_log WHERE id = $1`, [claimId]);
          console.log(`[push]   \u2192 delivery failed (Expo push service error)`);
        }
      } finally {
        if (userLockAcquired) {
          await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`bridges:suggestion:${user.id}`]).catch((err) => console.warn("[push] Failed to release suggestion advisory lock:", err));
        }
        lockClient.release();
      }
    }
    console.log(`[push] Suggestion nudge run complete: ${sent} sent`);
  } catch (err) {
    console.error("[push] Error sending suggestion nudges:", err);
  }
}
var schedulerRunning = false;
function scheduleDailyNotifications() {
  const MS_PER_15MIN = 15 * 60 * 1e3;
  async function runTick() {
    if (schedulerRunning) {
      console.log("[push] Scheduler tick skipped \u2014 previous run still in progress");
      return;
    }
    schedulerRunning = true;
    try {
      await Promise.all([
        sendDailyReminders().catch((err) => console.error("[push] Reminder dispatch failed:", err)),
        sendSuggestionNudges().catch((err) => console.error("[push] Suggestion dispatch failed:", err)),
        sendProfileCompletionPushes().catch((err) => console.error("[push] Profile dispatch failed:", err))
      ]);
    } finally {
      schedulerRunning = false;
    }
  }
  setTimeout(() => {
    runTick().catch((err) => console.error("[push] Startup catch-up error:", err));
  }, 15e3);
  setTimeout(() => {
    runTick();
    setInterval(runTick, MS_PER_15MIN);
  }, millisecondsUntilNextQuarterHour());
  console.log("[push] Notification scheduler started (delivers at 9am/5pm per user timezone)");
}
function millisecondsUntilNextQuarterHour(now = Date.now()) {
  const MS_PER_15MIN = 15 * 60 * 1e3;
  const remainder = now % MS_PER_15MIN;
  return remainder === 0 ? 0 : MS_PER_15MIN - remainder;
}

// server/email.ts
import { Resend } from "resend";
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
var resendClient = null;
function getResend() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}
async function sendPasswordResetEmail(to, resetUrl) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: "Bridges <onboarding@resend.dev>",
    to,
    subject: "Reset your Bridges password",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#0B0718;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#F0ECF8">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0B0718;padding:40px 20px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="background:#130F24;border-radius:16px;border:1px solid #2A2148;overflow:hidden;max-width:480px;width:100%">
        <tr>
          <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #2A2148">
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M20 70 Q50 20 80 70" stroke="#9B7DFF" stroke-width="6" fill="none"/><path d="M30 70 Q50 30 70 70" stroke="#B9A4FF" stroke-width="4" fill="none"/></svg>
            <span style="font-size:20px;font-weight:700;color:#9B7DFF;vertical-align:middle">Bridges</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 24px">
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#F0ECF8">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#9B93B8">
              We received a request to reset your Bridges password. Click the button below to choose a new one.
              This link expires in <strong style="color:#F0ECF8">15 minutes</strong>.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom:24px">
                  <a href="${resetUrl}" style="display:inline-block;background:#9B7DFF;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.2px">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#5E5580">
              If you did not request a password reset, you can safely ignore this email. Your password will not change.
            </p>
            <p style="margin:0;font-size:12px;color:#3A2A58;word-break:break-all">
              Or copy this link: ${resetUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2A2148;text-align:center">
            <p style="margin:0;font-size:12px;color:#3A2A58">
              Bridges &mdash; Stay close to the people who matter most
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
  });
  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}
async function sendHangoutCalendarInvite(to, contactName, hangoutTitle, timeLabel, locationLabel, icsContent) {
  const resend = getResend();
  const cleanContactName = contactName.replace(/[\r\n]/g, " ");
  const cleanHangoutTitle = hangoutTitle.replace(/[\r\n]/g, " ");
  const cleanTimeLabel = timeLabel.replace(/[\r\n]/g, " ");
  const cleanLocationLabel = locationLabel ? locationLabel.replace(/[\r\n]/g, " ") : null;
  const safeContactName = escapeHtml(cleanContactName);
  const safeHangoutTitle = escapeHtml(cleanHangoutTitle);
  const safeTimeLabel = escapeHtml(cleanTimeLabel);
  const safeLocationLabel = cleanLocationLabel ? escapeHtml(cleanLocationLabel) : null;
  const locationRow = safeLocationLabel ? `<tr><td style="padding:4px 0;font-size:13px;color:#9B93B8">Where</td><td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#F0ECF8">${safeLocationLabel}</td></tr>` : "";
  const { error } = await resend.emails.send({
    from: "Bridges <onboarding@resend.dev>",
    to,
    subject: `You're invited: ${cleanHangoutTitle}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're invited</title>
</head>
<body style="margin:0;padding:0;background:#0B0718;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#F0ECF8">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0B0718;padding:40px 20px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="background:#130F24;border-radius:16px;border:1px solid #2A2148;overflow:hidden;max-width:480px;width:100%">
        <tr>
          <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #2A2148">
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M20 70 Q50 20 80 70" stroke="#9B7DFF" stroke-width="6" fill="none"/><path d="M30 70 Q50 30 70 70" stroke="#B9A4FF" stroke-width="4" fill="none"/></svg>
            <span style="font-size:20px;font-weight:700;color:#9B7DFF;vertical-align:middle">Bridges</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px">
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#F0ECF8">You're invited!</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#9B93B8">
              Hi ${safeContactName}, you've been invited to:
            </p>
            <div style="background:#1E1640;border-radius:12px;border:1px solid #2A2148;padding:20px 20px 16px;margin-bottom:24px">
              <p style="margin:0 0 14px;font-size:20px;font-weight:800;color:#F0ECF8">${safeHangoutTitle}</p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#9B93B8">When</td>
                  <td style="padding:4px 0 4px 16px;font-size:14px;font-weight:600;color:#F0ECF8">${safeTimeLabel}</td>
                </tr>
                ${locationRow}
              </table>
            </div>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#9B93B8">
              The calendar invite is attached to this email. Open the attachment to add it to your calendar.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #2A2148;text-align:center">
            <p style="margin:0;font-size:12px;color:#3A2A58">
              Bridges &mdash; Stay close to the people who matter most
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
    attachments: [
      {
        filename: "invite.ics",
        content: Buffer.from(icsContent).toString("base64")
      }
    ]
  });
  if (error) {
    throw new Error(`Failed to send calendar invite email: ${error.message}`);
  }
}

// shared/checkin-policy.ts
function randomInclusive(min, max, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min;
}
function emptyContactPromptDueAt(circleLevel, now = /* @__PURE__ */ new Date(), random = Math.random) {
  const result = new Date(now);
  const days = circleLevel === 3 ? randomInclusive(14, 30, random) : 7;
  result.setDate(result.getDate() + days);
  return result;
}
function normalizeLastContacted(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function promptDueAfterContactUpdate(params) {
  if (params.nextLastContacted) return null;
  if (params.previousLastContacted || params.previousCircleLevel !== params.nextCircleLevel) {
    return emptyContactPromptDueAt(
      params.nextCircleLevel,
      params.now,
      params.random
    );
  }
  return params.previousDueAt;
}

// server/routes.ts
import * as chrono from "chrono-node";
import { createRemoteJWKSet, jwtVerify } from "jose";
var APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
  { cacheMaxAge: 10 * 60 * 1e3 }
);
var APPLE_BUNDLE_ID = "app.replit.bridges";
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}
function bad(res, message) {
  return res.status(400).json({ message });
}
var VALID_CIRCLE_LEVELS = [1, 2, 3];
var VALID_HANGOUT_STATUSES = ["draft", "active", "finalized"];
var MAX_PHOTO_CHARS = 7 * 1024 * 1024;
var lastManualSyncAt = 0;
var MANUAL_SYNC_COOLDOWN_MS = 60 * 60 * 1e3;
var MAX_EMAIL_INVITE_BATCHES_PER_USER_PER_DAY = 3;
var EMAIL_INVITE_COOLDOWN_HOURS = 24;
var MAX_EMAIL_INVITES_PER_HANGOUT = 20;
var MIN_ACCOUNT_AGE_FOR_INVITES_MS = 48 * 60 * 60 * 1e3;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var CONTACT_WRITABLE_FIELDS = /* @__PURE__ */ new Set([
  "name",
  "circleLevel",
  "interests",
  "labels",
  "birthday",
  "lastContacted",
  "lastHangout",
  "notes",
  "phone",
  "email",
  "photoUri",
  "customReminders"
]);
function pickContactFields(body) {
  const result = {};
  for (const [k, v] of Object.entries(body)) {
    if (CONTACT_WRITABLE_FIELDS.has(k)) {
      result[k] = v;
    }
  }
  return result;
}
function generateShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
function generateVoterTokens(inviteeNames) {
  const tokens = {};
  for (const name of inviteeNames) {
    const key = name.toLowerCase().trim();
    if (!key || tokens[key]) continue;
    tokens[key] = crypto.randomBytes(24).toString("hex");
  }
  return tokens;
}
async function ensureVoterTokens(plan) {
  const inviteeNames = plan.inviteeNames || [];
  const existing = plan.voterTokens || {};
  const merged = { ...existing };
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
function computeBordaScores(options, votes) {
  const groupSizeByType = /* @__PURE__ */ new Map();
  for (const opt of options) {
    groupSizeByType.set(opt.questionType, (groupSizeByType.get(opt.questionType) ?? 0) + 1);
  }
  return options.map((opt) => {
    const optVotes = votes.filter((v) => v.optionId === opt.id);
    const maxRank = groupSizeByType.get(opt.questionType) ?? 1;
    const bordaScore = optVotes.reduce((sum, v) => {
      const r = v.rank;
      if (!r || r <= 0 || r > maxRank) return sum;
      return sum + (maxRank + 1 - r);
    }, 0);
    const voteCount = optVotes.filter((v) => v.rank && v.rank > 0 && v.rank <= maxRank).length;
    return { ...opt, bordaScore, voteCount, votes: optVotes };
  });
}
function validateBallot(votes, planOptions) {
  const optionById = new Map(planOptions.map((o) => [o.id, o]));
  const seenOptionIds = /* @__PURE__ */ new Set();
  for (const v of votes) {
    if (seenOptionIds.has(v.optionId)) {
      return "Duplicate vote submitted for the same option";
    }
    seenOptionIds.add(v.optionId);
  }
  if (seenOptionIds.size !== planOptions.length) {
    return "Ballot must include exactly one vote for every survey option";
  }
  const rankedByType = /* @__PURE__ */ new Map();
  for (const v of votes) {
    const opt = optionById.get(v.optionId);
    if (!opt) continue;
    const r = v.rank;
    if (r === null || r === void 0 || r <= 0) continue;
    const arr = rankedByType.get(opt.questionType) ?? [];
    arr.push(r);
    rankedByType.set(opt.questionType, arr);
  }
  const groupSizeByType = /* @__PURE__ */ new Map();
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
    const sorted = [...ranks].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        return "Ranks must be contiguous starting from 1";
      }
    }
  }
  return null;
}
function computeBestRecommendation(optionsWithScores, votes, includePlusOne) {
  const byType = (type) => optionsWithScores.filter((o) => o.questionType === type);
  const best = (arr) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => b.bordaScore - a.bordaScore);
    return sorted[0].bordaScore > 0 ? { label: sorted[0].label, score: sorted[0].bordaScore } : null;
  };
  const totalVoters = new Set(votes.map((v) => v.voterName)).size;
  let plusOneTotal;
  if (includePlusOne) {
    const seenVoters = /* @__PURE__ */ new Map();
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
    plusOneTotal
  };
}
function formatLocalDateTime(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function sanitizeIcsValue(value) {
  const stripped = value.replace(/[\r\n]/g, " ");
  return stripped.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
function generateIcs(title, timeLabel, locationLabel) {
  const now = /* @__PURE__ */ new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `bridges-${Date.now()}@bridges.app`;
  let dtStart = "";
  let dtEnd = "";
  try {
    const parsed = chrono.parseDate(timeLabel, /* @__PURE__ */ new Date(), { forwardDate: true });
    if (parsed && !isNaN(parsed.getTime())) {
      dtStart = formatLocalDateTime(parsed);
      const end = new Date(parsed.getTime() + 2 * 60 * 60 * 1e3);
      dtEnd = formatLocalDateTime(end);
    }
  } catch (_) {
  }
  if (!dtStart) {
    const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3);
    dtStart = formatLocalDateTime(future);
    const end = new Date(future.getTime() + 2 * 60 * 60 * 1e3);
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
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
}
var authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" },
  skipSuccessfulRequests: false
});
var registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts, please try again later" }
});
var voteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many voting attempts, please try again later" }
});
var emailInviteRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1e3,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many email invite requests from this network. Please try again tomorrow." }
});
async function registerRoutes(app2) {
  app2.set("trust proxy", 1);
  app2.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true });
  });
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable must be set in production. The server will not start without an operator-supplied session secret."
    );
  }
  const PgSession = connectPgSimple(session);
  app2.use(
    session({
      store: new PgSession({
        pool,
        createTableIfMissing: true
      }),
      secret: sessionSecret || "bridges-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1e3,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
      }
    })
  );
  const DISPOSABLE_DOMAINS = /* @__PURE__ */ new Set([
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamail.biz",
    "guerrillamail.de",
    "guerrillamail.info",
    "guerrillamailblock.com",
    "10minutemail.com",
    "10minutemail.net",
    "10minutemail.org",
    "10minutemail.co.uk",
    "tempmail.com",
    "temp-mail.org",
    "temp-mail.io",
    "tmpmail.net",
    "tmpmail.org",
    "throwam.com",
    "throwaway.email",
    "dispostable.com",
    "mailnull.com",
    "spamgourmet.com",
    "spamgourmet.net",
    "spamgourmet.org",
    "trashmail.com",
    "trashmail.at",
    "trashmail.io",
    "trashmail.me",
    "trashmail.net",
    "trashmail.org",
    "trashmail.xyz",
    "trashmail.de",
    "yopmail.com",
    "yopmail.fr",
    "cool.fr.nf",
    "jetable.fr.nf",
    "nospam.ze.tc",
    "nomail.xl.cx",
    "mega.zik.dj",
    "speed.1s.fr",
    "courriel.fr.nf",
    "moncourrier.fr.nf",
    "monemail.fr.nf",
    "monmail.fr.nf",
    "sharklasers.com",
    "guerrillamailblock.com",
    "grr.la",
    "guerrillamail.info",
    "spam4.me",
    "fakeinbox.com",
    "mailnesia.com",
    "mailnull.com",
    "maildrop.cc",
    "discard.email",
    "spamspot.com",
    "spamevader.com",
    "inboxbear.com",
    "throwam.com",
    "throwam.net",
    "mytrashmail.com",
    "throwam.org",
    "mailsiphon.com",
    "owlpic.com",
    "spamhereplease.com",
    "spamhereplease.net",
    "getnada.com",
    "crazymailing.com",
    "mohmal.com",
    "getairmail.com",
    "filzmail.com",
    "dispostable.com",
    "mt2015.com",
    "mt2014.com",
    "anonmails.de",
    "antichef.com",
    "antichef.net",
    "antispam.de",
    "binkmail.com",
    "bobmail.info",
    "casualdx.com",
    "cubiclink.com",
    "dacoolest.com",
    "dandikmail.com",
    "discard.email",
    "disposableaddress.com",
    "disposableemailaddresses.com",
    "dogit.com",
    "dumpmail.de",
    "e4ward.com",
    "emaildrop.io",
    "emailias.com",
    "emailsensei.com",
    "emailtemporanea.com",
    "emailto.de",
    "emailwarden.com",
    "fakemailgenerator.com",
    "fakemail.net",
    "filzmail.com",
    "fizmail.com",
    "forgetmail.com",
    "fux0ringduh.com",
    "getonemail.com",
    "girlsundertheinfluence.com",
    "hatespam.org",
    "highbros.org",
    "ieatspam.eu",
    "ieatspam.info",
    "imails.info",
    "inoutmail.de",
    "inoutmail.eu",
    "inoutmail.info",
    "inoutmail.net",
    "internet-e-mail.de",
    "internet-mail.de",
    "internetemails.net",
    "jnxjn.com",
    "jourrapide.com",
    "kasmail.com",
    "klassmaster.com",
    "klzlk.com",
    "kurzepost.de",
    "letthemeatspam.com",
    "lhsdv.com",
    "libox.fr",
    "mailbidon.com",
    "mailblade.net",
    "mailblocks.com",
    "mailbucket.org",
    "mailcat.biz",
    "mailcatch.com",
    "mailchop.com",
    "mailde.net",
    "maildrop.cc",
    "mailexpire.com",
    "mailfall.com",
    "mailfreeonline.com",
    "mailguard.me",
    "mailin8r.com",
    "mailinater.com",
    "mailme.lv",
    "mailme24.com",
    "mailmetrash.com",
    "mailmoat.com",
    "mailnew.com",
    "mailnull.com",
    "mailorg.org",
    "mailpick.biz",
    "mailquack.com",
    "mailseal.de",
    "mailshell.com",
    "mailsiphon.com",
    "mailslite.com",
    "mailsucker.net",
    "mailtemp.info",
    "mailtome.de",
    "mailtome.net",
    "mailtothis.com",
    "mailzilla.com",
    "mailzilla.org",
    "mbx.cc",
    "mega.zik.dj",
    "meinspamschutz.de",
    "memoware.com",
    "messagebeamer.de",
    "ministry-of-silly-walks.de",
    "mintemail.com",
    "misterpinball.de",
    "mm.st",
    "moncourrier.fr.nf",
    "monemail.fr.nf",
    "monmail.fr.nf",
    "msa.minsmail.com",
    "mx0.wwwnew.eu",
    "my10minutemail.com",
    "mypartyclip.de",
    "myphantomemail.com",
    "mysamp.de",
    "myspaceinc.com",
    "myspaceinc.net",
    "myspaceinc.org",
    "myspacepimpage.com",
    "mytempemail.com",
    "mytrashmail.com",
    "neomailbox.com",
    "netmails.com",
    "netmails.net",
    "netzidiot.de",
    "neverbox.com",
    "no-spam.ws",
    "noblepioneer.com",
    "noclickemail.com",
    "nogmailspam.info",
    "noisemails.com",
    "nomail.pw",
    "nomail2me.com",
    "nomorespam.iv.pl",
    "nonspam.eu",
    "nonspammer.de",
    "noref.in",
    "nospam.ze.tc",
    "nospam4.us",
    "nospamfor.us",
    "nospammail.net",
    "nospamthanks.info",
    "notmailinator.com",
    "nowmymail.com",
    "nurfuerspam.de",
    "nus.edu.sg",
    "objectmail.com",
    "odaymail.com",
    "oi.com.br",
    "onewaymail.com",
    "online.ms",
    "oopi.org",
    "opentrash.com",
    "ordinaryamerican.net",
    "owlpic.com",
    "pecinan.com",
    "pecinan.net",
    "pecinan.org",
    "pepbot.com",
    "perzo.com",
    "pimpedupmyspace.com",
    "plexolan.de",
    "pookmail.com",
    "proxymail.eu",
    "prtnx.com",
    "prtz.eu",
    "pubmail.io",
    "punkass.com",
    "putthisinyourspamdatabase.com",
    "qq.com",
    "quickinbox.com",
    "rcpt.at",
    "recode.me",
    "recursor.net",
    "rklips.com",
    "rmqkr.net",
    "rppkn.com",
    "rtrtr.com",
    "s0ny.net",
    "safe-mail.net",
    "safetymail.info",
    "safetypost.de",
    "samsclass.info",
    "sandelf.de",
    "schafmail.de",
    "schrott-mail.de",
    "secretemail.de",
    "secure-mail.biz",
    "skeefmail.com",
    "sl.pt",
    "slopsbox.com",
    "smellfear.com",
    "snkmail.com",
    "sofortmail.de",
    "sofort-mail.de",
    "soGetItNow.com",
    "spam.la",
    "spam.mn",
    "spam.su",
    "spamavert.com",
    "spambob.com",
    "spambob.net",
    "spambob.org",
    "spambox.info",
    "spambox.irishspringrealty.com",
    "spambox.us",
    "spamcon.org",
    "spamcorptastic.com",
    "spamcowboy.com",
    "spamcowboy.net",
    "spamcowboy.org",
    "spamday.com",
    "spamex.com",
    "spamfree.eu",
    "spamfree24.de",
    "spamfree24.eu",
    "spamfree24.info",
    "spamfree24.net",
    "spamfree24.org",
    "spamgoes.in",
    "spamgourmet.com",
    "spamgourmet.net",
    "spamgourmet.org",
    "spamgrave.com",
    "spamhereplease.com",
    "spamhole.com",
    "spamify.com",
    "spaminator.de",
    "spamkill.info",
    "spaml.com",
    "spaml.de",
    "spammotel.com",
    "spamoff.de",
    "spamslicer.com",
    "spamspot.com",
    "spamstack.net",
    "spamthis.co.uk",
    "spamthisplease.com",
    "spamtrail.com",
    "super-auswahl.de",
    "supermailer.jp",
    "suremail.info",
    "teewars.org",
    "tefl.ro",
    "tempalias.com",
    "tempe-mail.com",
    "tempemail.biz",
    "tempemail.com",
    "tempemail.net",
    "tempemail.org",
    "tempinbox.co.uk",
    "tempinbox.com",
    "tempomail.fr",
    "temporamail.com",
    "temporaryemail.net",
    "temporaryemail.us",
    "temporaryforwarding.com",
    "temporaryinbox.com",
    "temporarymail.org",
    "tempsky.com",
    "tempthe.net",
    "tempymail.com",
    "thanksnospam.info",
    "thisisnotmyrealemail.com",
    "thinktankmovement.com",
    "throwam.com",
    "throwam.net",
    "tilien.com",
    "tmailinator.com",
    "tokem.co",
    "toomail.biz",
    "tradermail.info",
    "trash-amil.com",
    "trash-mail.at",
    "trash-mail.cf",
    "trash-mail.ga",
    "trash-mail.gq",
    "trash-mail.ml",
    "trash-mail.tk",
    "trash2009.com",
    "trash2010.com",
    "trash2011.com",
    "trashdevil.com",
    "trashdevil.de",
    "trashemail.de",
    "trashimail.de",
    "trashmail.app",
    "trashmail.at",
    "trashmail.com",
    "trashmail.io",
    "trashmail.me",
    "trashmail.net",
    "trashmail.org",
    "trashmail.xyz",
    "trashmailer.com",
    "trashymail.com",
    "trbvm.com",
    "turual.com",
    "twinmail.de",
    "tyldd.com",
    "uggsrock.com",
    "uk2.net",
    "umail.net",
    "upliftnow.com",
    "uploadnolimit.com",
    "uroid.com",
    "us.af",
    "venompen.com",
    "veryrealemail.com",
    "viditag.com",
    "viewcastmedia.com",
    "viewcastmedia.net",
    "viewcastmedia.org",
    "vomoto.com",
    "vpn.st",
    "vsimcard.com",
    "vubby.com",
    "wasteland.rfc822.org",
    "webemail.me",
    "webm4il.info",
    "weg-werf-email.de",
    "wegwerf-emails.de",
    "wegwerfadresse.de",
    "wegwerfemail.com",
    "wegwerfemail.de",
    "wegwerfmail.de",
    "wegwerfmail.info",
    "wegwerfmail.net",
    "wegwerfmail.org",
    "wh4f.org",
    "whyspam.me",
    "willhackforfood.biz",
    "willselfdestruct.com",
    "wilemail.com",
    "winemaven.info",
    "wronghead.com",
    "www.e4ward.com",
    "www.mailinator.com",
    "xagloo.com",
    "xemaps.com",
    "xents.com",
    "xmaily.com",
    "xoxy.net",
    "xyzfree.net",
    "yapped.net",
    "yeah.net",
    "yogamaven.com",
    "yopmail.com",
    "yopmail.fr",
    "yourdomain.com",
    "ypmail.webarnak.fr.eu.org",
    "yuurok.com",
    "z1p.biz",
    "za.com",
    "zehnminuten.de",
    "zehnminutenmail.de",
    "zoemail.net",
    "zoemail.org",
    "zomg.info",
    "zxcv.com",
    "zxcvbnm.com"
  ]);
  app2.post("/api/auth/register", registerRateLimiter, async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const emailDomain = email.toLowerCase().trim().split("@")[1] ?? "";
      if (DISPOSABLE_DOMAINS.has(emailDomain)) {
        return res.status(400).json({ message: "Please use a real email address to create an account." });
      }
      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!existing) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await storage.createUser({
          email: email.toLowerCase().trim(),
          password: hashedPassword
        });
        if (name) {
          await storage.updateUser(user.id, { username: name.trim() });
        }
      } else {
        await bcrypt.hash(password, 10);
      }
      res.status(201).json({ message: "Account created. Please sign in to continue." });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });
  app2.post("/api/auth/login", authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
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
  app2.post("/api/auth/apple", authRateLimiter, async (req, res) => {
    try {
      const { identityToken, fullName } = req.body;
      if (!identityToken || typeof identityToken !== "string") {
        return res.status(400).json({ message: "Identity token required" });
      }
      let payload;
      try {
        const { payload: verified } = await jwtVerify(identityToken, APPLE_JWKS, {
          issuer: "https://appleid.apple.com",
          audience: APPLE_BUNDLE_ID,
          clockTolerance: 30
        });
        payload = verified;
        console.log("[apple-auth] Token verified successfully");
      } catch (verifyErr) {
        const errCode = verifyErr.code ?? "unknown";
        const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error(`[apple-auth] Token verification failed (${errCode}):`, errMsg);
        const userMsg = errCode === "ERR_JWT_EXPIRED" ? "Apple sign-in token has expired. Please try again." : errCode === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" ? "Apple sign-in signature invalid. Please try again." : errCode === "ERR_JWT_CLAIM_VALIDATION_FAILED" ? "Apple sign-in token is not valid for this app." : "Apple sign-in failed. Please try again.";
        return res.status(401).json({ message: userMsg });
      }
      const { sub: appleSub, email: jwtEmail } = payload;
      if (!appleSub) {
        return res.status(400).json({ message: "Invalid Apple token: missing subject" });
      }
      const syntheticEmail = `apple_${appleSub.replace(/[^a-z0-9]/gi, "")}@bridges.apple`;
      let user = await storage.getUserByAppleSub(appleSub);
      if (!user) {
        user = await storage.getUserByEmail(syntheticEmail);
        if (user) {
          await storage.updateUser(user.id, { appleSub });
          const updated = await storage.getUser(user.id);
          if (updated) user = updated;
          console.log("[apple-auth] Bound appleSub to existing synthetic-email account:", user.id);
        }
      }
      if (!user) {
        console.log("[apple-auth] Creating new account for sub:", appleSub);
        const hashedPassword = await bcrypt.hash(
          Math.random().toString(36) + Date.now(),
          10
        );
        user = await storage.createUser({ email: syntheticEmail, password: hashedPassword });
        await storage.updateUser(user.id, { hasPassword: false, appleSub });
        if (fullName?.givenName) {
          const name = [fullName.givenName, fullName.familyName].filter(Boolean).join(" ").trim();
          if (name) await storage.updateUser(user.id, { username: name });
        }
        const updated = await storage.getUser(user.id);
        if (updated) user = updated;
        console.log("[apple-auth] Account created:", user.id);
      } else if (user.hasPassword !== false) {
        console.warn("[apple-auth] Email conflict \u2014 account has password set, refusing social login");
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
        res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
      });
    } catch (err) {
      console.error("[apple-auth] Unexpected error:", err);
      res.status(500).json({ message: "Apple sign in failed" });
    }
  });
  app2.post("/api/auth/google", authRateLimiter, async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken || typeof idToken !== "string") {
        return res.status(400).json({ message: "ID token required" });
      }
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      if (!tokenInfoRes.ok) {
        return res.status(401).json({ message: "Invalid Google token" });
      }
      const data = await tokenInfoRes.json();
      if (data.error) {
        return res.status(401).json({ message: "Invalid Google token" });
      }
      const allowedClientIds = [
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
      ].filter((id) => typeof id === "string" && id.length > 0);
      if (allowedClientIds.length === 0) {
        console.error("Google auth: no Google client IDs configured \u2014 cannot verify token audience");
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
      let user = await storage.getUserByGoogleSub(googleSub);
      if (!user) {
        const existingByEmail = await storage.getUserByEmail(emailNorm);
        if (existingByEmail) {
          if (existingByEmail.hasPassword !== false) {
            return res.status(409).json({ message: "An account with this email already exists. Please sign in with your email and password." });
          }
          console.warn("[google-auth] Legacy social account found for email but no googleSub bound \u2014 cannot safely authenticate:", existingByEmail.id);
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
        res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
      });
    } catch (err) {
      console.error("Google auth error:", err);
      res.status(500).json({ message: "Google sign in failed" });
    }
  });
  app2.post("/api/auth/logout", async (req, res) => {
    try {
      const userId = req.session.userId;
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
  app2.delete("/api/auth/account", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      await storage.deleteUser(userId);
      req.session.destroy(() => {
        res.json({ success: true });
      });
    } catch (err) {
      console.error("Delete account error:", err);
      res.status(500).json({ message: "Failed to delete account. Please try again." });
    }
  });
  app2.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ id: user.id, email: user.email, name: user.username, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
  });
  app2.get("/api/auth/photo", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ profilePhotoUri: user.profilePhotoUri ?? null });
  });
  app2.post("/api/auth/forgot-password", authRateLimiter, async (req, res) => {
    const UNIFORM_RESPONSE = { message: "If that email is registered, you'll receive a reset link shortly." };
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(200).json(UNIFORM_RESPONSE);
      }
      const normalizedEmail = email.toLowerCase().trim();
      const [user] = await Promise.all([
        storage.getUserByEmail(normalizedEmail),
        bcrypt.hash(normalizedEmail, 4)
      ]);
      res.status(200).json(UNIFORM_RESPONSE);
      if (user && user.hasPassword !== false) {
        (async () => {
          try {
            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
            const expiresAt = new Date(Date.now() + 15 * 60 * 1e3);
            await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);
            const baseUrl = process.env.APP_BASE_URL || (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN.replace(/:\d+$/, "")}` : null) || "https://buildmybridges.com";
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
  app2.post("/api/auth/reset-password", authRateLimiter, async (req, res) => {
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
      if (/* @__PURE__ */ new Date() > tokenRecord.expiresAt) {
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
  app2.put("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || typeof currentPassword !== "string") {
        return bad(res, "Current password is required");
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
        return bad(res, "New password must be at least 6 characters");
      }
      const user = await storage.getUser(req.session.userId);
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
      await new Promise((resolve3, reject) => {
        req.session.regenerate((err) => {
          if (err) return reject(err);
          req.session.userId = user.id;
          req.session.save((saveErr) => {
            if (saveErr) return reject(saveErr);
            resolve3();
          });
        });
      });
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
  app2.post("/api/notifications/local-log", requireAuth, async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId || typeof contactId !== "string") {
        return bad(res, "contactId is required");
      }
      await pool.query(
        `INSERT INTO notification_log (user_id, contact_id, notif_type) VALUES ($1, $2, $3)`,
        [req.session.userId, contactId.trim(), "elevation"]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Error logging local notification:", err);
      res.status(500).json({ message: "Failed to log notification" });
    }
  });
  app2.get("/api/suggestions/priority", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const timezoneResult = await pool.query(
        `SELECT notification_timezone FROM users WHERE id = $1`,
        [userId]
      );
      const timezone = timezoneResult.rows[0]?.notification_timezone ?? "UTC";
      const [cohort, dismissalResult, elevationResult] = await Promise.all([
        getPrioritySuggestionCohort(userId, timezone),
        pool.query(
          `SELECT nl.contact_id, c.circle_level, MAX(nl.sent_at) AS dismissed_at
           FROM notification_log nl
           INNER JOIN contacts c ON c.id = nl.contact_id AND c.user_id = nl.user_id
           WHERE nl.user_id = $1
             AND nl.notif_type = 'suggestion_dismissed'
             AND nl.sent_at > NOW() - INTERVAL '15 days'
           GROUP BY nl.contact_id, c.circle_level`,
          [userId]
        ),
        pool.query(
          `SELECT nl.contact_id, c.circle_level, MAX(nl.sent_at) AS elevated_at
           FROM notification_log nl
           INNER JOIN contacts c ON c.id = nl.contact_id AND c.user_id = nl.user_id
           WHERE nl.user_id = $1
             AND nl.notif_type = 'elevation'
             AND nl.sent_at > NOW() - INTERVAL '8 days'
           GROUP BY nl.contact_id, c.circle_level`,
          [userId]
        )
      ]);
      const now = Date.now();
      const dismissedContactIds = dismissalResult.rows.filter((row) => {
        const circle = row.circle_level;
        if (![1, 2, 3].includes(circle)) return false;
        const ageMs = now - new Date(row.dismissed_at).getTime();
        return ageMs < CIRCLE_COOLDOWN_DAYS[circle] * 864e5;
      }).map((row) => row.contact_id);
      const pendingElevationContactIds = elevationResult.rows.filter((row) => {
        const circle = row.circle_level;
        if (![1, 2, 3].includes(circle)) return false;
        return now - new Date(row.elevated_at).getTime() < ELEVATION_LIFETIME_HOURS[circle] * 36e5;
      }).map((row) => row.contact_id);
      const deferredElevationContactIds = elevationResult.rows.filter((row) => {
        const circle = row.circle_level;
        if (![1, 2, 3].includes(circle)) return false;
        const ageHours = (now - new Date(row.elevated_at).getTime()) / 36e5;
        return circle === 3 && elevationPhaseForAge(circle, ageHours) === "deferred";
      }).map((row) => row.contact_id);
      const dueElevationContactIds = elevationResult.rows.filter((row) => {
        const circle = row.circle_level;
        if (![1, 2, 3].includes(circle)) return false;
        const ageHours = (now - new Date(row.elevated_at).getTime()) / 36e5;
        return elevationPhaseForAge(circle, ageHours) === "due";
      }).map((row) => row.contact_id);
      res.json({
        contactIds: cohort.map((contact) => contact.id),
        dismissedContactIds,
        pendingElevationContactIds,
        deferredElevationContactIds,
        dueElevationContactIds,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      console.error("Error loading priority suggestions:", err);
      res.status(500).json({ message: "Failed to load priority suggestions" });
    }
  });
  app2.post("/api/suggestions/priority", requireAuth, async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!Array.isArray(contactIds) || contactIds.length < 1 || contactIds.length > 3 || !contactIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
        return bad(res, "contactIds must contain 1 to 3 contact IDs");
      }
      const normalizedIds = contactIds.map((id) => id.trim());
      if (new Set(normalizedIds).size !== normalizedIds.length) {
        return bad(res, "contactIds must be unique");
      }
      const userId = req.session.userId;
      const ownedContacts = await pool.query(
        `SELECT id FROM contacts WHERE user_id = $1 AND id = ANY($2::varchar[])`,
        [userId, normalizedIds]
      );
      if (ownedContacts.rows.length !== normalizedIds.length) {
        return res.status(403).json({ message: "One or more contacts do not belong to this user" });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`bridges:priority-snapshot:${userId}`]
        );
        await client.query(
          `DELETE FROM notification_log
           WHERE user_id = $1
             AND notif_type IN (
               'suggestion_priority_1',
               'suggestion_priority_2',
               'suggestion_priority_3'
             )`,
          [userId]
        );
        for (let index = 0; index < normalizedIds.length; index += 1) {
          await client.query(
            `INSERT INTO notification_log (user_id, contact_id, notif_type)
             VALUES ($1, $2, $3)`,
            [userId, normalizedIds[index], `suggestion_priority_${index + 1}`]
          );
        }
        await client.query("COMMIT");
        res.json({ ok: true });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error saving priority suggestion snapshot:", err);
      res.status(500).json({ message: "Failed to save priority suggestions" });
    }
  });
  app2.post("/api/suggestions/dismiss", requireAuth, async (req, res) => {
    try {
      const { contactId } = req.body;
      if (!contactId || typeof contactId !== "string") {
        return bad(res, "contactId is required");
      }
      await pool.query(
        `INSERT INTO notification_log (user_id, contact_id, notif_type) VALUES ($1, $2, 'suggestion_dismissed')`,
        [req.session.userId, contactId.trim()]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("Error logging suggestion dismiss:", err);
      res.status(500).json({ message: "Failed to log dismiss" });
    }
  });
  app2.put("/api/notifications/preferences", requireAuth, async (req, res) => {
    try {
      const { frequency, time } = req.body;
      const VALID_FREQUENCIES = ["daily", "3x_week", "weekly", "off"];
      const VALID_TIMES = ["morning", "afternoon"];
      if (!frequency || typeof frequency !== "string" || !VALID_FREQUENCIES.includes(frequency)) {
        return bad(res, "frequency must be one of: daily, 3x_week, weekly, off");
      }
      const update = {
        suggestionNotifFrequency: frequency
      };
      if (frequency !== "off") {
        update.suggestionNotifTime = time && VALID_TIMES.includes(time) ? time : "morning";
      } else {
        update.suggestionNotifTime = null;
      }
      const user = await storage.updateUser(req.session.userId, update);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
    } catch (err) {
      console.error("Error saving notification preferences:", err);
      res.status(500).json({ message: "Failed to save notification preferences" });
    }
  });
  app2.put("/api/notifications/token", requireAuth, async (req, res) => {
    try {
      const { token, timezone } = req.body;
      if (!token || typeof token !== "string" || !token.trim()) {
        return bad(res, "Push token is required");
      }
      const trimmedToken = token.trim();
      await storage.clearPushTokenFromOtherUsers(req.session.userId, trimmedToken);
      const update = {
        pushToken: trimmedToken
      };
      if (timezone && typeof timezone === "string") {
        const trimmedTz = timezone.trim();
        let validTimezones = [];
        try {
          validTimezones = Intl.supportedValuesOf("timeZone");
        } catch {
        }
        if (validTimezones.length > 0 && !validTimezones.includes(trimmedTz)) {
          return bad(res, `Unrecognised timezone: "${trimmedTz}". Please send an IANA timezone name such as "America/New_York".`);
        }
        update.notificationTimezone = trimmedTz;
      }
      await storage.updateUser(req.session.userId, update);
      res.json({ ok: true });
      const tz = update.notificationTimezone ?? (await storage.getUser(req.session.userId))?.notificationTimezone;
      if (tz) {
        Promise.all([
          sendRemindersForUser(req.session.userId, trimmedToken, tz),
          sendSuggestionNudges(req.session.userId)
        ]).catch((err) => console.error("[push] Catch-up delivery error after token re-register:", err));
      }
    } catch (err) {
      console.error("Error saving push token:", err);
      res.status(500).json({ message: "Failed to save push token" });
    }
  });
  app2.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { profilePhotoUri, name } = req.body;
      if (profilePhotoUri !== void 0 && typeof profilePhotoUri === "string" && profilePhotoUri.length > MAX_PHOTO_CHARS) {
        return bad(res, "Photo data exceeds maximum allowed size");
      }
      const updateData = {};
      if (profilePhotoUri !== void 0) updateData.profilePhotoUri = profilePhotoUri;
      if (name !== void 0) updateData.username = name;
      const user = await storage.updateUser(req.session.userId, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri, suggestionNotifFrequency: user.suggestionNotifFrequency, suggestionNotifTime: user.suggestionNotifTime, hasPassword: user.hasPassword !== false });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });
  app2.get("/api/contacts", requireAuth, async (req, res) => {
    try {
      const contacts2 = await storage.getContactsByUserId(req.session.userId);
      res.json(contacts2);
    } catch (err) {
      console.error("Error fetching contacts:", err);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });
  app2.put("/api/contacts/reorder", requireAuth, async (req, res) => {
    try {
      const { contactIds } = req.body;
      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return bad(res, "contactIds must be a non-empty array");
      }
      if (!contactIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
        return bad(res, "All contactIds must be non-empty strings");
      }
      const userContacts = await storage.getContactsByUserId(req.session.userId);
      const userContactIds = new Set(userContacts.map((c) => c.id));
      const invalid = contactIds.filter((id) => !userContactIds.has(id));
      if (invalid.length > 0) {
        return res.status(403).json({ message: "One or more contacts do not belong to this user" });
      }
      await storage.reorderContacts(req.session.userId, contactIds);
      res.status(204).end();
    } catch (err) {
      console.error("Error reordering contacts:", err);
      res.status(500).json({ message: "Failed to reorder contacts" });
    }
  });
  app2.get("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
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
  app2.post("/api/contacts", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const { name, circleLevel } = body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return bad(res, "Name is required");
      }
      const level = Number(circleLevel);
      if (!VALID_CIRCLE_LEVELS.includes(level)) {
        return bad(res, "circleLevel must be 1, 2, or 3");
      }
      const safe = pickContactFields(body);
      const normalizedLastContacted = normalizeLastContacted(safe.lastContacted);
      const avatarColor = typeof body.avatarColor === "string" && body.avatarColor ? body.avatarColor : "#9B7DFF";
      const contact = await storage.createContact({
        ...safe,
        name: name.trim(),
        circleLevel: level,
        userId: req.session.userId,
        avatarColor,
        // Unknown means unknown: do not invent contact history. The persisted,
        // server-authored due date keeps empty-contact prompts stable across
        // devices and offline client restarts.
        lastContacted: normalizedLastContacted,
        emptyLastContactPromptDueAt: normalizedLastContacted ? null : emptyContactPromptDueAt(level),
        lastHangout: (() => {
          if (safe.lastHangout) return safe.lastHangout;
          const now = /* @__PURE__ */ new Date();
          const daysBack = level === 1 ? Math.floor(Math.random() * 19) : level === 2 ? Math.floor(Math.random() * 51) : Math.floor(Math.random() * 81);
          now.setDate(now.getDate() - daysBack);
          return now.toISOString();
        })()
      });
      res.status(201).json(contact);
    } catch (err) {
      console.error("Error creating contact:", err);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });
  app2.put("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const body = req.body;
      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return bad(res, "Name is required");
      }
      if (body.photoUri !== void 0 && typeof body.photoUri === "string" && body.photoUri.length > MAX_PHOTO_CHARS) {
        return bad(res, "Photo data exceeds maximum allowed size");
      }
      const normalizedLevel = Number(body.circleLevel);
      if (!VALID_CIRCLE_LEVELS.includes(normalizedLevel)) {
        return bad(res, "circleLevel must be 1, 2, or 3");
      }
      const safe = pickContactFields(body);
      safe.name = body.name.trim();
      safe.circleLevel = normalizedLevel;
      if (Object.prototype.hasOwnProperty.call(body, "lastContacted")) {
        safe.lastContacted = normalizeLastContacted(safe.lastContacted);
      }
      const incomingLastContacted = Object.prototype.hasOwnProperty.call(body, "lastContacted") ? safe.lastContacted : existing.lastContacted;
      safe.emptyLastContactPromptDueAt = promptDueAfterContactUpdate({
        previousCircleLevel: existing.circleLevel,
        previousLastContacted: normalizeLastContacted(existing.lastContacted),
        previousDueAt: existing.emptyLastContactPromptDueAt,
        nextCircleLevel: normalizedLevel,
        nextLastContacted: normalizeLastContacted(incomingLastContacted)
      });
      const contact = await storage.updateContact(id, safe);
      res.json(contact);
    } catch (err) {
      console.error("Error updating contact:", err);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });
  app2.put("/api/contacts/:id/phone", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const body = req.body;
      const phone = body.phone;
      if (!phone || typeof phone !== "string" || !phone.trim()) {
        return bad(res, "Phone number is required");
      }
      const updates = { phone: phone.trim() };
      const incomingBirthday = typeof body.birthday === "string" ? body.birthday.trim() || null : null;
      if (incomingBirthday && !existing.birthday) {
        updates.birthday = incomingBirthday;
      }
      if (typeof body.photoUri === "string" && body.photoUri && !existing.photoUri) {
        if (body.photoUri.length <= MAX_PHOTO_CHARS) {
          updates.photoUri = body.photoUri;
        }
      }
      const contact = await storage.updateContact(id, updates);
      res.json(contact);
    } catch (err) {
      console.error("Error saving phone number:", err);
      res.status(500).json({ message: "Failed to save phone number" });
    }
  });
  app2.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
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
  app2.post("/api/contacts/:id/mark-contacted", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      let lastContacted = (/* @__PURE__ */ new Date()).toISOString();
      const { contactedAt, label } = req.body ?? {};
      if (contactedAt && typeof contactedAt === "string") {
        const parsed = new Date(contactedAt);
        if (!isNaN(parsed.getTime()) && parsed <= /* @__PURE__ */ new Date()) {
          lastContacted = parsed.toISOString();
        }
      }
      const updates = {
        lastContacted,
        emptyLastContactPromptDueAt: null
      };
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
  app2.post("/api/contacts/:id/mark-hangout", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getContact(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      let lastHangout = (/* @__PURE__ */ new Date()).toISOString();
      const { hangoutAt, label } = req.body ?? {};
      if (hangoutAt && typeof hangoutAt === "string") {
        const parsed = new Date(hangoutAt);
        if (!isNaN(parsed.getTime()) && parsed <= /* @__PURE__ */ new Date()) {
          lastHangout = parsed.toISOString();
        }
      }
      const updates = { lastHangout };
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
  app2.get("/api/hangouts", requireAuth, async (req, res) => {
    try {
      const plans = await storage.getHangoutPlansByUserId(req.session.userId);
      const plansWithOptions = await Promise.all(
        plans.map(async (plan) => {
          const options = await storage.getOptionsByPlanId(plan.id);
          const votes = await storage.getVotesByPlanId(plan.id);
          const scored = computeBordaScores(options, votes);
          return {
            ...plan,
            options: scored,
            bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne)
          };
        })
      );
      res.json(plansWithOptions);
    } catch (err) {
      console.error("Error fetching hangouts:", err);
      res.status(500).json({ message: "Failed to fetch hangouts" });
    }
  });
  app2.get("/api/hangouts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const plan = await storage.getHangoutPlan(id);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const votes = await storage.getVotesByPlanId(plan.id);
      const scored = computeBordaScores(options, votes);
      const voterTokens = await ensureVoterTokens(plan);
      const voterLinks = (plan.inviteeNames || []).map((name) => {
        const key = name.toLowerCase().trim();
        return { name, token: voterTokens[key] };
      });
      res.json({
        ...plan,
        options: scored,
        bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne),
        voterLinks
      });
    } catch (err) {
      console.error("Error fetching hangout:", err);
      res.status(500).json({ message: "Failed to fetch hangout" });
    }
  });
  app2.post("/api/hangouts", requireAuth, async (req, res) => {
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
        userId: req.session.userId,
        title,
        description: description || null,
        status: "active",
        shareCode,
        inviteeNames: inviteeNames || [],
        voterTokens: generateVoterTokens(inviteeNames || []),
        surveyMode: surveyMode || "standard",
        fixedActivity: fixedActivity || null,
        deadline: deadline || null,
        includePlusOne: includePlusOne || false
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
            questionType: opt.questionType || "option"
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
  app2.put("/api/hangouts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getHangoutPlan(id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const { title, description, status, finalizedOptionId, finalizedTimeOptionId, inviteeNames } = req.body;
      if (title !== void 0 && (typeof title !== "string" || !title.trim())) {
        return bad(res, "Title must be a non-empty string");
      }
      if (status !== void 0 && !VALID_HANGOUT_STATUSES.includes(status)) {
        return bad(res, `Status must be one of: ${VALID_HANGOUT_STATUSES.join(", ")}`);
      }
      if (inviteeNames !== void 0 && !Array.isArray(inviteeNames)) {
        return bad(res, "inviteeNames must be an array");
      }
      const updateData = {};
      if (title !== void 0) updateData.title = title.trim();
      if (description !== void 0) updateData.description = description;
      if (status !== void 0) updateData.status = status;
      if (finalizedOptionId !== void 0) updateData.finalizedOptionId = finalizedOptionId;
      if (finalizedTimeOptionId !== void 0) updateData.finalizedTimeOptionId = finalizedTimeOptionId;
      if (inviteeNames !== void 0) {
        updateData.inviteeNames = inviteeNames;
        const existingTokens = existing.voterTokens || {};
        const merged = {};
        for (const name of inviteeNames) {
          const key = name.toLowerCase().trim();
          if (!key) continue;
          merged[key] = existingTokens[key] || crypto.randomBytes(24).toString("hex");
        }
        updateData.voterTokens = merged;
      }
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
      const options = await storage.getOptionsByPlanId(plan.id);
      const votes = await storage.getVotesByPlanId(plan.id);
      const scored = computeBordaScores(options, votes);
      res.json({
        ...plan,
        options: scored,
        bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne)
      });
      if (updateData.status === "finalized" && existing.status !== "finalized") {
        sendHangoutFinalizedNotifications(id, req.session.userId).catch(
          (err) => console.error("[push] Hangout finalized notification error:", err)
        );
      }
    } catch (err) {
      console.error("Error updating hangout:", err);
      res.status(500).json({ message: "Failed to update hangout" });
    }
  });
  app2.delete("/api/hangouts/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
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
  app2.post("/api/hangouts/:id/options", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
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
        questionType: questionType || "option"
      });
      res.status(201).json({ ...option, bordaScore: 0, voteCount: 0, votes: [] });
    } catch (err) {
      console.error("Error adding option:", err);
      res.status(500).json({ message: "Failed to add option" });
    }
  });
  app2.get("/api/hangouts/:id/calendar", async (req, res) => {
    try {
      const { id } = req.params;
      const plan = await storage.getHangoutPlan(id);
      if (!plan || plan.status !== "finalized") {
        return res.status(404).json({ message: "No finalized hangout found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const calVotes = await storage.getVotesByPlanId(plan.id);
      const calBorda = (optId, total) => {
        const votes = calVotes.filter((v) => v.optionId === optId && v.rank && v.rank > 0);
        return votes.reduce((s, v) => s + Math.max(0, total - (v.rank || 0) + 1), 0);
      };
      const timeOptions = options.filter((o) => o.questionType === "time");
      const timeOption = options.find((o) => o.id === plan.finalizedTimeOptionId) || [...timeOptions].sort((a, b) => calBorda(b.id, timeOptions.length) - calBorda(a.id, timeOptions.length))[0];
      const locationOptionsForCal = options.filter((o) => o.questionType === "location");
      const locationOption = [...locationOptionsForCal].sort((a, b) => calBorda(b.id, locationOptionsForCal.length) - calBorda(a.id, locationOptionsForCal.length))[0] || null;
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
  app2.post("/api/hangouts/:id/email-invites", requireAuth, emailInviteRateLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const senderUser = await storage.getUser(userId);
      if (!senderUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (senderUser.createdAt) {
        const ageMs = Date.now() - new Date(senderUser.createdAt).getTime();
        if (ageMs < MIN_ACCOUNT_AGE_FOR_INVITES_MS) {
          const hoursRemaining = Math.ceil(
            (MIN_ACCOUNT_AGE_FOR_INVITES_MS - ageMs) / (1e3 * 60 * 60)
          );
          return res.status(403).json({
            message: `Email invites are available after your account is 48 hours old. Please try again in ${hoursRemaining} hour${hoursRemaining === 1 ? "" : "s"}.`
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
      const options = await storage.getOptionsByPlanId(plan.id);
      const calVotes = await storage.getVotesByPlanId(plan.id);
      const calBorda = (optId, total) => {
        const votes = calVotes.filter((v) => v.optionId === optId && v.rank && v.rank > 0);
        return votes.reduce((s, v) => s + Math.max(0, total - (v.rank || 0) + 1), 0);
      };
      const timeOptions = options.filter((o) => o.questionType === "time");
      const timeOption = options.find((o) => o.id === plan.finalizedTimeOptionId) || [...timeOptions].sort((a, b) => calBorda(b.id, timeOptions.length) - calBorda(a.id, timeOptions.length))[0];
      const locationOptionsForEmail = options.filter((o) => o.questionType === "location");
      const locationOption = [...locationOptionsForEmail].sort((a, b) => calBorda(b.id, locationOptionsForEmail.length) - calBorda(a.id, locationOptionsForEmail.length))[0] || null;
      const timeLabel = timeOption?.label || "TBD";
      const locationLabel = locationOption?.label || null;
      const icsContent = generateIcs(plan.title, timeLabel, locationLabel);
      const client = await pool.connect();
      let sent = [];
      let missing = [];
      let cappedInviteeNames = [];
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(17266, hashtext($1))",
          [userId]
        );
        const batchCountRow = await client.query(
          `SELECT COUNT(*) AS count
           FROM hangout_plans
           WHERE user_id = $1
             AND invites_sent_at > NOW() - INTERVAL '${EMAIL_INVITE_COOLDOWN_HOURS} hours'`,
          [userId]
        );
        const batchesToday = parseInt(batchCountRow.rows[0]?.count ?? "0", 10);
        if (batchesToday >= MAX_EMAIL_INVITE_BATCHES_PER_USER_PER_DAY) {
          await client.query("ROLLBACK");
          return res.status(429).json({
            message: "You have reached the daily limit for sending hangout invites. Please try again tomorrow."
          });
        }
        const stampResult = await client.query(
          `UPDATE hangout_plans
           SET invites_sent_at = NOW()
           WHERE id = $1
             AND user_id = $2
             AND (invites_sent_at IS NULL
                  OR invites_sent_at < NOW() - INTERVAL '${EMAIL_INVITE_COOLDOWN_HOURS} hours')
           RETURNING id`,
          [id, userId]
        );
        if (stampResult.rowCount === 0) {
          await client.query("ROLLBACK");
          const sentAtRow = await client.query(
            "SELECT invites_sent_at FROM hangout_plans WHERE id = $1",
            [id]
          );
          const sentAt = sentAtRow.rows[0]?.invites_sent_at;
          const cooldownMs = EMAIL_INVITE_COOLDOWN_HOURS * 60 * 60 * 1e3;
          const retryAfterSec = sentAt ? Math.ceil(Math.max(0, cooldownMs - (Date.now() - sentAt.getTime())) / 1e3) : cooldownMs / 1e3;
          res.setHeader("Retry-After", String(retryAfterSec));
          return res.status(429).json({
            message: "Invites for this hangout were already sent. Please wait 24 hours before resending.",
            retryAfterSeconds: retryAfterSec
          });
        }
        await client.query("COMMIT");
      } catch (lockErr) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw lockErr;
      } finally {
        client.release();
      }
      cappedInviteeNames = plan.inviteeNames.slice(0, MAX_EMAIL_INVITES_PER_HANGOUT);
      const contacts2 = await storage.getContactsByUserId(userId);
      const contactsByName = new Map(contacts2.map((c) => [c.name.toLowerCase().trim(), c]));
      const seenEmails = /* @__PURE__ */ new Set();
      for (const inviteeName of cappedInviteeNames) {
        const contact = contactsByName.get(inviteeName.toLowerCase().trim());
        const email = contact?.email?.toLowerCase().trim() ?? "";
        if (contact && EMAIL_RE.test(email) && !seenEmails.has(email)) {
          seenEmails.add(email);
          try {
            await sendHangoutCalendarInvite(
              contact.email,
              contact.name,
              plan.title,
              timeLabel,
              locationLabel,
              icsContent
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
  app2.get("/api/vote/:shareCode", async (req, res) => {
    try {
      const plan = await storage.getHangoutPlanByShareCode(req.params.shareCode);
      if (!plan) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const creator = await storage.getUser(plan.userId);
      const isFinalized = plan.status === "finalized";
      const isDeadlinePassed = !!plan.deadline && new Date(plan.deadline) < /* @__PURE__ */ new Date();
      const tallyVisible = isFinalized || isDeadlinePassed;
      let publicOptions;
      let bestRecommendation = null;
      if (tallyVisible) {
        const votes = await storage.getVotesByPlanId(plan.id);
        const scored = computeBordaScores(options, votes);
        publicOptions = scored.map((opt) => ({
          id: opt.id,
          label: opt.label,
          questionType: opt.questionType,
          dateTime: opt.dateTime,
          bordaScore: opt.bordaScore,
          voteCount: opt.voteCount
        }));
        bestRecommendation = computeBestRecommendation(
          scored,
          votes,
          plan.includePlusOne
        );
      } else {
        publicOptions = options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          questionType: opt.questionType,
          dateTime: opt.dateTime
        }));
      }
      const voterTokens = await ensureVoterTokens(plan);
      const rawToken = req.query.token;
      let resolvedVoterName = null;
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
        requiresToken: (plan.inviteeNames || []).length > 0
      });
    } catch (err) {
      console.error("Error fetching vote page:", err);
      res.status(500).json({ message: "Failed to fetch hangout" });
    }
  });
  app2.post("/api/vote/:shareCode", voteRateLimiter, async (req, res) => {
    try {
      const plan = await storage.getHangoutPlanByShareCode(req.params.shareCode);
      if (!plan) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      if (plan.status === "finalized") {
        return res.status(400).json({ message: "This hangout has already been finalized" });
      }
      const { votes } = req.body;
      const rawVoterName = req.body.voterName;
      const rawBringsGuests = req.body.bringsGuests;
      const rawPlusOneCount = req.body.plusOneCount;
      let bringsGuests = null;
      let plusOneCount = null;
      if (rawBringsGuests !== void 0 && rawBringsGuests !== null) {
        if (typeof rawBringsGuests !== "boolean") {
          return bad(res, "bringsGuests must be a boolean");
        }
        bringsGuests = rawBringsGuests;
      }
      if (rawPlusOneCount !== void 0 && rawPlusOneCount !== null) {
        if (typeof rawPlusOneCount !== "number" || !Number.isInteger(rawPlusOneCount) || rawPlusOneCount < 1 || rawPlusOneCount > 10) {
          return bad(res, "plusOneCount must be an integer between 1 and 10");
        }
        plusOneCount = rawPlusOneCount;
      }
      if (!rawVoterName || typeof rawVoterName !== "string" || !rawVoterName.trim()) {
        return bad(res, "Voter name is required");
      }
      const voterName = rawVoterName.trim();
      const rawVoterToken = req.body.voterToken;
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
        if (v.rank !== null && v.rank !== void 0 && (typeof v.rank !== "number" || !Number.isInteger(v.rank) || v.rank < 0)) {
          return bad(res, "Vote rank must be a non-negative integer or null");
        }
      }
      if (plan.deadline) {
        const deadlineDate = new Date(plan.deadline);
        if (!isNaN(deadlineDate.getTime()) && /* @__PURE__ */ new Date() > deadlineDate) {
          return res.status(400).json({ message: "Voting has closed for this survey" });
        }
      }
      const inviteeNames = plan.inviteeNames ?? [];
      const voterTokens = await ensureVoterTokens(plan);
      const requestedKey = voterName.toLowerCase().trim();
      const isKnownInviteeName = inviteeNames.some(
        (n) => n.toLowerCase().trim() === requestedKey
      );
      let canonicalVoterName;
      let isGuest = false;
      if (isKnownInviteeName) {
        const expectedToken = voterTokens[requestedKey];
        const providedToken = typeof rawVoterToken === "string" ? rawVoterToken : "";
        if (!expectedToken || !providedToken || providedToken !== expectedToken) {
          return res.status(403).json({
            message: "This name belongs to an invitee. Use your personalized voting link to vote as this person."
          });
        }
        canonicalVoterName = inviteeNames.find(
          (n) => n.toLowerCase().trim() === requestedKey
        );
      } else if (inviteeNames.length === 0) {
        canonicalVoterName = voterName;
      } else {
        canonicalVoterName = voterName;
        isGuest = true;
      }
      const planOptions = await storage.getOptionsByPlanId(plan.id);
      const validOptionIds = new Set(planOptions.map((o) => o.id));
      for (const v of votes) {
        if (!validOptionIds.has(v.optionId)) {
          return bad(res, "One or more submitted options do not belong to this survey");
        }
      }
      const ballotError = validateBallot(votes, planOptions);
      if (ballotError) {
        return bad(res, ballotError);
      }
      const GUEST_VOTER_BUFFER = 3;
      const newVotes = votes.map((v) => ({
        optionId: v.optionId,
        planId: plan.id,
        voterName: canonicalVoterName,
        rank: v.rank ?? null,
        bringsGuests: bringsGuests ?? null,
        plusOneCount: plusOneCount ?? null
      }));
      const result = await storage.replaceVotesForVoterCapped(
        plan.id,
        canonicalVoterName,
        newVotes,
        // Pass guest enforcement context so the storage layer can re-check the
        // count inside the locked transaction. Pass null for verified invitees
        // (they are not subject to the guest cap).
        isGuest || inviteeNames.length === 0 ? { isGuest, inviteeNames, guestCap: GUEST_VOTER_BUFFER } : null
      );
      if (result.capped) {
        return res.status(400).json({
          message: isGuest ? "This survey has reached its guest voting limit" : "This survey has reached its voting limit"
        });
      }
      res.status(201).json(result.votes);
    } catch (err) {
      console.error("Error casting votes:", err);
      res.status(500).json({ message: "Failed to cast votes" });
    }
  });
  app2.get("/api/prompts", requireAuth, async (_req, res) => {
    try {
      const prompts = getPrompts();
      res.json(prompts);
    } catch (err) {
      console.error("Error fetching prompts:", err);
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });
  app2.post("/api/prompts/sync", async (req, res) => {
    const adminSecret = process.env.ADMIN_SYNC_SECRET;
    if (!adminSecret) {
      return res.status(403).json({ message: "Manual prompt sync is not enabled" });
    }
    const provided = req.headers["x-admin-token"];
    if (!provided || provided !== adminSecret) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const now = Date.now();
    const elapsed = now - lastManualSyncAt;
    if (elapsed < MANUAL_SYNC_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((MANUAL_SYNC_COOLDOWN_MS - elapsed) / 1e3);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message: "Sync was triggered recently. Please wait before syncing again.",
        retryAfterSeconds: retryAfterSec
      });
    }
    lastManualSyncAt = now;
    try {
      const result = await syncFromSheet();
      res.json(result);
    } catch (err) {
      lastManualSyncAt = 0;
      console.error("Error syncing prompts:", err);
      res.status(500).json({ message: "Failed to sync prompts" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    app2.post("/api/dev/test-nudges", requireAuth, async (_req, res) => {
      console.log("[push] Manual test-nudges triggered by dev endpoint");
      await sendSuggestionNudges();
      res.json({ ok: true, message: "sendSuggestionNudges() fired \u2014 check server logs" });
    });
    app2.post("/api/dev/test-reminders", requireAuth, async (_req, res) => {
      console.log("[push] Manual test-reminders triggered by dev endpoint");
      await sendDailyReminders();
      res.json({ ok: true, message: "sendDailyReminders() fired \u2014 check server logs" });
    });
  }
  app2.post("/api/notifications/test-push", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user?.pushToken) {
        return res.status(400).json({ ok: false, error: "No push token registered for this account." });
      }
      const EXPO_PUSH_URL2 = "https://exp.host/--/api/v2/push/send";
      const payload = {
        to: user.pushToken,
        title: "Bridges test push",
        body: `Diagnostic push sent at ${(/* @__PURE__ */ new Date()).toISOString()}`,
        sound: "default",
        data: {}
      };
      const expoRes = await fetch(EXPO_PUSH_URL2, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const expoBody = await expoRes.text();
      let expoJson;
      try {
        expoJson = JSON.parse(expoBody);
      } catch {
        expoJson = expoBody;
      }
      console.log(`[push] test-push for user ${req.session.userId.slice(0, 8)}: HTTP ${expoRes.status} \u2192 ${expoBody}`);
      res.json({
        ok: expoRes.ok,
        token: user.pushToken,
        expoStatus: expoRes.status,
        expoResponse: expoJson
      });
    } catch (err) {
      console.error("[push] test-push error:", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs2 from "fs";
import * as path2 from "path";

// server/seed.ts
init_db();
init_schema();
import { eq as eq3 } from "drizzle-orm";
import bcrypt2 from "bcryptjs";
var AVATAR_COLORS = [
  "#FF6B8A",
  "#9B7DFF",
  "#4ECDC4",
  "#FFB84D",
  "#FF8A65",
  "#7C4DFF",
  "#26A69A",
  "#EF5350",
  "#AB47BC",
  "#42A5F5",
  "#66BB6A",
  "#FFA726"
];
var DAY = 24 * 60 * 60 * 1e3;
var SAMPLE_CONTACTS = [
  {
    name: "Maya Johnson",
    circleLevel: 1,
    interests: ["Fitness", "Cooking", "Travel"],
    labels: ["College Friend"],
    birthday: "03/15",
    lastContacted: new Date(Date.now() - 2 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 5 * DAY).toISOString(),
    notes: "Best friend since college. Loves Italian food.",
    avatarColor: AVATAR_COLORS[0]
  },
  {
    name: "Alex Chen",
    circleLevel: 1,
    interests: ["Tech", "Gaming", "Music"],
    labels: ["Work Friend", "Gym Buddy"],
    birthday: "07/22",
    lastContacted: new Date(Date.now() - 5 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 10 * DAY).toISOString(),
    notes: "Works at a startup. Great at board games.",
    avatarColor: AVATAR_COLORS[1]
  },
  {
    name: "Sarah Williams",
    circleLevel: 1,
    interests: ["Reading", "Yoga", "Art"],
    labels: ["Childhood Friend"],
    birthday: "11/08",
    lastContacted: new Date(Date.now() - 1 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 3 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[2]
  },
  {
    name: "Jordan Taylor",
    circleLevel: 2,
    interests: ["Sports", "Outdoors", "Photography"],
    labels: ["Gym Buddy"],
    birthday: "05/30",
    lastContacted: new Date(Date.now() - 14 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 14 * DAY).toISOString(),
    notes: "Met at a hiking group. Incredible photographer.",
    avatarColor: AVATAR_COLORS[3]
  },
  {
    name: "Priya Patel",
    circleLevel: 2,
    interests: ["Cooking", "Travel", "Podcasts"],
    labels: ["Work Friend"],
    birthday: "09/12",
    lastContacted: new Date(Date.now() - 21 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 28 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[4]
  },
  {
    name: "Marcus Thompson",
    circleLevel: 2,
    interests: ["Music", "Movies", "Gaming"],
    labels: ["Work Friend"],
    lastContacted: new Date(Date.now() - 35 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 56 * DAY).toISOString(),
    notes: "Former coworker. Amazing taste in music.",
    avatarColor: AVATAR_COLORS[5]
  },
  {
    name: "Emily Davis",
    circleLevel: 2,
    interests: ["Art", "Fashion", "Dancing"],
    labels: ["College Friend", "Creative Partner"],
    birthday: "02/28",
    lastContacted: new Date(Date.now() - 10 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 84 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[6]
  },
  {
    name: "Carlos Rivera",
    circleLevel: 3,
    interests: ["Sports", "Fitness", "Cooking"],
    labels: ["Gym Buddy"],
    lastContacted: new Date(Date.now() - 60 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 200 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[7]
  },
  {
    name: "Lisa Kim",
    circleLevel: 3,
    interests: ["Tech", "Reading", "Volunteering"],
    labels: ["Work Friend"],
    birthday: "12/01",
    lastContacted: new Date(Date.now() - 90 * DAY).toISOString(),
    notes: "Met at a conference. Very thoughtful person.",
    avatarColor: AVATAR_COLORS[8]
  },
  {
    name: "David Okafor",
    circleLevel: 3,
    interests: ["Outdoors", "Photography", "Travel"],
    labels: ["Travel Buddy"],
    lastContacted: new Date(Date.now() - 45 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 150 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[9]
  },
  {
    name: "Zoe Martinez",
    circleLevel: 3,
    interests: ["Music", "Art", "Writing"],
    labels: ["Creative Partner"],
    birthday: "08/19",
    lastContacted: new Date(Date.now() - 120 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[10]
  },
  {
    name: "Ryan Brooks",
    circleLevel: 3,
    interests: ["Gaming", "Movies", "Tech"],
    labels: ["Neighbor"],
    lastContacted: new Date(Date.now() - 75 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 90 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[11]
  }
];
var TEST1_CONTACTS = [
  { name: "Olivia Hart", circleLevel: 1, interests: ["Cooking", "Travel", "Yoga"], labels: ["Family Friend"], birthday: "01/14", notes: "Sister-in-law. Always brings amazing dishes." },
  { name: "Ethan Moore", circleLevel: 1, interests: ["Tech", "Gaming", "Fitness"], labels: ["Childhood Friend", "Gym Buddy"], birthday: "06/03", notes: "Best friend since high school." },
  { name: "Chloe Nguyen", circleLevel: 1, interests: ["Art", "Music", "Reading"], labels: ["College Friend", "Creative Partner"], birthday: "09/27", notes: "College roommate. Very creative." },
  { name: "Liam Foster", circleLevel: 1, interests: ["Sports", "Outdoors", "Photography"], labels: ["Gym Buddy"], birthday: "04/11", notes: "Workout buddy. Runs marathons." },
  { name: "Ava Sinclair", circleLevel: 1, interests: ["Podcasts", "Writing", "Travel"], labels: ["Family Friend"], birthday: "12/05", notes: "Partner's best friend. Great storyteller." },
  { name: "Noah Reeves", circleLevel: 2, interests: ["Music", "Movies", "Cooking"], labels: ["Neighbor"], birthday: "02/18" },
  { name: "Sophia Blake", circleLevel: 2, interests: ["Fitness", "Yoga", "Travel"], labels: ["Gym Buddy"], birthday: "08/09" },
  { name: "Mason Cruz", circleLevel: 2, interests: ["Tech", "Gaming", "Sports"], labels: ["Work Friend"], birthday: "05/22" },
  { name: "Isabella Park", circleLevel: 2, interests: ["Art", "Fashion", "Dancing"], labels: ["College Friend"], birthday: "10/30" },
  { name: "James Watts", circleLevel: 2, interests: ["Outdoors", "Photography", "Volunteering"], labels: ["Travel Buddy"], birthday: "03/07" },
  { name: "Emma Sullivan", circleLevel: 2, interests: ["Reading", "Podcasts", "Cooking"], labels: ["Work Friend"], birthday: "07/16" },
  { name: "Benjamin Cole", circleLevel: 2, interests: ["Sports", "Fitness", "Music"], labels: ["Gym Buddy"] },
  { name: "Mia Larson", circleLevel: 2, interests: ["Travel", "Art", "Writing"], labels: ["Creative Partner"], birthday: "11/21" },
  { name: "Lucas Ortiz", circleLevel: 2, interests: ["Movies", "Gaming", "Tech"], labels: ["Work Friend"] },
  { name: "Harper Quinn", circleLevel: 2, interests: ["Yoga", "Volunteering", "Outdoors"], labels: ["Mentor"], birthday: "01/29" },
  { name: "Aiden Murphy", circleLevel: 3, interests: ["Tech", "Gaming"], labels: ["Work Friend"] },
  { name: "Ella Fischer", circleLevel: 3, interests: ["Art", "Fashion"], labels: [] },
  { name: "Jack Romano", circleLevel: 3, interests: ["Sports", "Fitness"], labels: ["Gym Buddy"], birthday: "02/14" },
  { name: "Grace Keller", circleLevel: 3, interests: ["Reading", "Writing"], labels: ["Mentee"] },
  { name: "Henry Dawson", circleLevel: 3, interests: ["Music", "Movies"], labels: [] },
  { name: "Lily Chang", circleLevel: 3, interests: ["Cooking", "Travel"], labels: ["Neighbor"] },
  { name: "Owen Barrett", circleLevel: 3, interests: ["Outdoors", "Photography"], labels: ["Travel Buddy"] },
  { name: "Zara Mendez", circleLevel: 3, interests: ["Yoga", "Dancing"], labels: [], birthday: "06/19" },
  { name: "Caleb Hughes", circleLevel: 3, interests: ["Podcasts", "Tech"], labels: [] },
  { name: "Nora Jacobs", circleLevel: 3, interests: ["Volunteering", "Cooking"], labels: ["Neighbor"] },
  { name: "Dylan Price", circleLevel: 3, interests: ["Gaming", "Movies"], labels: [] },
  { name: "Aria Stone", circleLevel: 3, interests: ["Travel", "Photography"], labels: ["Travel Buddy"], birthday: "09/03" },
  { name: "Leo Chambers", circleLevel: 3, interests: ["Fitness", "Sports"], labels: ["Gym Buddy"] },
  { name: "Scarlett Webb", circleLevel: 3, interests: ["Fashion", "Art"], labels: [] },
  { name: "Isaac Ford", circleLevel: 3, interests: ["Music", "Writing"], labels: ["Creative Partner"] },
  { name: "Penelope Ross", circleLevel: 3, interests: ["Reading", "Yoga"], labels: [], birthday: "04/25" },
  { name: "Sebastian Lane", circleLevel: 3, interests: ["Tech", "Outdoors"], labels: [] },
  { name: "Violet Hayes", circleLevel: 3, interests: ["Dancing", "Music"], labels: [], birthday: "11/08" },
  { name: "Max Coleman", circleLevel: 3, interests: ["Sports", "Gaming"], labels: [] },
  { name: "Luna Perry", circleLevel: 3, interests: ["Cooking", "Podcasts"], labels: [] },
  { name: "Oscar Hunt", circleLevel: 3, interests: ["Movies", "Photography"], labels: [] },
  { name: "Ivy Marshall", circleLevel: 3, interests: ["Art", "Volunteering"], labels: ["Mentor"], birthday: "07/31" },
  { name: "Theo Palmer", circleLevel: 3, interests: ["Travel", "Fitness"], labels: [] },
  { name: "Stella Grant", circleLevel: 3, interests: ["Reading", "Fashion"], labels: [] },
  { name: "Felix Warren", circleLevel: 3, interests: ["Tech", "Music"], labels: ["Work Friend"] },
  { name: "Hazel Brooks", circleLevel: 3, interests: ["Yoga", "Writing"], labels: [], birthday: "03/12" },
  { name: "Miles Duncan", circleLevel: 3, interests: ["Sports", "Outdoors"], labels: [] },
  { name: "Ruby Saunders", circleLevel: 3, interests: ["Cooking", "Dancing"], labels: [] },
  { name: "Jasper Flynn", circleLevel: 3, interests: ["Gaming", "Podcasts"], labels: [] },
  { name: "Clara Bishop", circleLevel: 3, interests: ["Photography", "Travel"], labels: ["Travel Buddy"], birthday: "08/22" },
  { name: "Sienna Hale", circleLevel: 3, interests: ["Cooking", "Art"], labels: [] },
  { name: "Beckett Tran", circleLevel: 3, interests: ["Tech", "Fitness"], labels: ["Work Friend"], birthday: "05/17" },
  { name: "Wren Gallagher", circleLevel: 3, interests: ["Music", "Outdoors"], labels: [] },
  { name: "Piper Sandoval", circleLevel: 3, interests: ["Yoga", "Podcasts"], labels: [], birthday: "10/09" },
  { name: "Rowan Kemp", circleLevel: 3, interests: ["Sports", "Movies"], labels: [] }
];
var COMPLETE_CONTACTS = [
  { name: "Jamie Rivera", circleLevel: 1, interests: ["Hiking", "Coffee", "Travel"], labels: ["College Friend"], birthday: "04/12", lastContacted: new Date(Date.now() - 1 * DAY).toISOString(), lastHangout: new Date(Date.now() - 4 * DAY).toISOString(), notes: "Best friend. Always up for an adventure.", avatarColor: AVATAR_COLORS[0] },
  { name: "Taylor Kim", circleLevel: 1, interests: ["Music", "Cooking", "Yoga"], labels: ["Childhood Friend"], birthday: "08/25", lastContacted: new Date(Date.now() - 3 * DAY).toISOString(), lastHangout: new Date(Date.now() - 7 * DAY).toISOString(), notes: "Known each other since 5th grade.", avatarColor: AVATAR_COLORS[1] },
  { name: "Morgan Lee", circleLevel: 1, interests: ["Gaming", "Tech", "Movies"], labels: ["Work Friend"], birthday: "11/03", lastContacted: new Date(Date.now() - 2 * DAY).toISOString(), lastHangout: new Date(Date.now() - 6 * DAY).toISOString(), notes: "Great colleague and friend.", avatarColor: AVATAR_COLORS[2] },
  { name: "Casey Nguyen", circleLevel: 2, interests: ["Photography", "Art", "Travel"], labels: ["Gym Buddy"], birthday: "02/14", lastContacted: new Date(Date.now() - 8 * DAY).toISOString(), lastHangout: new Date(Date.now() - 14 * DAY).toISOString(), avatarColor: AVATAR_COLORS[3] },
  { name: "Drew Patel", circleLevel: 2, interests: ["Running", "Podcasts", "Reading"], labels: ["Neighbor"], birthday: "06/30", lastContacted: new Date(Date.now() - 12 * DAY).toISOString(), lastHangout: new Date(Date.now() - 20 * DAY).toISOString(), avatarColor: AVATAR_COLORS[4] },
  { name: "Sam Brooks", circleLevel: 3, interests: ["Sports", "Movies"], labels: [], birthday: "09/15", lastContacted: new Date(Date.now() - 25 * DAY).toISOString(), lastHangout: new Date(Date.now() - 60 * DAY).toISOString(), avatarColor: AVATAR_COLORS[5] }
];
var HALF_CONTACTS = [
  { name: "Alex Foster", circleLevel: 1, interests: ["Fitness", "Cooking", "Music"], labels: ["College Friend"], birthday: "07/19", lastContacted: new Date(Date.now() - 4 * DAY).toISOString(), lastHangout: new Date(Date.now() - 10 * DAY).toISOString(), notes: "Great study partner from college.", avatarColor: AVATAR_COLORS[6] },
  { name: "Robin Chen", circleLevel: 1, interests: ["Art", "Travel", "Reading"], labels: ["Work Friend"], lastContacted: new Date(Date.now() - 6 * DAY).toISOString(), lastHangout: new Date(Date.now() - 15 * DAY).toISOString(), notes: "Creative soul. No birthday on file yet.", avatarColor: AVATAR_COLORS[7] },
  { name: "Jordan Walsh", circleLevel: 2, interests: ["Outdoors", "Gaming", "Sports"], labels: ["Gym Buddy"], birthday: "03/08", lastContacted: new Date(Date.now() - 20 * DAY).toISOString(), lastHangout: new Date(Date.now() - 30 * DAY).toISOString(), avatarColor: AVATAR_COLORS[8] }
];
function makeShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
async function seedDatabase() {
  try {
    const existingUsers = await db.select().from(users);
    const demoExists = existingUsers.some((u) => u.email === "demo@bridges.app");
    if (!demoExists) {
      console.log("Seeding database with demo user and sample contacts...");
      const hashedPassword = await bcrypt2.hash("demo123", 10);
      const [demoUser] = await db.insert(users).values({
        email: "demo@bridges.app",
        password: hashedPassword,
        username: "Demo User"
      }).returning();
      for (const contact of SAMPLE_CONTACTS) {
        await db.insert(contacts).values({
          ...contact,
          userId: demoUser.id
        });
      }
      console.log(`Seeded demo user (demo@bridges.app) with ${SAMPLE_CONTACTS.length} contacts`);
    }
    const test1Exists = existingUsers.some((u) => u.email === "test1@bridges.app");
    if (!test1Exists) {
      console.log("Seeding test1 user with full circles...");
      const hashedPassword = await bcrypt2.hash("test123", 10);
      const [test1User] = await db.insert(users).values({
        email: "test1@bridges.app",
        password: hashedPassword,
        username: "test1"
      }).returning();
      const hangoutThresholds = [14, 28, 56, 84, 105];
      for (let i = 0; i < TEST1_CONTACTS.length; i++) {
        const c = TEST1_CONTACTS[i];
        const daysAgo = c.circleLevel === 1 ? Math.floor(Math.random() * 7) : c.circleLevel === 2 ? Math.floor(Math.random() * 30) : Math.floor(Math.random() * 120);
        const hangoutDaysAgo = c.circleLevel === 2 ? hangoutThresholds[i % hangoutThresholds.length] : c.circleLevel === 3 ? i % 3 === 0 ? 200 : i % 3 === 1 ? 100 : void 0 : Math.floor(Math.random() * 14);
        await db.insert(contacts).values({
          ...c,
          userId: test1User.id,
          lastContacted: new Date(Date.now() - daysAgo * DAY).toISOString(),
          lastHangout: hangoutDaysAgo ? new Date(Date.now() - hangoutDaysAgo * DAY).toISOString() : void 0,
          avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length]
        });
      }
      console.log(`Seeded test1 user (test1@bridges.app) with ${TEST1_CONTACTS.length} contacts`);
    }
    const completeExists = existingUsers.some((u) => u.email === "complete@bridges.app");
    if (!completeExists) {
      console.log("Seeding complete@bridges.app user...");
      const hashedPassword = await bcrypt2.hash("test123", 10);
      const [completeUser] = await db.insert(users).values({
        email: "complete@bridges.app",
        password: hashedPassword,
        username: "Complete User"
      }).returning();
      for (const contact of COMPLETE_CONTACTS) {
        await db.insert(contacts).values({
          ...contact,
          userId: completeUser.id
        });
      }
      const shareCode = makeShareCode();
      const [plan] = await db.insert(hangoutPlans).values({
        userId: completeUser.id,
        title: "Friday Night Dinner",
        description: "Let's catch up over dinner!",
        status: "finalized",
        shareCode,
        inviteeNames: ["Jamie Rivera", "Taylor Kim", "Morgan Lee"],
        surveyMode: "standard",
        includePlusOne: false
      }).returning();
      const [opt1] = await db.insert(hangoutOptions).values({
        planId: plan.id,
        label: "Friday 7pm at Casa Luna",
        questionType: "time"
      }).returning();
      await db.insert(hangoutOptions).values({
        planId: plan.id,
        label: "Saturday 6pm at The Terrace",
        questionType: "time"
      });
      await db.update(hangoutPlans).set({ finalizedOptionId: opt1.id }).where(eq3(hangoutPlans.id, plan.id));
      for (const voter of ["Jamie Rivera", "Taylor Kim", "Morgan Lee"]) {
        await db.insert(hangoutVotes).values({ optionId: opt1.id, planId: plan.id, voterName: voter, rank: 1 });
      }
      console.log(`Seeded complete@bridges.app with ${COMPLETE_CONTACTS.length} contacts + 1 finalized hangout`);
    }
    const halfExists = existingUsers.some((u) => u.email === "half@bridges.app");
    if (!halfExists) {
      console.log("Seeding half@bridges.app user...");
      const hashedPassword = await bcrypt2.hash("test123", 10);
      const [halfUser] = await db.insert(users).values({
        email: "half@bridges.app",
        password: hashedPassword,
        username: "Half User"
      }).returning();
      for (const contact of HALF_CONTACTS) {
        await db.insert(contacts).values({
          ...contact,
          userId: halfUser.id
        });
      }
      console.log(`Seeded half@bridges.app with ${HALF_CONTACTS.length} contacts`);
    }
    const freshExists = existingUsers.some((u) => u.email === "fresh@bridges.app");
    if (!freshExists) {
      console.log("Seeding fresh@bridges.app user...");
      const hashedPassword = await bcrypt2.hash("test123", 10);
      await db.insert(users).values({
        email: "fresh@bridges.app",
        password: hashedPassword,
        username: "Fresh User"
      });
      console.log("Seeded fresh@bridges.app with 0 contacts");
    }
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}
async function updateExistingContactsWithLabels() {
  try {
    const allContacts = await db.select().from(contacts);
    const labelMap = {};
    for (const c of SAMPLE_CONTACTS) {
      labelMap[c.name] = c.labels || [];
    }
    for (const c of TEST1_CONTACTS) {
      labelMap[c.name] = c.labels || [];
    }
    const hangoutMap = {};
    for (const c of SAMPLE_CONTACTS) {
      hangoutMap[c.name] = c.lastHangout;
    }
    let updated = 0;
    for (const contact of allContacts) {
      const newLabels = labelMap[contact.name];
      const newHangout = hangoutMap[contact.name];
      if (newLabels && newLabels.length > 0) {
        await db.update(contacts).set({ labels: newLabels }).where(eq3(contacts.id, contact.id));
        updated++;
      }
      if (newHangout) {
        await db.update(contacts).set({ lastHangout: newHangout }).where(eq3(contacts.id, contact.id));
      }
    }
    console.log(`Updated ${updated} existing contacts with labels and hangout dates`);
  } catch (err) {
    console.error("Error updating contacts:", err);
  }
}

// server/index.ts
init_db();

// server/contact-prompt-rollout.ts
var LEGACY_C3_PROMPT_BACKFILL_SQL = `
  UPDATE contacts
  SET empty_last_contact_prompt_due_at =
    CURRENT_TIMESTAMP + (14 + FLOOR(RANDOM() * 17)) * INTERVAL '1 day'
  WHERE circle_level = 3
    AND NULLIF(BTRIM(last_contacted), '') IS NULL
    AND empty_last_contact_prompt_due_at IS NULL
`;
var LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL = `
  UPDATE contacts
  SET empty_last_contact_prompt_due_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
  WHERE circle_level IN (1, 2)
    AND NULLIF(BTRIM(last_contacted), '') IS NULL
    AND created_at IS NULL
    AND empty_last_contact_prompt_due_at IS NULL
`;
async function migrateEmptyContactPromptDueDates(pool2, production) {
  await pool2.query(
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS empty_last_contact_prompt_due_at TIMESTAMP`
  );
  if (!production) return;
  const client = await pool2.connect();
  try {
    await client.query("BEGIN");
    await client.query(LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL);
    await client.query(LEGACY_C3_PROMPT_BACKFILL_SQL);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw error;
  } finally {
    client.release();
  }
}

// server/index.ts
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
}
function enforceJsonContentType(app2) {
  app2.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    if (!req.path.startsWith("/api")) {
      return next();
    }
    const ct = req.headers["content-type"] ?? "";
    if (!ct.includes("application/json")) {
      return res.status(415).json({ message: "Unsupported Media Type: requests must use application/json" });
    }
    next();
  });
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      log(`${req.method} ${path3} ${res.statusCode} in ${duration}ms`);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  const voteTemplatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "vote.html"
  );
  const votePageTemplate = fs2.existsSync(voteTemplatePath) ? fs2.readFileSync(voteTemplatePath, "utf-8") : null;
  const resetPasswordTemplatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "reset-password.html"
  );
  const resetPasswordTemplate = fs2.existsSync(resetPasswordTemplatePath) ? fs2.readFileSync(resetPasswordTemplatePath, "utf-8") : null;
  const privacyPolicyTemplatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "privacy-policy.html"
  );
  const privacyPolicyTemplate = fs2.existsSync(privacyPolicyTemplatePath) ? fs2.readFileSync(privacyPolicyTemplatePath, "utf-8") : null;
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path === "/reset-password" && resetPasswordTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(resetPasswordTemplate);
    }
    if (req.path === "/privacy" && privacyPolicyTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(privacyPolicyTemplate);
    }
    if (req.path.startsWith("/vote/") && votePageTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(votePageTemplate);
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path2.resolve(process.cwd(), "assets")));
  app2.use(express.static(path2.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
async function ensureNotificationLogTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        contact_id VARCHAR NOT NULL,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS notif_type TEXT`);
  } catch (err) {
    console.error("[startup] Failed to create notification_log table:", err);
  }
}
async function ensureUserNotifPreferenceColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suggestion_notif_frequency TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suggestion_notif_time TEXT`);
  } catch (err) {
    console.error("[startup] Failed to add suggestion notif columns:", err);
  }
}
async function ensureHasPasswordColumn() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_password BOOLEAN NOT NULL DEFAULT TRUE`);
  } catch (err) {
    console.error("[startup] Failed to add has_password column:", err);
  }
}
async function ensureLastProfilePushAtColumn() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_profile_push_at TIMESTAMP`);
  } catch (err) {
    console.error("[startup] Failed to add last_profile_push_at column:", err);
  }
}
async function ensurePasswordResetTokensTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
      ON password_reset_tokens (token_hash)
    `);
  } catch (err) {
    console.error("[startup] Failed to create password_reset_tokens table:", err);
  }
}
async function ensureHangoutInvitesSentAtColumn() {
  try {
    await pool.query(
      `ALTER TABLE hangout_plans ADD COLUMN IF NOT EXISTS invites_sent_at TIMESTAMP`
    );
  } catch (err) {
    console.error("[startup] Failed to add invites_sent_at column:", err);
  }
}
async function ensureHangoutVoterTokensColumn() {
  try {
    await pool.query(
      `ALTER TABLE hangout_plans ADD COLUMN IF NOT EXISTS voter_tokens JSONB NOT NULL DEFAULT '{}'::jsonb`
    );
  } catch (err) {
    console.error("[startup] Failed to add voter_tokens column:", err);
  }
}
async function ensureProviderSubColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users (google_sub) WHERE google_sub IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub_unique ON users (apple_sub) WHERE apple_sub IS NOT NULL`);
  } catch (err) {
    console.error("[startup] Failed to add provider sub columns:", err);
  }
}
async function ensureUserCreatedAtColumn() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP`);
    await pool.query(
      `UPDATE users SET created_at = '2020-01-01T00:00:00Z'::timestamp WHERE created_at IS NULL`
    );
    await pool.query(`ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW()`);
  } catch (err) {
    console.error("[startup] Failed to add/backfill users.created_at column:", err);
  }
}
async function ensureEmptyLastContactPromptDueAtColumn() {
  try {
    await migrateEmptyContactPromptDueDates(pool, process.env.NODE_ENV === "production");
  } catch (err) {
    console.error("[startup] Failed to add/backfill empty contact prompt due dates:", err);
  }
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  enforceJsonContentType(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  await ensureNotificationLogTable();
  await ensureUserNotifPreferenceColumns();
  await ensureHasPasswordColumn();
  await ensureLastProfilePushAtColumn();
  await ensurePasswordResetTokensTable();
  await ensureHangoutInvitesSentAtColumn();
  await ensureHangoutVoterTokensColumn();
  await ensureProviderSubColumns();
  await ensureUserCreatedAtColumn();
  await ensureEmptyLastContactPromptDueAtColumn();
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  if (process.env.NODE_ENV !== "production") {
    await seedDatabase();
    await updateExistingContactsWithLabels();
  }
  initPromptSync().catch((err) => {
    console.log("[prompts-sync] Init failed (non-fatal):", err.message);
  });
  scheduleDailyNotifications();
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
