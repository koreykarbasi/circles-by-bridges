import type { Express, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { contacts } from "@shared/schema";
import { isReminderMonthDay, REACH_OUT_LABEL } from "@shared/reach-out-reminder";

const requestSchema = z.object({ date: z.string().refine(isReminderMonthDay) }).strict();

/** Append under the existing contact-edit lock; never write a stale whole contact. */
export async function addReachOutReminder(userId: string, id: string, date: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), 245001)`);
    const [current] = await tx.select().from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId))).for("update");
    if (!current) return undefined;
    if (current.circleLevel !== 4) return { wrongCircle: true as const };
    const reminder = { label: REACH_OUT_LABEL, date };
    const previous = Array.isArray(current.customReminders) ? current.customReminders : [];
    const alreadyAdded = previous.some((item: any) => item?.label === reminder.label && item?.date === reminder.date);
    if (alreadyAdded) return { contact: current, reminder };
    const [contact] = await tx.update(contacts).set({ customReminders: [...previous, reminder] })
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId))).returning();
    return { contact, reminder };
  });
}

export function registerReachOutReminderRoutes(app: Express, requireAuth: RequestHandler) {
  app.post("/api/contacts/:id/reach-out-reminder", requireAuth, async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose a valid reminder date." });
    try {
      const result = await addReachOutReminder(req.session.userId!, String(req.params.id), parsed.data.date);
      if (!result) return res.status(404).json({ message: "Contact not found" });
      if ("wrongCircle" in result) return res.status(400).json({ message: "This shortcut is only available for Circle 4 contacts." });
      return res.json(result);
    } catch {
      return res.status(500).json({ message: "Could not save the reminder. Please try again." });
    }
  });
}
