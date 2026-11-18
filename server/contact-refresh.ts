import type { Express, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { contacts } from "@shared/schema";
import { fillOnlyEmptyChanges, type ContactRefreshChanges } from "@shared/contact-refresh";

const changesSchema = z.object({
  email: z.string().trim().min(1).max(320).optional(),
  phone: z.string().trim().min(1).max(255).optional(),
  photoUri: z.string().trim().min(1).max(7 * 1024 * 1024).optional(),
  birthday: z.string().regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])$/).optional(),
}).strict();

/** Serialize with normal contact edits and re-check fields after taking the lock. */
export async function fillContactFromPhone(userId: string, id: string, proposed: ContactRefreshChanges) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), 245001)`);
    const [current] = await tx.select().from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId))).for("update");
    if (!current) return undefined;
    const changes = fillOnlyEmptyChanges(current, proposed);
    const appliedFields = Object.keys(changes);
    if (!appliedFields.length) return { contact: current, appliedFields };
    const [contact] = await tx.update(contacts).set(changes)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId))).returning();
    return { contact, appliedFields };
  });
}

export function registerContactRefreshRoutes(app: Express, requireAuth: RequestHandler) {
  app.post("/api/contacts/:id/refresh-from-phone", requireAuth, async (req, res) => {
    const parsed = changesSchema.safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length) {
      return res.status(400).json({ message: "Provide only missing email, phone, photo, or birthday details." });
    }
    try {
      const result = await fillContactFromPhone(req.session.userId!, String(req.params.id), parsed.data);
      if (!result) return res.status(404).json({ message: "Contact not found" });
      return res.json(result);
    } catch (error) {
      console.error("Could not refresh contact details:", error instanceof Error ? error.name : "Unknown error");
      return res.status(500).json({ message: "Could not save refreshed details. Please try again." });
    }
  });
}
