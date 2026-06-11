import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  profilePhotoUri: text("profile_photo_uri"),
  username: text("username"),
  pushToken: text("push_token"),
  notificationTimezone: text("notification_timezone"),
  suggestionNotifFrequency: text("suggestion_notif_frequency"),
  suggestionNotifTime: text("suggestion_notif_time"),
  hasPassword: boolean("has_password").notNull().default(true),
});

export const contacts = pgTable("contacts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  circleLevel: integer("circle_level").notNull(),
  interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
  birthday: text("birthday"),
  lastContacted: text("last_contacted"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const hangoutPlans = pgTable("hangout_plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  shareCode: text("share_code").notNull().unique(),
  finalizedOptionId: varchar("finalized_option_id"),
  finalizedTimeOptionId: varchar("finalized_time_option_id"),
  inviteeNames: text("invitee_names").array().notNull().default(sql`'{}'::text[]`),
  surveyMode: text("survey_mode").notNull().default("standard"),
  fixedActivity: text("fixed_activity"),
  deadline: text("deadline"),
  includePlusOne: boolean("include_plus_one").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const hangoutOptions = pgTable("hangout_options", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").references(() => hangoutPlans.id),
  label: text("label").notNull(),
  dateTime: text("date_time"),
  activity: text("activity"),
  location: text("location"),
  questionType: text("question_type").notNull().default("option"),
});

export const hangoutVotes = pgTable("hangout_votes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").references(() => hangoutOptions.id),
  planId: varchar("plan_id").references(() => hangoutPlans.id),
  voterName: text("voter_name").notNull(),
  rank: integer("rank"),
  bringsGuests: boolean("brings_guests"),
  plusOneCount: integer("plus_one_count"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  planVoterOptionUnique: uniqueIndex("hangout_votes_plan_voter_option_unique")
    .on(table.planId, table.voterName, table.optionId),
}));

export const notificationLog = pgTable("notification_log", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  contactId: varchar("contact_id").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});

export const insertHangoutPlanSchema = createInsertSchema(hangoutPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHangoutOptionSchema = createInsertSchema(hangoutOptions).omit({
  id: true,
});

export const insertHangoutVoteSchema = createInsertSchema(hangoutVotes).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type HangoutPlan = typeof hangoutPlans.$inferSelect;
export type InsertHangoutPlan = z.infer<typeof insertHangoutPlanSchema>;
export type HangoutOption = typeof hangoutOptions.$inferSelect;
export type InsertHangoutOption = z.infer<typeof insertHangoutOptionSchema>;
export type HangoutVote = typeof hangoutVotes.$inferSelect;
export type InsertHangoutVote = z.infer<typeof insertHangoutVoteSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
