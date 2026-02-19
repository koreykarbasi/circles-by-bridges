import { db } from "./db";
import { contacts, users, hangoutPlans, hangoutOptions, hangoutVotes } from "@shared/schema";
import type {
  User, InsertUser, Contact, InsertContact,
  HangoutPlan, InsertHangoutPlan,
  HangoutOption, InsertHangoutOption,
  HangoutVote, InsertHangoutVote,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getContactsByUserId(userId: string): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
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

  async getContactsByUserId(userId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.userId, userId));
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
}

export const storage = new DatabaseStorage();
