import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { getPrompts, syncFromSheet } from "./prompts-sync";
import type { InsertContact } from "@shared/schema";

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

const CONTACT_WRITABLE_FIELDS = new Set([
  "name", "circleLevel", "interests", "labels", "birthday",
  "lastContacted", "lastHangout", "notes", "phone", "photoUri",
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

function generateIcs(title: string, timeLabel: string, locationLabel: string | null): string {
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `bridges-${Date.now()}@bridges.app`;

  // Try to parse a date from the time label, fallback to 1 week from now
  let dtStart = "";
  let dtEnd = "";
  try {
    const parsed = new Date(timeLabel);
    if (!isNaN(parsed.getTime())) {
      dtStart = parsed.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const end = new Date(parsed.getTime() + 2 * 60 * 60 * 1000);
      dtEnd = end.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    }
  } catch (_) {}

  if (!dtStart) {
    const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    dtStart = future.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const end = new Date(future.getTime() + 2 * 60 * 60 * 1000);
    dtEnd = end.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
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

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", 1);
  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool: pool as any,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "bridges-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "none" as const,
        secure: true,
      },
    }),
  );

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email: email.toLowerCase().trim(),
        password: hashedPassword,
      });
      if (name) {
        await storage.updateUser(user.id, { username: name.trim() });
      }
      const updated = name ? await storage.getUser(user.id) : user;
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Registration failed" });
        }
        res.status(201).json({ id: updated!.id, email: updated!.email, name: updated!.username, profilePhotoUri: updated!.profilePhotoUri });
      });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
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
        res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri });
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/guest", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Name is required" });
      }
      const guestEmail = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 6)}@bridges.guest`;
      const hashedPassword = await bcrypt.hash(Math.random().toString(36), 10);
      const user = await storage.createUser({
        email: guestEmail,
        password: hashedPassword,
      });
      await storage.updateUser(user.id, { username: name.trim() });
      const updated = await storage.getUser(user.id);
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Guest login failed" });
        }
        res.status(201).json({ id: updated!.id, email: updated!.email, name: updated!.username, profilePhotoUri: updated!.profilePhotoUri });
      });
    } catch (err) {
      console.error("Guest login error:", err);
      res.status(500).json({ message: "Guest login failed" });
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

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri });
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { profilePhotoUri, name } = req.body;
      const updateData: any = {};
      if (profilePhotoUri !== undefined) updateData.profilePhotoUri = profilePhotoUri;
      if (name !== undefined) updateData.username = name;
      const user = await storage.updateUser(req.session.userId!, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, email: user.email, name: user.username, profilePhotoUri: user.profilePhotoUri });
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
        lastContacted: safe.lastContacted ?? new Date().toISOString(),
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
      const contact = await storage.updateContact(id, {
        lastContacted: new Date().toISOString(),
      });
      res.json(contact);
    } catch (err) {
      console.error("Error marking contact:", err);
      res.status(500).json({ message: "Failed to mark contact" });
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
      if (!Array.isArray(inviteeNames)) {
        return bad(res, "inviteeNames is required and must be an array");
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
      const { title, description, status, finalizedOptionId, inviteeNames } = req.body;
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
      if (inviteeNames !== undefined) updateData.inviteeNames = inviteeNames;

      const plan = await storage.updateHangoutPlan(id, updateData);
      const options = await storage.getOptionsByPlanId(plan!.id);
      const votes = await storage.getVotesByPlanId(plan!.id);
      const scored = computeBordaScores(options, votes);
      res.json({
        ...plan,
        options: scored,
        bestRecommendation: computeBestRecommendation(scored, votes, plan!.includePlusOne),
      });
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
      if (!plan || plan.status !== "finalized" || !plan.finalizedOptionId) {
        return res.status(404).json({ message: "No finalized hangout found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const finalizedOption = options.find((o) => o.id === plan.finalizedOptionId);
      const timeOption = options.find((o) => o.questionType === "time" && o.id === plan.finalizedOptionId)
        || options.find((o) => o.questionType === "time");
      const locationOption = options.find((o) => o.questionType === "location");

      const timeLabel = finalizedOption?.label || timeOption?.label || "TBD";
      const locationLabel = plan.fixedActivity
        ? (locationOption?.label || null)
        : (finalizedOption?.activity || finalizedOption?.location || null);

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

      res.json({
        id: plan.id,
        title: plan.title,
        description: plan.description,
        status: plan.status,
        shareCode: plan.shareCode,
        creatorName: creator?.username || "Someone",
        inviteeNames: plan.inviteeNames,
        finalizedOptionId: plan.finalizedOptionId,
        surveyMode: plan.surveyMode,
        fixedActivity: plan.fixedActivity,
        deadline: plan.deadline,
        includePlusOne: plan.includePlusOne,
        options: scored,
        bestRecommendation: computeBestRecommendation(scored, votes, plan.includePlusOne),
      });
    } catch (err) {
      console.error("Error fetching vote page:", err);
      res.status(500).json({ message: "Failed to fetch hangout" });
    }
  });

  app.post("/api/vote/:shareCode", async (req, res) => {
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

      const createdVotes = [];
      for (const v of votes) {
        const vote = await storage.createHangoutVote({
          optionId: v.optionId,
          planId: plan.id,
          voterName,
          rank: v.rank ?? null,
          bringsGuests: bringsGuests ?? null,
          plusOneCount: plusOneCount ?? null,
        });
        createdVotes.push(vote);
      }
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

  const httpServer = createServer(app);
  return httpServer;
}
