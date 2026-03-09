import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { getPrompts, syncFromSheet } from "./prompts-sync";

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
      const contact = await storage.getContact(req.params.id);
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
      const contact = await storage.createContact({
        ...req.body,
        userId: req.session.userId!,
      });
      res.status(201).json(contact);
    } catch (err) {
      console.error("Error creating contact:", err);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.put("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getContact(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const contact = await storage.updateContact(req.params.id, req.body);
      res.json(contact);
    } catch (err) {
      console.error("Error updating contact:", err);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getContact(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      await storage.deleteContact(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting contact:", err);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  app.post("/api/contacts/:id/mark-contacted", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getContact(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const contact = await storage.updateContact(req.params.id, {
        lastContacted: new Date().toISOString(),
      });
      res.json(contact);
    } catch (err) {
      console.error("Error marking contact:", err);
      res.status(500).json({ message: "Failed to mark contact" });
    }
  });

  // ---- Hangout Plans ----

  function generateShareCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  app.get("/api/hangouts", requireAuth, async (req, res) => {
    try {
      const plans = await storage.getHangoutPlansByUserId(req.session.userId!);
      const plansWithOptions = await Promise.all(
        plans.map(async (plan) => {
          const options = await storage.getOptionsByPlanId(plan.id);
          const votes = await storage.getVotesByPlanId(plan.id);
          return {
            ...plan,
            options: options.map((opt) => ({
              ...opt,
              voteCount: votes.filter((v) => v.optionId === opt.id && v.vote).length,
              votes: votes.filter((v) => v.optionId === opt.id),
            })),
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
      const plan = await storage.getHangoutPlan(req.params.id);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const options = await storage.getOptionsByPlanId(plan.id);
      const votes = await storage.getVotesByPlanId(plan.id);
      res.json({
        ...plan,
        options: options.map((opt) => ({
          ...opt,
          voteCount: votes.filter((v) => v.optionId === opt.id && v.vote).length,
          votes: votes.filter((v) => v.optionId === opt.id),
        })),
      });
    } catch (err) {
      console.error("Error fetching hangout:", err);
      res.status(500).json({ message: "Failed to fetch hangout" });
    }
  });

  app.post("/api/hangouts", requireAuth, async (req, res) => {
    try {
      const { title, description, inviteeNames, options } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
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
          });
          createdOptions.push({ ...option, voteCount: 0, votes: [] });
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
      const existing = await storage.getHangoutPlan(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const { title, description, status, finalizedOptionId, inviteeNames } = req.body;
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;
      if (finalizedOptionId !== undefined) updateData.finalizedOptionId = finalizedOptionId;
      if (inviteeNames !== undefined) updateData.inviteeNames = inviteeNames;

      const plan = await storage.updateHangoutPlan(req.params.id, updateData);
      const options = await storage.getOptionsByPlanId(plan!.id);
      const votes = await storage.getVotesByPlanId(plan!.id);
      res.json({
        ...plan,
        options: options.map((opt) => ({
          ...opt,
          voteCount: votes.filter((v) => v.optionId === opt.id && v.vote).length,
          votes: votes.filter((v) => v.optionId === opt.id),
        })),
      });
    } catch (err) {
      console.error("Error updating hangout:", err);
      res.status(500).json({ message: "Failed to update hangout" });
    }
  });

  app.delete("/api/hangouts/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getHangoutPlan(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      await storage.deleteHangoutPlan(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting hangout:", err);
      res.status(500).json({ message: "Failed to delete hangout" });
    }
  });

  app.post("/api/hangouts/:id/options", requireAuth, async (req, res) => {
    try {
      const plan = await storage.getHangoutPlan(req.params.id);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Hangout not found" });
      }
      const { label, dateTime, activity, location } = req.body;
      if (!label) {
        return res.status(400).json({ message: "Label is required" });
      }
      const option = await storage.createHangoutOption({
        planId: plan.id,
        label,
        dateTime: dateTime || null,
        activity: activity || null,
        location: location || null,
      });
      res.status(201).json({ ...option, voteCount: 0, votes: [] });
    } catch (err) {
      console.error("Error adding option:", err);
      res.status(500).json({ message: "Failed to add option" });
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
        options: options.map((opt) => ({
          ...opt,
          voteCount: votes.filter((v) => v.optionId === opt.id && v.vote).length,
          votes: votes.filter((v) => v.optionId === opt.id),
        })),
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
      const { voterName, votes } = req.body;
      if (!voterName || !votes || !Array.isArray(votes)) {
        return res.status(400).json({ message: "Voter name and votes are required" });
      }

      const createdVotes = [];
      for (const v of votes) {
        const vote = await storage.createHangoutVote({
          optionId: v.optionId,
          planId: plan.id,
          voterName,
          vote: v.vote ?? true,
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
