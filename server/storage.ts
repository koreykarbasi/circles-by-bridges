import { db } from "./db";
import { contacts, users, hangoutPlans, hangoutOptions, hangoutVotes, passwordResetTokens } from "@shared/schema";
import type {
  User, InsertUser, Contact, InsertContact,
  HangoutPlan, InsertHangoutPlan,
  HangoutOption, InsertHangoutOption,
  HangoutVote, InsertHangoutVote,
  PasswordResetToken,
} from "@shared/schema";
import { eq, and, asc, sql as drizzleSql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleSub(sub: string): Promise<User | undefined>;
  getUserByAppleSub(sub: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getContactsByUserId(userId: string): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
  reorderContacts(userId: string, contactIds: string[]): Promise<void>;
  getHangoutPlansByUserId(userId: string): Promise<HangoutPlan[]>;
  getHangoutPlan(id: string): Promise<HangoutPlan | undefined>;
  getHangoutPlanByShareCode(shareCode: string): Promise<HangoutPlan | undefined>;
  createHangoutPlan(data: InsertHangoutPlan): Promise<HangoutPlan>;
  updateHangoutPlan(id: string, data: Partial<InsertHangoutPlan>): Promise<HangoutPlan | undefined>;
  deleteHangoutPlan(id: string): Promise<boolean>;
  getOptionsByPlanId(planId: string): Promise<HangoutOption[]>;
  createHangoutOption(data: InsertHangoutOption): Promise<HangoutOption>;
  deleteHangoutOption(id: string): Promise<boolean>;
  getVotesByPlanId(planId: string): Promise<HangoutVote[]>;
  getVotesByOptionId(optionId: string): Promise<HangoutVote[]>;
  createHangoutVote(data: InsertHangoutVote): Promise<HangoutVote>;
  deleteVotesByPlanId(planId: string): Promise<boolean>;
  deleteVotesByPlanIdAndVoterName(planId: string, voterName: string): Promise<void>;
  replaceVotesForVoter(planId: string, voterName: string, newVotes: InsertHangoutVote[]): Promise<HangoutVote[]>;
  replaceVotesForVoterCapped(
    planId: string,
    voterName: string,
    newVotes: InsertHangoutVote[],
    guestOpts: { isGuest: boolean; inviteeNames: string[]; guestCap: number } | null,
  ): Promise<{ capped: true } | { capped: false; votes: HangoutVote[] }>;
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken>;
  getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: string): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<void>;
  deleteUser(id: string): Promise<boolean>;
  clearPushTokenFromOtherUsers(currentUserId: string, token: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleSub(sub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleSub, sub));
    return user;
  }

  async getUserByAppleSub(sub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.appleSub, sub));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async clearPushTokenFromOtherUsers(currentUserId: string, token: string): Promise<void> {
    await db
      .update(users)
      .set({ pushToken: null })
      .where(
        and(
          eq(users.pushToken, token),
          // Use drizzleSql to express "id != currentUserId"
          drizzleSql`${users.id} != ${currentUserId}`,
        ),
      );
  }

  async getContactsByUserId(userId: string): Promise<Contact[]> {
    return db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(
        asc(drizzleSql`CASE WHEN ${contacts.sortOrder} IS NULL THEN 1 ELSE 0 END`),
        asc(contacts.sortOrder),
        asc(contacts.createdAt),
      );
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db
      .update(contacts)
      .set(data)
      .where(eq(contacts.id, id))
      .returning();
    return contact;
  }

  async deleteContact(id: string): Promise<boolean> {
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return result.length > 0;
  }

  async reorderContacts(userId: string, contactIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < contactIds.length; i++) {
        await tx
          .update(contacts)
          .set({ sortOrder: i })
          .where(and(eq(contacts.id, contactIds[i]), eq(contacts.userId, userId)));
      }
    });
  }

  async getHangoutPlansByUserId(userId: string): Promise<HangoutPlan[]> {
    return db.select().from(hangoutPlans).where(eq(hangoutPlans.userId, userId));
  }

  async getHangoutPlan(id: string): Promise<HangoutPlan | undefined> {
    const [plan] = await db.select().from(hangoutPlans).where(eq(hangoutPlans.id, id));
    return plan;
  }

  async getHangoutPlanByShareCode(shareCode: string): Promise<HangoutPlan | undefined> {
    const [plan] = await db.select().from(hangoutPlans).where(eq(hangoutPlans.shareCode, shareCode));
    return plan;
  }

  async createHangoutPlan(data: InsertHangoutPlan): Promise<HangoutPlan> {
    const [plan] = await db.insert(hangoutPlans).values(data).returning();
    return plan;
  }

  async updateHangoutPlan(id: string, data: Partial<InsertHangoutPlan>): Promise<HangoutPlan | undefined> {
    const [plan] = await db
      .update(hangoutPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hangoutPlans.id, id))
      .returning();
    return plan;
  }

  async deleteHangoutPlan(id: string): Promise<boolean> {
    await db.delete(hangoutVotes).where(eq(hangoutVotes.planId, id));
    const options = await this.getOptionsByPlanId(id);
    for (const opt of options) {
      await db.delete(hangoutVotes).where(eq(hangoutVotes.optionId, opt.id));
    }
    await db.delete(hangoutOptions).where(eq(hangoutOptions.planId, id));
    const result = await db.delete(hangoutPlans).where(eq(hangoutPlans.id, id)).returning();
    return result.length > 0;
  }

  async getOptionsByPlanId(planId: string): Promise<HangoutOption[]> {
    return db.select().from(hangoutOptions).where(eq(hangoutOptions.planId, planId));
  }

  async createHangoutOption(data: InsertHangoutOption): Promise<HangoutOption> {
    const [option] = await db.insert(hangoutOptions).values(data).returning();
    return option;
  }

  async deleteHangoutOption(id: string): Promise<boolean> {
    await db.delete(hangoutVotes).where(eq(hangoutVotes.optionId, id));
    const result = await db.delete(hangoutOptions).where(eq(hangoutOptions.id, id)).returning();
    return result.length > 0;
  }

  async getVotesByPlanId(planId: string): Promise<HangoutVote[]> {
    return db.select().from(hangoutVotes).where(eq(hangoutVotes.planId, planId));
  }

  async getVotesByOptionId(optionId: string): Promise<HangoutVote[]> {
    return db.select().from(hangoutVotes).where(eq(hangoutVotes.optionId, optionId));
  }

  async createHangoutVote(data: InsertHangoutVote): Promise<HangoutVote> {
    const [vote] = await db.insert(hangoutVotes).values(data).returning();
    return vote;
  }

  async deleteVotesByPlanId(planId: string): Promise<boolean> {
    const result = await db.delete(hangoutVotes).where(eq(hangoutVotes.planId, planId)).returning();
    return result.length >= 0;
  }

  async deleteVotesByPlanIdAndVoterName(planId: string, voterName: string): Promise<void> {
    await db.delete(hangoutVotes).where(
      and(eq(hangoutVotes.planId, planId), eq(hangoutVotes.voterName, voterName))
    );
  }

  async replaceVotesForVoter(planId: string, voterName: string, newVotes: InsertHangoutVote[]): Promise<HangoutVote[]> {
    return db.transaction(async (tx) => {
      // Match case-insensitively so a voter can't accumulate multiple stored
      // ballots via case variants (Alice/alice/ALICE) of the same name.
      await tx.delete(hangoutVotes).where(
        and(
          eq(hangoutVotes.planId, planId),
          drizzleSql`lower(${hangoutVotes.voterName}) = lower(${voterName})`,
        )
      );
      if (newVotes.length === 0) return [];
      return tx.insert(hangoutVotes).values(newVotes).returning();
    });
  }

  async replaceVotesForVoterCapped(
    planId: string,
    voterName: string,
    newVotes: InsertHangoutVote[],
    guestOpts: { isGuest: boolean; inviteeNames: string[]; guestCap: number } | null,
  ): Promise<{ capped: true } | { capped: false; votes: HangoutVote[] }> {
    return db.transaction(async (tx) => {
      // Acquire a row-level lock on the hangout plan for the duration of this
      // transaction. This serializes concurrent vote submissions for the same
      // plan so the guest-count check and the insert are atomic — closing the
      // race window that allowed concurrent requests to all pass the cap check
      // before any of them had written to the database.
      await tx.execute(drizzleSql`SELECT id FROM hangout_plans WHERE id = ${planId} FOR UPDATE`);

      if (guestOpts) {
        const { isGuest, inviteeNames, guestCap } = guestOpts;
        const canonicalVoterKey = voterName.toLowerCase().trim();

        // Re-read existing votes inside the transaction (after the lock) so
        // we see the true current state, not a stale pre-lock snapshot.
        const existingVotes = await tx.select().from(hangoutVotes).where(eq(hangoutVotes.planId, planId));
        const voterAlreadySubmitted = existingVotes.some(
          (v) => v.voterName.toLowerCase().trim() === canonicalVoterKey,
        );

        if (isGuest) {
          if (!voterAlreadySubmitted) {
            const existingGuestKeys = new Set(
              existingVotes
                .map((v) => v.voterName.toLowerCase().trim())
                .filter((n) => !inviteeNames.some((inv) => inv.toLowerCase().trim() === n)),
            );
            if (existingGuestKeys.size >= guestCap) {
              return { capped: true };
            }
          }
        } else if (inviteeNames.length === 0) {
          // Legacy plans: apply the same cap to total distinct voters.
          if (!voterAlreadySubmitted) {
            const totalVoters = new Set(existingVotes.map((v) => v.voterName.toLowerCase().trim())).size;
            if (totalVoters >= guestCap) {
              return { capped: true };
            }
          }
        }
      }

      // Delete any existing ballot from this voter (case-insensitive) and
      // insert the new one atomically within the same locked transaction.
      await tx.delete(hangoutVotes).where(
        and(
          eq(hangoutVotes.planId, planId),
          drizzleSql`lower(${hangoutVotes.voterName}) = lower(${voterName})`,
        ),
      );
      if (newVotes.length === 0) return { capped: false, votes: [] };
      const votes = await tx.insert(hangoutVotes).values(newVotes).returning();
      return { capped: false, votes };
    });
  }

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return token;
  }

  async getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    return token;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.usedAt, null as any)
        )
      );
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete in FK-safe order: child rows first, then the user row.
    // Use raw SQL so we can do it in a single transaction without needing
    // Drizzle to know about every implicit dependency.
    const { pool } = await import("./db");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 1. Password reset tokens
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [id]);
      // 2. Notification log
      await client.query("DELETE FROM notification_log WHERE user_id = $1", [id]);
      // 3. Hangout votes (via plans belonging to this user)
      await client.query(
        "DELETE FROM hangout_votes WHERE plan_id IN (SELECT id FROM hangout_plans WHERE user_id = $1)",
        [id],
      );
      // 4. Hangout options
      await client.query(
        "DELETE FROM hangout_options WHERE plan_id IN (SELECT id FROM hangout_plans WHERE user_id = $1)",
        [id],
      );
      // 5. Hangout plans
      await client.query("DELETE FROM hangout_plans WHERE user_id = $1", [id]);
      // 6. Contacts
      await client.query("DELETE FROM contacts WHERE user_id = $1", [id]);
      // 7. Sessions
      await client.query("DELETE FROM session WHERE sess->>'userId' = $1", [id]);
      // 8. User row
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
}

export const storage = new DatabaseStorage();
